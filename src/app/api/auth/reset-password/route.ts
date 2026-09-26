import { z } from "zod";
import { sameOriginRequest } from "@/lib/auth/provider";
import { authLimitResponse } from "@/lib/auth/rate-limit";
import { resetPassword } from "@/lib/auth/password-reset";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "Cross-origin request refused." }, { status: 403 });
  const limited = await authLimitResponse(request, "reset-confirm");
  if (limited) return limited;
  const parsed = z.object({ token: z.string().max(100), password: z.string().min(10).max(200) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check your password and recovery link." }, { status: 400 });
  try {
    if (!await resetPassword(parsed.data.token, parsed.data.password)) return Response.json({ error: "This recovery link is invalid or expired. Request a new one." }, { status: 400 });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Password recovery is temporarily unavailable." }, { status: 503 }); }
}
