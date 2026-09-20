export const VIEW_MODE_COOKIE = "onroad-view-mode";
export type ViewMode = "simple" | "detailed";

export function isViewMode(value: unknown): value is ViewMode {
  return value === "simple" || value === "detailed";
}
