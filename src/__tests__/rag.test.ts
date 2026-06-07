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
