import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";

import { BrandLogo } from "@/components/shell/brand-logo";
import { display } from "@/lib/marketing/fonts";
import { cn } from "@/lib/utils";

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
] as const;

export type LegalTocEntry = { id: string; label: string };

export function LegalPage({
  title,
  eyebrow,
  summary,
  updated,
  toc,
  children,
}: {
  title: string;
  eyebrow: string;
  summary: string;
  updated: string;
  toc: LegalTocEntry[];
  children: React.ReactNode;
}) {
  return (
    <div className={cn(display.variable, "min-h-screen bg-mkt-deep text-white")}>
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-mkt-deep/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1180px] items-center gap-5 px-5 py-3 sm:px-8">
          <Link href="/" aria-label="OnRoad Books home" className="shrink-0">
            <BrandLogo className="h-9 w-auto bg-transparent p-0 shadow-none sm:h-10" priority />
          </Link>
          <nav className="ml-auto hidden items-center gap-5 text-sm text-mkt-dim sm:flex" aria-label="Legal pages">
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
        <section className="border-b border-white/[0.08]">
          <div className="mx-auto max-w-[1180px] px-5 py-10 sm:px-8 sm:py-12">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-mkt-dim transition-colors hover:text-white">
              <ArrowLeft className="size-4" />
              Back to OnRoad Books
            </Link>
            <div className="mt-6 max-w-2xl">
              <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-mkt-amber">
                {eyebrow}
              </p>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
                {title}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-mkt-dim sm:text-[15px]">{summary}</p>
              <div className="mt-5 inline-flex items-center gap-1.5 text-xs text-mkt-faint">
                <LockKeyhole className="size-3.5 text-mkt-blue" />
                Last updated {updated}
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[220px_minmax(0,720px)] lg:gap-16">
          <aside className="lg:sticky lg:top-24 lg:h-fit">
            <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-mkt-faint">On this page</p>
            <nav className="mt-3 grid gap-0.5" aria-label="Table of contents">
              {toc.map((entry) => (
                <a
                  key={entry.id}
                  href={`#${entry.id}`}
                  className="rounded-md px-2.5 py-1.5 text-[13px] leading-5 text-mkt-dim transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  {entry.label}
                </a>
              ))}
            </nav>
            <div className="mt-7 border-t border-white/[0.08] pt-5">
              <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-mkt-faint">Legal center</p>
              <nav className="mt-3 grid gap-0.5" aria-label="Legal center">
                {LEGAL_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-md px-2.5 py-1.5 text-[13px] text-mkt-dim transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
            <p className="mt-7 border-t border-white/[0.08] pt-5 text-xs leading-5 text-mkt-faint">
              Questions? Email{" "}
              <a className="text-mkt-blue hover:text-white" href="mailto:enrique.padron853@gmail.com">
                support
              </a>
              .
            </p>
          </aside>

          <article className="min-w-0">
            <div
              className={cn(
                "max-w-2xl text-[15px] leading-7 text-mkt-dim",
                "[&_a]:font-medium [&_a]:text-mkt-blue [&_a]:underline [&_a]:underline-offset-4",
                "[&_h2]:scroll-mt-24 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white",
                "[&_section+section]:mt-9 [&_section+section]:border-t [&_section+section]:border-white/[0.08] [&_section+section]:pt-9",
                "[&_h3]:scroll-mt-24 [&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-white/90",
                "[&_h2+p]:mt-3 [&_h3+p]:mt-2 [&_p+p]:mt-3 [&_p+ul]:mt-3 [&_ul+p]:mt-3",
                "[&_li]:ml-5 [&_li]:list-disc [&_li+li]:mt-1.5",
              )}
            >
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
