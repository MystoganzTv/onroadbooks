import Link from "next/link";

import { BrandLogo } from "@/components/shell/brand-logo";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8 sm:py-14">
      <article className="mx-auto max-w-3xl">
        <header className="mb-10 border-b border-border pb-8">
          <Link href="/" aria-label="Back to OnRoad Books" className="inline-flex">
            <BrandLogo className="h-12 w-auto" />
          </Link>
          <h1 className="mt-8 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: {updated}</p>
        </header>

        <div className="space-y-8 text-[15px] leading-7 text-muted-foreground [&_a]:text-brand-blue [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3">
          {children}
        </div>

        <footer className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link href="/">Home</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href="mailto:enrique.padron853@gmail.com">Contact</a>
        </footer>
      </article>
    </main>
  );
}
