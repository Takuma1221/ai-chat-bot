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
    // 各段落が短いため maxLength=500 内で1つのチャンクに結合される
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe('段落1の内容です。\n\n段落2の内容です。\n\n段落3の内容です。');
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

  it('maxLengthを超える単一段落は文字レベルで分割する', () => {
    const longText = 'あ'.repeat(1200);
    const chunks = splitIntoChunks(longText, 500);
    expect(chunks.length).toBe(3); // 500 + 500 + 200
    expect(chunks[0]).toBe('あ'.repeat(500));
    expect(chunks[1]).toBe('あ'.repeat(500));
    expect(chunks[2]).toBe('あ'.repeat(200));
  });

  it('短い段落はmaxLength内で結合する', () => {
    const text = '短い段落1\n\n短い段落2\n\n短い段落3';
    // デフォルト maxLength=500 なので全て1チャンクに結合される
    const chunks = splitIntoChunks(text);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe('短い段落1\n\n短い段落2\n\n短い段落3');
  });

  it('空の段落は無視する', () => {
    const text = '段落1\n\n\n\n段落2';
    const chunks = splitIntoChunks(text);
    expect(chunks.length).toBe(1);
  });
});
