import { z } from "zod";

export const invitationSessionSchema = z.union([
  z.object({ code: z.string().trim().min(1).max(2048) }).strict(),
  z.object({
    accessToken: z.string().trim().min(1).max(16_384),
    refreshToken: z.string().trim().min(1).max(16_384),
  }).strict(),
]);

export type InvitationSession = z.infer<typeof invitationSessionSchema>;

export type InvitationSessionResult =
  | { ok: true; session: InvitationSession }
  | { ok: false; error: string };

/** Extracts either a PKCE code or the legacy hash session from an invite URL. */
export function invitationSessionFromUrl(search: string, fragment: string): InvitationSessionResult {
  const query = new URLSearchParams(search);
  const hash = new URLSearchParams(fragment.replace(/^#/, ""));
  const providerError = hash.get("error_description") ?? query.get("error_description");
  if (providerError) return { ok: false, error: providerError };

  const code = query.get("code");
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const parsed = invitationSessionSchema.safeParse(
    code
      ? { code }
      : accessToken && refreshToken
        ? { accessToken, refreshToken }
        : null,
  );
  return parsed.success
    ? { ok: true, session: parsed.data }
    : { ok: false, error: "The invitation link is missing its verification session." };
}
