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
