import { streamText } from 'ai';
import { z } from 'zod';
import { queries } from '@/lib/db';
import { embedText, searchChunks } from '@/lib/rag';
import { chatModel } from '@/lib/ai';

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .min(1),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'リクエストボディが不正です' }, { status: 400 });
  }

  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { messages } = parsed.data;
  const lastMessage = messages[messages.length - 1];

  if (lastMessage.role !== 'user') {
    return Response.json({ error: '最後のメッセージはユーザーのものである必要があります' }, { status: 400 });
  }

  // RAG: 質問をベクトル化して類似チャンクを検索する
  const queryEmbedding = await embedText(lastMessage.content);
  const allChunks = queries.getAllChunks.all() as Array<{
    id: string;
    document_id: string;
    content: string;
    embedding: Buffer;
    chunk_index: number;
  }>;
  const relevantChunks = searchChunks(queryEmbedding, allChunks, 3);

  // 参照資料をシステムプロンプトに埋め込む
  const systemPrompt =
    relevantChunks.length > 0
      ? [
          '以下の参考資料を元に質問に答えてください。',
          '参考資料に答えがない場合はその旨を伝えてください。',
          '',
          '【参考資料】',
          relevantChunks.map((c) => c.content).join('\n\n---\n\n'),
        ].join('\n')
      : 'ドキュメントがまだアップロードされていません。ユーザーにサイドバーからドキュメントをアップロードするよう案内してください。';

  // ユーザーメッセージをDBに保存する
  queries.insertMessage.run(
    crypto.randomUUID(),
    null,
    'user',
    lastMessage.content,
    Date.now()
  );

  // 直近20件のみAIに渡す（トークン節約）
  const recentMessages = messages.slice(-20) as Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;

  // Claude にストリーミングで回答させる
  const result = streamText({
    model: chatModel,
    system: systemPrompt,
    messages: recentMessages,
    onFinish: async ({ text }) => {
      // ストリーミング完了後にAIの応答をDBに保存する
      queries.insertMessage.run(crypto.randomUUID(), null, 'assistant', text, Date.now());
    },
  });

  return result.toDataStreamResponse();
}
