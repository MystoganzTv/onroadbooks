import { z } from "zod";
import { sameOriginRequest } from "@/lib/auth/provider";
import { authLimitResponse } from "@/lib/auth/rate-limit";
import { requestPasswordReset } from "@/lib/auth/password-reset";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "Cross-origin request refused." }, { status: 403 });
  const parsed = z.object({ email: z.string().trim().email().max(320), locale: z.enum(["en", "es"]).default("en") }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  const limited = await authLimitResponse(request, "reset-request", parsed.data.email);
  if (limited) return limited;
  try { await requestPasswordReset(parsed.data.email, parsed.data.locale); }
  catch { console.error("Password recovery delivery unavailable"); }
  // Identical response for unknown, OAuth-only and password accounts, including mail failure.
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
