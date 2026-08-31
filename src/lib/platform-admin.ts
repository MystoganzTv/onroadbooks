/**
 * Platform-console access is deliberately separate from workspace roles.
 * Configure a comma-separated allowlist in PLATFORM_ADMIN_EMAILS; keeping it
 * outside the bundle prevents a source-code email from becoming authorization.
 */
export function platformAdminEmails(value = process.env.PLATFORM_ADMIN_EMAILS): ReadonlySet<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformAdminEmail(
  email: string | null | undefined,
  configured = platformAdminEmails(),
): boolean {
  return Boolean(email && configured.has(email.trim().toLowerCase()));
}
