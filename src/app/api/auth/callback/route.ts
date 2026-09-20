import { NextResponse } from "next/server";

/** Retired callbacks cannot create a session; Auth.js owns callback/google. */
export function GET(request: Request) {
  return NextResponse.redirect(new URL("/login?error=invite", request.url));
}
