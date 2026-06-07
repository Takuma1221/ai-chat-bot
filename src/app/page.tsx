'use client';

import { useCallback, useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Chat from '@/components/Chat';

type Document = {
  id: string;
  name: string;
  chunk_count: number;
  created_at: number;
};

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);

  const fetchDocuments = useCallback(async () => {
    const res = await fetch('/api/docs');
    if (res.ok) {
      const data = await res.json() as { documents: Document[] };
      setDocuments(data.documents);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar documents={documents} onUpload={fetchDocuments} />
      <main className="flex flex-col flex-1 min-w-0">
        <header className="border-b border-gray-200 px-6 py-3 flex-shrink-0">
          <h1 className="text-lg font-semibold text-gray-800">AI Chat Bot</h1>
          <p className="text-xs text-gray-400">ドキュメントに関する質問に答えます</p>
        </header>
        <Chat />
      </main>
    </div>
  );
}
