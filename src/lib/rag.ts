export function splitIntoChunks(text: string, maxLength = 500): string[] {
  if (!text.trim()) return [];

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    chunks.push(trimmed);
  }

  return chunks;
}
