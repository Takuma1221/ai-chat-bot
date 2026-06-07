import { z } from 'zod';
import { queries } from '@/lib/db';
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
  const body = await request.json();
  const parsed = uploadSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { name, content } = parsed.data;
  const docId = crypto.randomUUID();

  // ドキュメントのメタ情報を保存
  queries.insertDocument.run(docId, name, content, Date.now());

  // テキストをチャンクに分割し、各チャンクをベクトル化して保存
  const chunks = splitIntoChunks(content);
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await embedText(chunks[i]);
    const embeddingBuffer = Buffer.from(embedding.buffer);
    queries.insertChunk.run(crypto.randomUUID(), docId, chunks[i], embeddingBuffer, i);
  }

  return Response.json({ id: docId, chunkCount: chunks.length }, { status: 201 });
}
