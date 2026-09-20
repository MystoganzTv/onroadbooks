import { NextResponse } from "next/server";

/** Old token-exchange clients must start the protected OAuth flow instead. */
export function GET() {
  return NextResponse.json(
    { error: "Use the Google OAuth sign-in link." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
export const POST = GET;
