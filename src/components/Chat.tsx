'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: '/api/chat',
  });

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isLoading = status === 'submitted' || status === 'streaming';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-sm">
              サイドバーからドキュメントをアップロードして、質問してみてください。
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} role={msg.role as 'user' | 'assistant'} content={msg.content} />
        ))}
        {isLoading && (
          <MessageBubble role="assistant" content="考え中..." />
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力フォーム */}
      <div className="border-t border-gray-200 p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="ドキュメントについて質問してください..."
            disabled={isLoading}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            送信
          </button>
        </form>
      </div>
    </div>
  );
}
