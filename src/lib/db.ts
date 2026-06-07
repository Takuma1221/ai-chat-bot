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
