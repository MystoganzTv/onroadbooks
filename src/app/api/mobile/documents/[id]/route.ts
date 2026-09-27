import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { getDocumentStorage } from "@/lib/storage";
import { canWrite } from "@/lib/plans";
import { roleCan, type Permission } from "@/lib/roles";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dataset = await getRepository(session.businessId).getDataset();
  const { id } = await context.params;
  const document = dataset.documents.find(d => d.id === id);
  if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  const storage = getDocumentStorage();
  if (storage.createSignedDownloadUrl) {
    const url = await storage.createSignedDownloadUrl(document.storageKey, document.fileName);
    return NextResponse.json({ url }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const bytes = await storage.get(document.storageKey);
  if (!bytes) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const name = document.fileName.replace(/[\r\n"\\/]/g, "_").replace(/[^\x20-\x7E]/g, "_");
  return new NextResponse(new Uint8Array(bytes), { headers: {
    "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
export async function DELETE(request: Request, context: Context) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const repository = getRepository(session.businessId);
  const dataset = await repository.getDataset();
  const { id } = await context.params;
  const document = dataset.documents.find(d => d.id === id);
  if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  const permission: Permission = document.loadId ? "manage_loads" : document.expenseId ? "manage_expenses" : document.maintenanceId ? "manage_maintenance" : "manage_fleet";
  if (!canWrite(dataset.subscription) || !roleCan(session.role ?? "VIEWER", permission)) return NextResponse.json({ error: "No tienes permiso para eliminar este documento." }, { status: 403 });
  const key = await repository.deleteDocument(id);
  if (!key) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  await getDocumentStorage().remove(key);
  return NextResponse.json({ id });
}
