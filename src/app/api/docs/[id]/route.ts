import { queries } from '@/lib/db';

// ドキュメントを削除する（chunks は ON DELETE CASCADE で自動削除）
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  queries.deleteDocument.run(id);
  return Response.json({ success: true });
}
