import { handlers } from "@/auth";
import { usingAuthJs } from "@/lib/auth/provider";
import type { NextRequest } from "next/server";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  return usingAuthJs()
    ? handlers.GET(request)
    : new Response(null, { status: 404 });
}
export async function POST(request: NextRequest) {
  return usingAuthJs()
    ? handlers.POST(request)
    : new Response(null, { status: 404 });
}
