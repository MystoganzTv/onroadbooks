import { getMobileSession } from "@/lib/auth/mobile";
export const runtime = "nodejs";

async function retired(request: Request) {
  if (!await getMobileSession(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ error: "Owner statements have been retired. Use Reports for your financial summary." }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
export const GET = retired;
export const PATCH = retired;
