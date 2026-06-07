export function splitIntoChunks(text: string, maxLength = 500): string[] {
  if (!text.trim()) return [];

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    // 単一段落が maxLength を超える場合は文字レベルで分割
    if (trimmed.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < trimmed.length; i += maxLength) {
        chunks.push(trimmed.slice(i, i + maxLength));
      }
      continue;
    }

    // 現在のチャンクに追加すると maxLength を超える場合は新チャンクへ
    const separator = current ? '\n\n' : '';
    if (current.length + separator.length + trimmed.length > maxLength) {
      chunks.push(current);
      current = trimmed;
    } else {
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
