# AIチャットボット設計ドキュメント

**作成日**: 2026-06-07  
**種別**: ドキュメントQ&Aチャットボット（RAG）

---

## 概要

テキスト/Markdownファイルをアップロードし、その内容についてAIと対話できるチャットボット。RAG（Retrieval-Augmented Generation）でドキュメントを参照しながら回答する。

---

## 技術スタック

| 用途 | 技術 |
|------|------|
| フレームワーク | Next.js App Router |
| 言語 | TypeScript（フロント・バック共通） |
| AI SDK | Vercel AI SDK Core |
| AIモデル | Claude（Anthropic） |
| バリデーション | Zod |
| DB | SQLite（better-sqlite3） |

---

## アーキテクチャ

```
Next.js App Router
├── UI (React)
│   ├── Sidebar.tsx       ドキュメント管理（一覧・アップロード・削除）
│   ├── Chat.tsx          メッセージ一覧・入力欄
│   └── MessageBubble.tsx メッセージ1件（参照元ドキュメント表示）
└── API Routes
    ├── POST /api/chat    RAG検索 + AI応答（ストリーミング）
    ├── POST /api/docs    ドキュメントアップロード・チャンク化・embed
    └── DELETE /api/docs/[id]  ドキュメント削除
```

### ディレクトリ構成

```
src/
├── app/
│   ├── page.tsx
│   └── api/
│       ├── chat/route.ts
│       └── docs/route.ts
├── lib/
│   ├── db.ts        SQLite接続・スキーマ定義
│   ├── rag.ts       チャンク分割・embed・コサイン類似度
│   └── ai.ts        Vercel AI SDK設定
└── components/
    ├── Sidebar.tsx
    ├── Chat.tsx
    └── MessageBubble.tsx
```

---

## データモデル

```sql
-- ドキュメントのメタ情報
CREATE TABLE documents (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- チャンク（検索単位）
CREATE TABLE chunks (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  embedding   BLOB NOT NULL,   -- Float32Array をバイナリで保存
  chunk_index INTEGER NOT NULL
);

-- 会話履歴
CREATE TABLE messages (
  id         TEXT PRIMARY KEY,
  session_id TEXT,             -- 将来のマルチセッション対応用（現状はNULL固定）
  role       TEXT NOT NULL,    -- 'user' | 'assistant'
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

---

## RAGパイプライン

### ドキュメントアップロード時

1. ファイルのテキストを受け取る（初期対応: `.txt` / `.md`）
2. 段落・改行単位でチャンクに分割（目安: 500文字）
3. Vercel AI SDK `embed()` で各チャンクをベクトル化
4. `documents` テーブルにメタ情報を保存
5. `chunks` テーブルに各チャンク＋ベクトル（BLOB）を保存

### チャット応答時

1. ユーザーの質問を `embed()` でベクトル化
2. `chunks` テーブルの全チャンクを取得し、コサイン類似度を計算
3. スコア上位3件のチャンクを取得
4. プロンプトを構築してAIに送信:

   ```
   以下の参考資料を元に質問に答えてください。
   参考資料に答えがない場合はその旨を伝えてください。

   【参考資料】
   {上位3チャンクのテキスト}

   【質問】
   {ユーザーの質問}
   ```

5. `streamText()` でストリーミング応答
6. 会話履歴を `messages` テーブルに保存（AIには直近20件を渡す）

---

## UI設計

### レイアウト

サイドバーレイアウト（左: ドキュメント管理、右: チャット）

### Sidebar

- ドキュメント一覧（ファイル名・チャンク数・登録日）
- アップロードボタン（ファイル選択 or ドラッグ&ドロップ）
- 処理中インジケータ（embed処理中に表示）
- 削除ボタン（× ボタン）
- フッターにドキュメント総数・総チャンク数

### Chat

- メッセージ一覧（ユーザー: 右寄せ青、AI: 左寄せグレー）
- 参照元表示（AI回答の下に「📄 参照: {ファイル名}（N チャンク）」）
- ストリーミング中のカーソル表示
- テキストエリア入力欄＋送信ボタン
- ドキュメント未登録時のガイドメッセージ

---

## バリデーション（Zod）

```typescript
// ドキュメントアップロード
const UploadSchema = z.object({
  name: z.string().min(1),
  content: z.string().min(1),
  type: z.enum(['text', 'markdown']), // 将来: 'pdf', 'url' を追加
});

// チャットリクエスト
const ChatSchema = z.object({
  message: z.string().min(1).max(2000),
});
```

---

## エラーハンドリング

| 状況 | 対処 |
|------|------|
| サポート外のファイル形式 | Zodバリデーションエラー → UI にエラーメッセージ表示 |
| AI API エラー | チャット欄に「エラーが発生しました、再試行してください」表示 |
| ドキュメント0件で質問 | 「先にドキュメントをアップロードしてください」表示 |

---

## 将来の拡張ポイント

| 機能 | 対応方法 |
|------|----------|
| PDFサポート | `UploadSchema.type` に `'pdf'` 追加、パースライブラリ導入 |
| URLスクレイピング | `'url'` タイプ追加、スクレイピング処理を実装 |
| マルチセッション | `sessions` テーブル追加、`messages.session_id` を使い始める |
| マルチユーザー | 各テーブルに `user_id` カラム追加、認証ミドルウェア追加 |
| 高速ベクトル検索 | SQLite から sqlite-vec 拡張へ移行 |
