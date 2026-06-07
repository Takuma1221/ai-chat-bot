import db, { queries } from '@/lib/db';

// ドキュメントを削除する（chunks は ON DELETE CASCADE で自動削除）
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = queries.deleteDocument.run(id);
    if (result.changes === 0) {
      return Response.json({ error: 'ドキュメントが見つかりません' }, { status: 404 });
    }
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: '削除に失敗しました' }, { status: 500 });
  }
}
