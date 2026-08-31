import "server-only";

import { createClient } from "@supabase/supabase-js";

function adminConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

function adminClient() {
  const config = adminConfig();
  if (!config) throw new Error("Supabase invitations are not configured on this server.");
  return createClient(config.url, config.key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Sends Supabase's verified invite email. Workspace and role stay in our database. */
export async function inviteSupabaseAuthUser(email: string, redirectTo: string): Promise<void> {
  const { error } = await adminClient().auth.admin.inviteUserByEmail(
    email.trim().toLowerCase(),
    { redirectTo },
  );
  if (error) throw error;
}

/** Removes a matching Google identity without ever exposing the admin key. */
export async function deleteSupabaseAuthUserByEmail(email: string): Promise<void> {
  const config = adminConfig();
  if (!config) return;

  const supabase = createClient(config.url, config.key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const normalized = email.trim().toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === normalized);
    if (user) {
      const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
      if (deleteError) throw deleteError;
      return;
    }
    if (data.users.length < perPage) return;
  }
}
