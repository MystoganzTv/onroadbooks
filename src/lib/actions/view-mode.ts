"use server";

import { cookies } from "next/headers";
import { requireSession } from "@/lib/auth";
import { isViewMode, VIEW_MODE_COOKIE } from "@/lib/view-mode";

export async function setViewModeAction(value: unknown): Promise<void> {
  await requireSession();
  if (!isViewMode(value)) throw new Error("Unsupported view mode");

  (await cookies()).set(VIEW_MODE_COOKIE, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
