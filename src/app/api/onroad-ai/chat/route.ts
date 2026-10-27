import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { runWebChat, webChatEnabledFor, WEBCHAT_FILE_TYPES, WEBCHAT_MAX_FILE_BYTES } from "@/lib/onroad-ai/webchat";
import { isSameOriginRequest } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

/**
 * The in-app chat bubble's only endpoint. Signed-in session + platform admin
 * + ONROAD_AI_WEBCHAT=true, same-origin only. Accepts multipart form data:
 *   text      the message (optional when a file or a button reply is sent)
 *   replyId   id of a quick-reply button the person tapped
 *   file      one PNG/JPEG/WebP screenshot or PDF rate confirmation, <= 4 MB
 * Returns the bot's replies in order: [{ text, buttons }].
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: noStore });
  if (!webChatEnabledFor(session.email)) return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Cross-origin request refused." }, { status: 403, headers: noStore });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400, headers: noStore });
  }
  const rawText = form.get("text");
  const rawReply = form.get("replyId");
  const rawFile = form.get("file");
  const text = typeof rawText === "string" && rawText.trim() ? rawText.trim().slice(0, 4_000) : null;
  const replyId = typeof rawReply === "string" && /^act:[a-z]+$/.test(rawReply) ? rawReply : null;

  let file: { bytes: Buffer; mimeType: string; name: string | null } | null = null;
  if (rawFile && typeof rawFile !== "string" && rawFile.size > 0) {
    if (!WEBCHAT_FILE_TYPES.includes(rawFile.type)) {
      return NextResponse.json({ error: "Send a PNG, JPEG or WebP screenshot, or a PDF." }, { status: 415, headers: noStore });
    }
    if (rawFile.size > WEBCHAT_MAX_FILE_BYTES) {
      return NextResponse.json({ error: "That file is larger than 4 MB." }, { status: 413, headers: noStore });
    }
    file = { bytes: Buffer.from(await rawFile.arrayBuffer()), mimeType: rawFile.type, name: rawFile.name || null };
  }
  if (!text && !replyId && !file) return NextResponse.json({ error: "Empty message." }, { status: 400, headers: noStore });

  try {
    const replies = await runWebChat({ userId: session.userId, displayName: null, text, replyId, file });
    return NextResponse.json({ replies }, { headers: noStore });
  } catch (error) {
    console.error("[onroad-ai] web chat failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "The assistant could not answer right now. Try again." }, { status: 500, headers: noStore });
  }
}
