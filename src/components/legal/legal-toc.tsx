"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import type { LegalTocEntry } from "./legal-page";

/**
 * The "On this page" sidebar nav. A client component so it can track scroll
 * position -- everything else in LegalPage stays server-rendered.
 */
export function LegalToc({ toc }: { toc: LegalTocEntry[] }) {
  const [activeId, setActiveId] = useState<string>(toc[0]?.id ?? "");

  useEffect(() => {
    const sections = toc
      .map((entry) => document.getElementById(entry.id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        // Several sections can be inside the band at once (short ones); the
        // one closest to the top of the viewport is the one being read.
        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
        );
        setActiveId(topmost.target.id);
      },
      {
        // A thin strip just under the sticky header. A section only becomes
        // active once it crosses that strip, and stays active until the
        // next one does -- so the highlight tracks whatever is being read,
        // not whatever merely entered the bottom of the screen.
        rootMargin: "-112px 0px -75% 0px",
        threshold: 0,
      },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [toc]);

  return (
    <nav className="mt-3 grid gap-0.5" aria-label="Table of contents">
      {toc.map((entry) => {
        const isActive = entry.id === activeId;
        return (
          <a
            key={entry.id}
            href={`#${entry.id}`}
            aria-current={isActive ? "location" : undefined}
            className={cn(
              "rounded-md border-l-2 px-2.5 py-1.5 text-[13px] leading-5 transition-colors",
              isActive
                ? "border-mkt-amber bg-white/[0.06] font-semibold text-white"
                : "border-transparent text-mkt-dim hover:bg-white/[0.06] hover:text-white",
            )}
          >
            {entry.label}
          </a>
        );
      })}
    </nav>
  );
}
