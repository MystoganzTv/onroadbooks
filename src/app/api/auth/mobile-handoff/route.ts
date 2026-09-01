import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import { encodeHandoffCode, handoffExpiry, isOpaqueToken } from "@/lib/auth/mobile-handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The last step of signing in to the iOS app through the browser.
 *
 * The app opens the normal sign-in page inside an `ASWebAuthenticationSession`
 * with this route as `next`. Whichever way the person signs in -- Google or a
 * password -- they land here with a session cookie, and this hands the app a
 * short-lived code bound to a challenge only that app can answer.
 *
 * Not signed in yet? Send them to sign in, and come back.
 */
export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  const challenge = request.nextUrl.searchParams.get("challenge");

  if (!isOpaqueToken(state) || !isOpaqueToken(challenge)) {
    return NextResponse.json({ error: "Invalid sign-in request." }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    const back =
      "/api/auth/mobile-handoff?state=" +
      encodeURIComponent(state) +
      "&challenge=" +
      encodeURIComponent(challenge);
    return NextResponse.redirect(
      new URL("/login?next=" + encodeURIComponent(back), request.nextUrl.origin),
    );
  }

  const code = await encodeHandoffCode({
    userId: session.userId,
    businessId: session.businessId,
    email: session.email,
    challenge,
    exp: handoffExpiry(),
  });

  // A custom scheme, deliberately NOT registered in the app's Info.plist: an
  // ASWebAuthenticationSession captures its own callback, and registering the
  // scheme system-wide is exactly what would let another app receive this.
  const callback =
    "onroadbooks://auth?code=" + encodeURIComponent(code) + "&state=" + encodeURIComponent(state);
  return NextResponse.redirect(callback, { status: 302 });
}
