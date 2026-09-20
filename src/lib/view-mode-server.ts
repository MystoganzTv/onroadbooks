import "server-only";

import { cookies } from "next/headers";
import { isViewMode, VIEW_MODE_COOKIE, type ViewMode } from "./view-mode";

export async function getViewMode(): Promise<ViewMode> {
  const value = (await cookies()).get(VIEW_MODE_COOKIE)?.value;
  return isViewMode(value) ? value : "simple";
}
