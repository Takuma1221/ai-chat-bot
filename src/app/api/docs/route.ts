import { z } from 'zod';
import db, { queries } from '@/lib/db';
import { splitIntoChunks, embedText } from '@/lib/rag';

const uploadSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .refine((name) => name.endsWith('.txt') || name.endsWith('.md'), {
      message: 'サポートされていないファイル形式です。.txt または .md のみ対応しています。',
    }),
  content: z.string().min(1),
});

// ドキュメント一覧を返す
export async function GET() {
  const docs = queries.getDocuments.all();
  return Response.json(docs);
}

// ドキュメントをアップロードしてチャンク化・embed・保存する
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'リクエストボディが不正です' }, { status: 400 });
  }

  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { name, content } = parsed.data;
  const docId = crypto.randomUUID();

  // チャンク分割とembeddingをすべて先に処理してからDBに保存する
  // （途中でAPI エラーが起きてもDBには何も残らない）
  let embeddings: Float32Array[];
  const chunks = splitIntoChunks(content);
  try {
    embeddings = await Promise.all(chunks.map((chunk) => embedText(chunk)));
  } catch {
    return Response.json({ error: 'ベクトル化に失敗しました。しばらくしてから再試行してください。' }, { status: 502 });
  }

  // すべてのembeddingが揃ったらトランザクションでまとめてDBに保存する
  const insert = db.transaction(() => {
    queries.insertDocument.run(docId, name, content, Date.now());
    for (let i = 0; i < chunks.length; i++) {
      const embeddingBuffer = Buffer.from(embeddings[i].buffer);
      queries.insertChunk.run(crypto.randomUUID(), docId, chunks[i], embeddingBuffer, i);
    }
  });
  insert();

  return Response.json({ id: docId, chunkCount: chunks.length }, { status: 201 });
}
