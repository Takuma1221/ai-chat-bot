import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

// テキストを maxLength 文字以内のチャンク（かたまり）に分割する。
// 短い段落は結合して1チャンクにまとめ、長すぎる段落は強制的に切り分ける。
export function splitIntoChunks(text: string, maxLength = 500): string[] {
  // 空文字・スペースのみのテキストは処理しない
  if (!text.trim()) return [];

  // \n\n（段落区切り）でテキストをまず段落単位に分解する
  const paragraphs = text.split(/\n\n+/);

  // 確定済みのチャンクを格納する配列
  const chunks: string[] = [];

  // 現在組み立て中のチャンク（まだ確定していない）
  let current = '';

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();

    // 空の段落（連続する改行など）は無視する
    if (!trimmed) continue;

    // ── ケース1: 段落単体が maxLength を超える場合 ──
    // 1段落が長すぎて結合できないので、文字レベルで強制分割する
    if (trimmed.length > maxLength) {
      // 組み立て中のチャンクがあれば先に確定させる
      if (current) {
        chunks.push(current);
        current = '';
      }
      // maxLength ずつスライスして個別チャンクとして追加する
      for (let i = 0; i < trimmed.length; i += maxLength) {
        chunks.push(trimmed.slice(i, i + maxLength));
      }
      continue;
    }

    // ── ケース2: 現在のチャンクにこの段落を追加すると maxLength を超える場合 ──
    // 区切り文字（\n\n）の長さも含めて計算する
    const separator = current ? '\n\n' : '';
    if (current.length + separator.length + trimmed.length > maxLength) {
      // 現在のチャンクを確定し、この段落から新しいチャンクを始める
      chunks.push(current);
      current = trimmed;
    } else {
      // ── ケース3: まだ余裕がある場合 ──
      // 段落を現在のチャンクに結合して積み上げる
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    }
  }

  // ループ終了後、組み立て中のチャンクが残っていれば最後に追加する
  if (current) chunks.push(current);

  return chunks;
}

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
      // Buffer（バイナリ）を Float32Array に変換してコサイン類似度を計算する
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
    .sort((a, b) => b.score - a.score) // スコアの高い順に並べる
    .slice(0, topK);                   // 上位 topK 件だけ返す
}

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

// テキストを OpenAI の text-embedding-3-small でベクトル化する。
// 戻り値は Float32Array（1536次元）。
export async function embedText(text: string): Promise<Float32Array> {
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: text,
  });
  return new Float32Array(embedding);
}
