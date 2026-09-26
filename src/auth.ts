import "server-only";
import { enforceAuthLimit } from "@/lib/auth/rate-limit";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { getAuthStore } from "@/lib/db";
import { credentialsSchema } from "@/lib/schemas";
import {
  getAuthSecret,
  verifyPassword,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session";
import {
  acceptInvitation,
  resolveGoogleIdentity,
} from "@/lib/auth/identity-store";
import { usingAuthJs } from "@/lib/auth/provider";

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  if (usingAuthJs() && process.env.NODE_ENV === "production") {
    const origin = new URL(process.env.AUTH_URL ?? "");
    if (
      origin.protocol !== "https:" ||
      (process.env.AUTH_SECRET?.length ?? 0) < 32
    ) {
      throw new Error(
        "Auth.js requires an HTTPS AUTH_URL and a stable AUTH_SECRET in production.",
      );
    }
  }
  return {
    secret: await getAuthSecret(),
    trustHost: true,
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
    pages: { signIn: "/login", error: "/login" },
    providers: [
      Credentials({
        id: "credentials",
        credentials: {
          email: { type: "email" },
          password: { type: "password" },
        },
        async authorize(input, request) {
          if (!usingAuthJs()) return null;
          const parsed = credentialsSchema.safeParse(input);
          if (!parsed.success) return null;
          await enforceAuthLimit(request, "login", parsed.data.email);
          const user = await getAuthStore().findUserByEmail(parsed.data.email);
          if (
            !user ||
            (user.role !== "OWNER" && !user.joinedAt) ||
            !(await verifyPassword(parsed.data.password, user.passwordHash))
          )
            return null;
          return { id: user.id, email: user.email, name: user.name, authVersion: user.authVersion ?? 0 };
        },
      }),
      Credentials({
        id: "invitation",
        credentials: {
          token: { type: "text" },
          password: { type: "password" },
        },
        async authorize(input, request) {
          if (!usingAuthJs() || process.env.DATA_SOURCE !== "neon") return null;
          await enforceAuthLimit(request, "invitation");
          try {
            const user = await acceptInvitation(input);
            return { id: user.id, email: user.email, name: user.name, authVersion: user.authVersion ?? 0 };
          } catch {
            return null;
          }
        },
      }),
      ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
        ? [
            Google({
              clientId: process.env.AUTH_GOOGLE_ID,
              clientSecret: process.env.AUTH_GOOGLE_SECRET,
              authorization: {
                params: {
                  prompt: "select_account",
                  scope: "openid email profile",
                },
              },
              checks: ["pkce", "state", "nonce"],
            }),
          ]
        : []),
    ],
    callbacks: {
      async signIn({ user, account, profile }) {
        if (!usingAuthJs()) return false;
        if (account?.provider === "google") {
          if (process.env.DATA_SOURCE !== "neon") return false;
          try {
            const existing = await resolveGoogleIdentity(profile);
            user.id = existing.id;
            user.email = existing.email;
            user.name = existing.name;
            user.isNew = existing.isNew;
            user.authVersion = existing.authVersion ?? 0;
          } catch {
            return false;
          }
        }
        return true;
      },
      async jwt({ token, user }) {
        if (user) {
          token.sub = user.id;
          token.authVersion = user.authVersion ?? 0;
          token.newAccount = user.isNew === true;
        }
        // Revalidate even the Auth.js session endpoint. Removed accounts never
        // remain signed in; roles and workspace always come from our database.
        const current = token.sub ? await getAuthStore().findUserById(token.sub) : null;
        if (!current || (current.authVersion ?? 0) !== (token.authVersion ?? 0)) return null;
        return token;
      },
      async session({ session, token }) {
        session.user.id = token.sub!;
        session.user.authVersion = Number(token.authVersion ?? 0);
        session.user.isNew = token.newAccount === true;
        return session;
      },
      redirect({ url, baseUrl }) {
        try {
          const candidate = new URL(url, baseUrl);
          if (candidate.origin === new URL(baseUrl).origin)
            return candidate.toString();
        } catch {
          /* Use the authenticated landing page. */
        }
        return `${baseUrl}/dashboard`;
      },
    },
    logger: {
      error(error) {
        console.error("[authjs] Authentication failed", { type: error.name });
      },
    },
  };
});
