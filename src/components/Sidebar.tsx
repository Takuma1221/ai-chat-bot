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
