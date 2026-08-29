import type { ZodError } from "zod";

/**
 * Turns a zod failure into a field -> message map.
 *
 * Every schema key must have somewhere to land: an error painted on a field
 * the form does not render is invisible, and the user sees a submit button
 * that simply does nothing.
 */
export function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * The message shown when validation fails client side. It names the offending
 * fields, so a rule on an input without its own error slot is still actionable.
 */
export function validationMessage(
  errors: Record<string, string>,
  labels: Record<string, string> = {},
): string {
  const keys = Object.keys(errors);
  if (keys.length === 0) return "Check the highlighted fields.";
  const named = keys.map((key) => labels[key] ?? humanise(key));
  if (named.length === 1) return `${named[0]}: ${errors[keys[0]]}`;
  return `Check these fields: ${named.slice(0, 4).join(", ")}${named.length > 4 ? "..." : ""}`;
}

function humanise(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/** Scrolls the first invalid control into view and focuses it. */
export function focusFirstError(formId: string): void {
  if (typeof document === "undefined") return;
  const form = document.getElementById(formId);
  if (!form) return;
  const first = form.querySelector<HTMLElement>('[aria-invalid="true"]');
  const target = first ?? form.querySelector<HTMLElement>("[data-error-anchor]");
  if (!target) return;
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  target.focus({ preventScroll: true });
}
