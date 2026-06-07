# AIチャットボット（ドキュメントQ&A）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** テキスト/Markdownファイルをアップロードし、その内容についてRAGでAIと対話できるドキュメントQ&Aチャットボットを構築する

**Architecture:** Next.js App Routerでフロント・バックエンドを統合。ドキュメントをbetter-sqlite3で管理し、OpenAIのtext-embedding-3-smallでベクトル化（※AnthropicはEmbedding APIを公開していないためOpenAIを使用）、JS側でコサイン類似度を計算してRAG検索を実現。チャット応答はVercel AI SDKのstreamText + Anthropic Claudeでストリーミング。

**Tech Stack:** Next.js 15 (App Router), TypeScript, Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`), Zod, SQLite (better-sqlite3), Tailwind CSS, Vitest

---

## ファイル構成

| ファイル | 役割 |
|---------|------|
| `src/lib/db.ts` | SQLite接続・スキーマ定義・クエリヘルパー |
| `src/lib/rag.ts` | チャンク分割・コサイン類似度・ベクトル検索・embed |
| `src/lib/ai.ts` | Vercel AI SDK クライアント設定 |
| `src/app/api/docs/route.ts` | GET（一覧）・POST（アップロード＋チャンク化＋embed） |
| `src/app/api/docs/[id]/route.ts` | DELETE（ドキュメント削除） |
| `src/app/api/chat/route.ts` | POST（RAG検索 + Claude ストリーミング応答） |
| `src/components/MessageBubble.tsx` | メッセージ1件の表示（参照元表示含む） |
| `src/components/Sidebar.tsx` | ドキュメント管理サイドバー |
| `src/components/Chat.tsx` | チャットエリア（useChat利用） |
| `src/app/page.tsx` | メイン画面（サイドバー＋チャット） |
| `src/app/layout.tsx` | ルートレイアウト |
| `src/__tests__/rag.test.ts` | RAGライブラリのユニットテスト |
| `vitest.config.ts` | Vitest設定 |
| `.env.local` | API Keys（gitignore済み） |

---

## Task 1: プロジェクトセットアップ

**Files:**
- Create: プロジェクトルート全体
- Modify: `next.config.ts`, `package.json`, `vitest.config.ts`, `.env.local`

- [ ] **Step 1: Next.jsプロジェクトを作成する**

既存のgitリポジトリにNext.jsをスキャフォールドする:

```bash
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --eslint \
  --no-git
```

プロンプトが出た場合はすべてデフォルト（Enter）で進める。

- [ ] **Step 2: 追加の依存パッケージをインストールする**

```bash
npm install better-sqlite3 ai @ai-sdk/anthropic @ai-sdk/openai zod
npm install --save-dev @types/better-sqlite3 vitest
```

- [ ] **Step 3: better-sqlite3をwebpackのexternalsに追加する**

`next.config.ts` を開き、以下の内容に置き換える:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.externals = [...(config.externals ?? []), 'better-sqlite3'];
    return config;
  },
};

export default nextConfig;
```

- [ ] **Step 4: Vitestの設定ファイルを作成する**

`vitest.config.ts` をプロジェクトルートに作成:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

`package.json` の `scripts` に追加:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: 環境変数ファイルを作成する**

`.env.local` を作成（`.gitignore` に `*.env.local` が含まれていることを確認）:

```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

実際のAPIキーを設定する。AnthropicキーはAnthropic Console、OpenAIキーはOpenAI Platformで取得する。

- [ ] **Step 6: 開発サーバーが起動できることを確認する**

```bash
npm run dev
```

`http://localhost:3000` でNext.jsのデフォルト画面が表示されればOK。`Ctrl+C` で停止する。

- [ ] **Step 7: コミットする**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with dependencies"
```

---

## Task 2: データベーススキーマとクエリヘルパー

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 1: `src/lib/` ディレクトリを作成する**

```bash
mkdir -p src/lib src/__tests__
```

- [ ] **Step 2: `src/lib/db.ts` を作成する**

```typescript
import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'data.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id          TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    embedding   BLOB NOT NULL,
    chunk_index INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    session_id TEXT,
    role       TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content    TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

export type Document = {
  id: string;
  name: string;
  content: string;
  created_at: number;
  chunk_count?: number;
};

export type Chunk = {
  id: string;
  document_id: string;
  content: string;
  embedding: Buffer;
  chunk_index: number;
};

export type Message = {
  id: string;
  session_id: string | null;
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
};

export const queries = {
  insertDocument: db.prepare<[string, string, string, number]>(
    'INSERT INTO documents (id, name, content, created_at) VALUES (?, ?, ?, ?)'
  ),

  insertChunk: db.prepare<[string, string, string, Buffer, number]>(
    'INSERT INTO chunks (id, document_id, content, embedding, chunk_index) VALUES (?, ?, ?, ?, ?)'
  ),

  getDocuments: db.prepare<[], Document>(`
    SELECT d.id, d.name, d.content, d.created_at, COUNT(c.id) as chunk_count
    FROM documents d
    LEFT JOIN chunks c ON c.document_id = d.id
    GROUP BY d.id
    ORDER BY d.created_at DESC
  `),

  getAllChunks: db.prepare<[], Chunk>(
    'SELECT id, document_id, content, embedding, chunk_index FROM chunks'
  ),

  deleteDocument: db.prepare<[string]>(
    'DELETE FROM documents WHERE id = ?'
  ),

  insertMessage: db.prepare<[string, string | null, string, string, number]>(
    'INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
  ),

  getRecentMessages: db.prepare<[number], Message>(
    'SELECT id, session_id, role, content, created_at FROM messages ORDER BY created_at DESC LIMIT ?'
  ),
};

export default db;
```

- [ ] **Step 3: DBファイルが自動生成されることを確認する**

```bash
node -e "require('./src/lib/db.ts')" 2>&1 || npx tsx -e "import './src/lib/db.ts'" 2>&1
```

エラーが出る場合、`npx tsx src/lib/db.ts` で確認する。`data.db` ファイルが作られていればOK。

実際の確認は次のTaskのテストで行うため、エラーがなければ先に進む。

- [ ] **Step 4: `data.db` を `.gitignore` に追加する**

`.gitignore` に以下が含まれていることを確認（Task 1の`.gitignore`に既に `*.db` が含まれているはず）:

```
data.db
```

- [ ] **Step 5: コミットする**

```bash
git add src/lib/db.ts
git commit -m "feat: add SQLite schema and query helpers"
```

---

## Task 3: チャンク分割のTDD実装

**Files:**
- Create: `src/__tests__/rag.test.ts`
- Create: `src/lib/rag.ts`（splitIntoChunks のみ）

- [ ] **Step 1: 失敗するテストを書く**

`src/__tests__/rag.test.ts` を作成:

```typescript
import { describe, it, expect } from 'vitest';
import { splitIntoChunks } from '@/lib/rag';

describe('splitIntoChunks', () => {
  it('空文字列は空配列を返す', () => {
    expect(splitIntoChunks('')).toEqual([]);
  });

  it('500文字未満のテキストは1チャンクを返す', () => {
    const text = 'Hello world';
    expect(splitIntoChunks(text)).toEqual(['Hello world']);
  });

  it('段落区切りでチャンクを分割する', () => {
    const text = '段落1の内容です。\n\n段落2の内容です。\n\n段落3の内容です。';
    const chunks = splitIntoChunks(text);
    expect(chunks.length).toBe(3);
    expect(chunks[0]).toBe('段落1の内容です。');
    expect(chunks[1]).toBe('段落2の内容です。');
    expect(chunks[2]).toBe('段落3の内容です。');
  });

  it('maxLength超えの段落は次のチャンクに分離する', () => {
    const longParagraph = 'あ'.repeat(300);
    const shortParagraph = 'い'.repeat(100);
    const text = `${longParagraph}\n\n${shortParagraph}`;
    const chunks = splitIntoChunks(text, 350);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(longParagraph);
    expect(chunks[1]).toBe(shortParagraph);
  });

  it('空の段落は無視する', () => {
    const text = '段落1\n\n\n\n段落2';
    const chunks = splitIntoChunks(text);
    expect(chunks.length).toBe(2);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npm test
```

Expected: `Cannot find module '@/lib/rag'` または similar エラー

- [ ] **Step 3: `splitIntoChunks` の最小実装を書く**

`src/lib/rag.ts` を作成:

```typescript
export function splitIntoChunks(text: string, maxLength = 500): string[] {
  if (!text.trim()) return [];

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (current.length > 0 && current.length + trimmed.length > maxLength) {
      chunks.push(current);
      current = trimmed;
    } else {
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npm test
```

Expected: `5 passed`

---

## Task 4: コサイン類似度のTDD実装

**Files:**
- Modify: `src/__tests__/rag.test.ts`（テスト追加）
- Modify: `src/lib/rag.ts`（関数追加）

- [ ] **Step 1: 失敗するテストを追加する**

`src/__tests__/rag.test.ts` に追記:

```typescript
import { splitIntoChunks, cosineSimilarity } from '@/lib/rag';

// ... 既存のテストの下に追加 ...

describe('cosineSimilarity', () => {
  it('同一ベクトルは1.0を返す', () => {
    const v = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('直交するベクトルは0を返す', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  it('反対方向のベクトルは-1.0を返す', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it('類似するベクトルは高いスコアを返す', () => {
    const a = new Float32Array([0.9, 0.1, 0.0]);
    const b = new Float32Array([0.8, 0.2, 0.0]);
    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.95);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npm test
```

Expected: `cosineSimilarity is not a function` または similar エラー

- [ ] **Step 3: `cosineSimilarity` を実装する**

`src/lib/rag.ts` に追記:

```typescript
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npm test
```

Expected: `9 passed`

---

## Task 5: searchChunks のTDD実装

**Files:**
- Modify: `src/__tests__/rag.test.ts`（テスト追加）
- Modify: `src/lib/rag.ts`（関数追加）

- [ ] **Step 1: 失敗するテストを追加する**

`src/__tests__/rag.test.ts` に追記（importに `searchChunks` を追加）:

```typescript
import { splitIntoChunks, cosineSimilarity, searchChunks } from '@/lib/rag';

// ... 既存テストの下に追加 ...

describe('searchChunks', () => {
  const makeChunk = (id: string, embedding: number[], content = 'content') => ({
    id,
    document_id: 'doc1',
    content,
    embedding: Buffer.from(new Float32Array(embedding).buffer),
    chunk_index: 0,
  });

  it('最も類似したチャンクをスコア順で返す', () => {
    const chunks = [
      makeChunk('a', [1, 0, 0], 'チャンクA'),
      makeChunk('b', [0, 1, 0], 'チャンクB'),
      makeChunk('c', [0.9, 0.1, 0], 'チャンクC'),
    ];
    const query = new Float32Array([1, 0, 0]);
    const results = searchChunks(query, chunks, 2);

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('a');
    expect(results[1].id).toBe('c');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('チャンクが0件のとき空配列を返す', () => {
    const query = new Float32Array([1, 0, 0]);
    expect(searchChunks(query, [], 3)).toEqual([]);
  });

  it('topK がチャンク数より大きくても全件返す', () => {
    const chunks = [makeChunk('a', [1, 0, 0])];
    const query = new Float32Array([1, 0, 0]);
    expect(searchChunks(query, chunks, 10)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npm test
```

Expected: `searchChunks is not a function`

- [ ] **Step 3: `searchChunks` を実装する**

`src/lib/rag.ts` に追記:

```typescript
type RawChunk = {
  id: string;
  document_id: string;
  content: string;
  embedding: Buffer;
  chunk_index: number;
};

export type SearchResult = {
  id: string;
  document_id: string;
  content: string;
  score: number;
};

export function searchChunks(
  queryEmbedding: Float32Array,
  chunks: RawChunk[],
  topK = 3
): SearchResult[] {
  return chunks
    .map((chunk) => {
      const emb = new Float32Array(
        chunk.embedding.buffer,
        chunk.embedding.byteOffset,
        chunk.embedding.byteLength / Float32Array.BYTES_PER_ELEMENT
      );
      return {
        id: chunk.id,
        document_id: chunk.document_id,
        content: chunk.content,
        score: cosineSimilarity(queryEmbedding, emb),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npm test
```

Expected: `12 passed`

- [ ] **Step 5: コミットする**

```bash
git add src/__tests__/rag.test.ts src/lib/rag.ts vitest.config.ts
git commit -m "feat: implement RAG utilities (chunk, cosine similarity, search) with tests"
```

---

## Task 6: embedText の実装（src/lib/rag.ts に追加）

**Files:**
- Modify: `src/lib/rag.ts`

- [ ] **Step 1: `embedText` 関数を `src/lib/rag.ts` の先頭に追加する**

ファイルの先頭に import を追加し、関数を追加する:

```typescript
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

// ... splitIntoChunks, cosineSimilarity, searchChunks の後に追加 ...

export async function embedText(text: string): Promise<Float32Array> {
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: text,
  });
  return new Float32Array(embedding);
}
```

- [ ] **Step 2: テストが引き続き通ることを確認する**

```bash
npm test
```

Expected: `12 passed`（embedText はAPIを呼ぶため単体テストはスキップ）

- [ ] **Step 3: コミットする**

```bash
git add src/lib/rag.ts
git commit -m "feat: add embedText using OpenAI text-embedding-3-small"
```

---

## Task 7: AI クライアント設定（src/lib/ai.ts）

**Files:**
- Create: `src/lib/ai.ts`

- [ ] **Step 1: `src/lib/ai.ts` を作成する**

```typescript
import { anthropic } from '@ai-sdk/anthropic';

export const chatModel = anthropic('claude-3-5-sonnet-20241022');
```

- [ ] **Step 2: コミットする**

```bash
git add src/lib/ai.ts
git commit -m "feat: configure Anthropic AI client"
```

---

## Task 8: ドキュメントAPI

**Files:**
- Create: `src/app/api/docs/route.ts`
- Create: `src/app/api/docs/[id]/route.ts`

- [ ] **Step 1: `src/app/api/docs/route.ts` を作成する**

```typescript
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

export async function GET() {
  const docs = queries.getDocuments.all();
  return Response.json(docs);
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = uploadSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { name, content } = parsed.data;
  const docId = crypto.randomUUID();

  queries.insertDocument.run(docId, name, content, Date.now());

  const chunks = splitIntoChunks(content);
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await embedText(chunks[i]);
    const embeddingBuffer = Buffer.from(embedding.buffer);
    queries.insertChunk.run(crypto.randomUUID(), docId, chunks[i], embeddingBuffer, i);
  }

  return Response.json({ id: docId, chunkCount: chunks.length }, { status: 201 });
}
```

- [ ] **Step 2: `src/app/api/docs/[id]/route.ts` を作成する**

```typescript
import { queries } from '@/lib/db';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  queries.deleteDocument.run(id);
  return Response.json({ success: true });
}
```

- [ ] **Step 3: コミットする**

```bash
git add src/app/api/docs/
git commit -m "feat: add document upload and delete API routes"
```

---

## Task 9: チャットAPI

**Files:**
- Create: `src/app/api/chat/route.ts`

- [ ] **Step 1: `src/app/api/chat/route.ts` を作成する**

```typescript
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
  const body = await request.json();
  const parsed = chatSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { messages } = parsed.data;
  const lastMessage = messages[messages.length - 1];

  if (lastMessage.role !== 'user') {
    return Response.json({ error: 'Last message must be from user' }, { status: 400 });
  }

  // RAG: クエリをembedして類似チャンクを検索
  const queryEmbedding = await embedText(lastMessage.content);
  const allChunks = queries.getAllChunks.all();
  const relevantChunks = searchChunks(queryEmbedding, allChunks as any[], 3);

  // システムプロンプトを構築
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

  // ユーザーメッセージをDBに保存
  queries.insertMessage.run(
    crypto.randomUUID(),
    null,
    'user',
    lastMessage.content,
    Date.now()
  );

  // 直近20件のみAIに渡す
  const recentMessages = messages.slice(-20) as Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;

  const result = streamText({
    model: chatModel,
    system: systemPrompt,
    messages: recentMessages,
    onFinish: async ({ text }) => {
      queries.insertMessage.run(crypto.randomUUID(), null, 'assistant', text, Date.now());
    },
  });

  return result.toDataStreamResponse();
}
```

- [ ] **Step 2: コミットする**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: add chat API route with RAG and streaming"
```

---

## Task 10: MessageBubble コンポーネント

**Files:**
- Create: `src/components/MessageBubble.tsx`

- [ ] **Step 1: `src/components/` ディレクトリを作成して `MessageBubble.tsx` を作成する**

```bash
mkdir -p src/components
```

```typescript
// src/components/MessageBubble.tsx
type Props = {
  role: 'user' | 'assistant';
  content: string;
};

export default function MessageBubble({ role, content }: Props) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-500 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
        }`}
      >
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: コミットする**

```bash
git add src/components/MessageBubble.tsx
git commit -m "feat: add MessageBubble component"
```

---

## Task 11: Sidebar コンポーネント

**Files:**
- Create: `src/components/Sidebar.tsx`

- [ ] **Step 1: `src/components/Sidebar.tsx` を作成する**

```typescript
'use client';

import { useRef, useState } from 'react';

type Document = {
  id: string;
  name: string;
  chunk_count: number;
  created_at: number;
};

type Props = {
  documents: Document[];
  onUpload: () => void;
};

export default function Sidebar({ documents, onUpload }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const content = await file.text();
      await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, content }),
      });
      onUpload();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/docs/${id}`, { method: 'DELETE' });
      onUpload();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <aside className="w-60 flex flex-col border-r border-gray-200 bg-gray-50">
      <div className="p-4 border-b border-gray-200">
        <h2 className="font-semibold text-gray-800 mb-3">📁 ドキュメント</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
        >
          {uploading ? '処理中...' : '+ アップロード'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {documents.length === 0 && !uploading && (
          <p className="text-xs text-gray-400 text-center mt-4">
            ドキュメントがありません
          </p>
        )}
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-start justify-between gap-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{doc.name}</p>
              <p className="text-xs text-gray-400">
                {doc.chunk_count}チャンク •{' '}
                {new Date(doc.created_at).toLocaleDateString('ja-JP')}
              </p>
            </div>
            <button
              onClick={() => handleDelete(doc.id)}
              disabled={deletingId === doc.id}
              className="text-gray-300 hover:text-red-400 disabled:opacity-50 transition-colors flex-shrink-0 text-lg leading-none"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-gray-200 text-xs text-gray-400 text-center">
        {documents.length}件 •{' '}
        {documents.reduce((sum, d) => sum + (d.chunk_count ?? 0), 0)}チャンク
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: コミットする**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add Sidebar component with file upload and delete"
```

---

## Task 12: Chat コンポーネント

**Files:**
- Create: `src/components/Chat.tsx`

- [ ] **Step 1: `src/components/Chat.tsx` を作成する**

```typescript
'use client';

import { useChat } from 'ai/react';
import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({ api: '/api/chat' });

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 mt-8">
            ドキュメントに関する質問をどうぞ
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role as 'user' | 'assistant'} content={m.content} />
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2 text-sm text-gray-400">
              ▌
            </div>
          </div>
        )}
        {error && (
          <p className="text-center text-sm text-red-500">
            エラーが発生しました。再試行してください。
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力エリア */}
      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-gray-200 flex gap-2 items-end"
      >
        <textarea
          value={input}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as any);
            }
          }}
          disabled={isLoading}
          placeholder="ドキュメントについて質問してください... (Enter で送信)"
          rows={2}
          className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          送信
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: コミットする**

```bash
git add src/components/Chat.tsx
git commit -m "feat: add Chat component with streaming and keyboard shortcut"
```

---

## Task 13: メインページ統合

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: `src/app/layout.tsx` を更新する**

```typescript
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Document Chat',
  description: 'RAG-powered document Q&A chatbot',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: `src/app/page.tsx` を更新する**

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import Chat from '@/components/Chat';

type Document = {
  id: string;
  name: string;
  chunk_count: number;
  created_at: number;
};

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);

  const fetchDocuments = useCallback(async () => {
    const res = await fetch('/api/docs');
    const data = await res.json();
    setDocuments(data);
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return (
    <main className="flex h-screen bg-white">
      <Sidebar documents={documents} onUpload={fetchDocuments} />
      <Chat />
    </main>
  );
}
```

- [ ] **Step 3: 開発サーバーを起動して動作確認する**

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開き、以下を確認する:

1. サイドバーと チャットエリアが表示される
2. `.txt` または `.md` ファイルをアップロードできる
3. ファイルがサイドバーに表示される（チャンク数付き）
4. 「このドキュメントの内容を教えて」などと質問するとAIが答える
5. 削除ボタンでドキュメントを削除できる

- [ ] **Step 4: TypeScriptのビルドエラーがないことを確認する**

```bash
npm run build
```

エラーがなければOK。

- [ ] **Step 5: コミットする**

```bash
git add src/app/page.tsx src/app/layout.tsx
git commit -m "feat: integrate sidebar and chat into main page"
```

---

## 完成後の動作確認チェックリスト

- [ ] `.txt` ファイルをアップロードしてチャンク数が表示される
- [ ] `.md` ファイルをアップロードできる
- [ ] ドキュメントの内容についてAIが正確に答える
- [ ] ドキュメントが0件のとき「アップロードしてください」と案内される
- [ ] ドキュメントを削除するとサイドバーから消える
- [ ] 長い会話でもスクロールが正しく動く
- [ ] `npm run build` が成功する
