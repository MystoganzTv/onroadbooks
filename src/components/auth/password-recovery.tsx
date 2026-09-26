"use client";
import { useEffect, useState, type FormEvent } from "react";
import { getWebDictionary } from "@/lib/i18n/dictionaries";
import type { AppLocale } from "@/lib/i18n";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PasswordRecovery({ mode, locale }: { mode: "request" | "reset"; locale: AppLocale }) {
  const copy = getWebDictionary(locale).auth;
  const resetting = mode === "reset";
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (resetting) {
      const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("token");
      if (fragmentToken) setToken(fragmentToken);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [resetting]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (resetting && password !== confirmation) { setError(copy.passwordMismatch); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${resetting ? "reset-password" : "forgot-password"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resetting ? { token, password } : { email, locale }) });
      if (!response.ok) {
        setError(response.status === 429 ? copy.recoveryLimited : resetting && response.status === 400 ? copy.recoveryExpired : copy.recoveryFailed);
        return;
      }
      setDone(true); setPassword(""); setConfirmation(""); setToken("");
    } catch { setError(copy.recoveryConnection); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
    <section className="w-full max-w-md space-y-6 rounded-xl border bg-card p-7">
      <Link href="/" className="font-semibold">OnRoad Books</Link>
      <h1 className="text-2xl font-semibold">{resetting ? copy.newPassword : copy.recoverAccess}</h1>
      {done ? <p role="status" className="text-sm text-muted-foreground">{resetting ? copy.passwordUpdated : copy.recoverySent}</p> : <form onSubmit={submit} className="space-y-4">
        {resetting ? <>
          <label className="block space-y-2"><span>{copy.newPassword}</span><Input type="password" autoComplete="new-password" minLength={10} maxLength={200} required value={password} onChange={event => setPassword(event.target.value)} /></label>
          <p className="text-xs text-muted-foreground">{copy.recoveryPasswordHint}</p>
          <label className="block space-y-2"><span>{copy.confirmPassword}</span><Input type="password" autoComplete="new-password" minLength={10} maxLength={200} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        </> : <label className="block space-y-2"><span>{copy.email}</span><Input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || (resetting && !token)}>{busy ? copy.recoveryWorking : resetting ? copy.savePassword : copy.sendResetLink}</Button>
      </form>}
      {resetting && !done && <Link href="/forgot-password" className="block text-sm text-primary underline">{copy.newResetLink}</Link>}
      <Link href="/login" className="block text-sm text-primary underline">{copy.backSignIn}</Link>
    </section>
  </main>;
}
