import "server-only";
import { usingAuthJs } from "./provider";

/** Only this boolean is passed to the browser; OAuth credentials stay here. */
export function googleSignInConfigured() {
  const configured = (value: string | undefined) =>
    Boolean(value?.trim() && value.trim() !== "[SENSITIVE]");
  return usingAuthJs() && configured(process.env.AUTH_GOOGLE_ID) &&
    configured(process.env.AUTH_GOOGLE_SECRET);
}
