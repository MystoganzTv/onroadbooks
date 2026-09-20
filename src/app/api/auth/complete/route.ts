import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession } from "@/lib/auth";
import { usingAuthJs } from "@/lib/auth/provider";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!usingAuthJs() || !(await getSession()))
    return NextResponse.redirect(new URL("/login", request.url));
  const session = await auth();
  return NextResponse.redirect(
    new URL(session?.user?.isNew ? "/welcome" : "/dashboard", request.url),
  );
}
