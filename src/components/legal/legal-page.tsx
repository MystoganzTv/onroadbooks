import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";

import { BrandLogo } from "@/components/shell/brand-logo";
import { display } from "@/lib/marketing/fonts";
import { cn } from "@/lib/utils";

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/billing-policy", label: "Billing & Refunds" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/acceptable-use", label: "Acceptable Use" },
] as const;

export function LegalPage({
  title,
  eyebrow,
  summary,
  updated,
  children,
}: {
  title: string;
  eyebrow: string;
  summary: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(display.variable, "min-h-screen bg-mkt-deep text-white")}>
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-mkt-deep/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1180px] items-center gap-5 px-5 py-3 sm:px-8">
          <Link href="/" aria-label="OnRoad Books home" className="shrink-0">
            <BrandLogo className="h-11 w-auto bg-transparent p-0 shadow-none sm:h-13" priority />
          </Link>
          <nav className="ml-auto hidden items-center gap-5 text-sm text-mkt-dim md:flex" aria-label="Legal pages">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-white">
                {link.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/login"
            className="rounded-lg border border-white/20 px-3.5 py-2 text-sm font-semibold transition-colors hover:bg-white/10"
          >
            Log in
          </Link>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-white/[0.08]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_12%,rgba(249,181,0,0.16),transparent_34%),radial-gradient(circle_at_12%_80%,rgba(0,139,245,0.13),transparent_30%)]" />
          <div className="relative mx-auto max-w-[1180px] px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-mkt-dim transition-colors hover:text-white">
              <ArrowLeft className="size-4" />
              Back to OnRoad Books
            </Link>
            <div className="mt-9 max-w-3xl">
              <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-mkt-amber">
                {eyebrow}
              </p>
              <h1 className="mt-3 font-display text-4xl font-black tracking-[-0.035em] sm:text-5xl lg:text-6xl">
                {title}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-mkt-dim sm:text-lg">{summary}</p>
              <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-mkt-faint">
                <LockKeyhole className="size-3.5 text-mkt-blue" />
                Last updated {updated}
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[220px_minmax(0,760px)] lg:gap-16">
          <aside className="lg:sticky lg:top-24 lg:h-fit">
            <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-mkt-faint">Legal center</p>
            <nav className="mt-3 grid gap-1" aria-label="Legal center">
              {LEGAL_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-3 py-2.5 text-sm text-mkt-dim transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <p className="mt-7 border-t border-white/[0.08] pt-5 text-xs leading-5 text-mkt-faint">
              Questions? Email{" "}
              <a className="text-mkt-blue hover:text-white" href="mailto:enrique.padron853@gmail.com">
                support
              </a>
              .
            </p>
          </aside>

          <article className="min-w-0">
            <div className="space-y-5 text-[15px] leading-7 text-mkt-dim [&_a]:font-medium [&_a]:text-mkt-blue [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3 [&_section]:rounded-xl [&_section]:border [&_section]:border-white/[0.08] [&_section]:bg-mkt-panel/70 [&_section]:p-5 sm:[&_section]:p-7">
              {children}
            </div>
          </article>
        </div>
      </main>

      <footer className="border-t border-white/[0.08] bg-mkt-ink">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-4 px-5 py-8 text-xs text-mkt-faint sm:px-8">
          <span>&copy; 2026 OnRoad Books. Bookkeeping built for the road.</span>
          <div className="ml-auto flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-white">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
