"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  CircleDollarSign,
  Download,
  FileText,
  Link2Off,
  Lock,
  PieChart,
  PiggyBank,
  Receipt,
  Smartphone,
  TrendingUp,
  Truck,
} from "lucide-react";

import { ExpensesPhone, LaptopMock, LoadPhone } from "@/components/marketing/preview";
import { LANDING_COPY, PREVIEW_FIGURES, type Lang, type LandingCopy } from "@/lib/marketing/copy";
import { cn } from "@/lib/utils";

/**
 * THE PUBLIC LANDING PAGE
 * =======================
 *
 * Built to the "OnRoad Books Landing" design: a fixed dark navy page with
 * amber as the single accent, one light section for the proof and the call to
 * action, the brand logo in the corner, and Archivo doing the shouting.
 *
 * Two rules this page does not break:
 *
 *  1. Every claim is about something the app does today. There are no invented
 *     customers, no star ratings, no outcome statistics. The comparison in the
 *     "profit per mile" section is revenue per mile against profit per mile
 *     from the seeded demo month -- a real contrast, not a fabricated one.
 *  2. Colour discipline. Green appears only where a figure is genuinely
 *     positive performance; red does not appear at all.
 *
 * The only client state is the language, which is why this is the one client
 * component on the route -- the page underneath it stays a server component.
 */

const HERO_ICONS = [BarChart3, CircleDollarSign, PiggyBank];
const FEATURE_ICONS = [Truck, Receipt, TrendingUp, PieChart, FileText, Smartphone];
const TRUST_ICONS = [Lock, Link2Off, Download, Truck];

export function LandingPage({ primaryHref }: { primaryHref: string }) {
  const [lang, setLang] = useState<Lang>("en");
  const c = LANDING_COPY[lang];
  const year = new Date().getFullYear();

  return (
    // overflow-x-clip, not hidden: the hero phone and the CTA phone deliberately
    // bleed past their columns. Clipping them keeps the page from scrolling
    // sideways on a phone WITHOUT creating a scroll container, which is what
    // would break the sticky header.
    <div className="min-h-screen overflow-x-clip bg-mkt-deep font-sans text-mkt-text">
      <div className="bg-mkt-amber px-5 py-2 text-center font-display text-[13px] font-bold uppercase tracking-[0.04em] text-mkt-slate">
        {c.banner.text}
      </div>

      <Header copy={c} lang={lang} onLang={setLang} primaryHref={primaryHref} />

      <main>
        {/* ------------------------------------------------------------ hero */}
        <section className="relative overflow-hidden bg-mkt-ink">
          {/* The photograph sits on the right and is walked down to nothing
              across the headline. On a phone it covers the whole hero, so it
              needs a second, vertical scrim or the copy stops being legible. */}
          <div aria-hidden className="absolute inset-x-0 top-0 h-[360px] lg:inset-y-0 lg:left-auto lg:right-0 lg:h-auto lg:w-[74%]">
            <Image
              src="/marketing/hero-truck.webp"
              alt=""
              width={1536}
              height={1024}
              priority
              className="size-full object-cover object-[46%_44%]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,#071426_0%,rgba(7,20,38,0.97)_12%,rgba(7,20,38,0.86)_30%,rgba(7,20,38,0.5)_54%,rgba(7,20,38,0.2)_78%,rgba(7,20,38,0.34)_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,20,38,0.62)_0%,rgba(7,20,38,0.72)_42%,#071426_100%)] lg:hidden" />
          </div>
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,rgba(7,20,38,0)_0%,#071426_86%)]"
          />

          <Container className="relative grid items-center gap-10 pb-16 pt-12 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-10 lg:pb-24 lg:pt-20">
            <div>
              <h1 className="font-display text-[clamp(36px,6.4vw,64px)] font-black uppercase leading-[0.95] tracking-[-0.03em] text-white">
                {c.hero.titleTop}
                <br />
                {c.hero.titleMid}
                <br />
                <span className="text-mkt-amber">{c.hero.titleAccent}</span>
              </h1>
              <p className="mt-5 max-w-[420px] text-[17px] leading-normal text-[#B9C9DD] sm:text-lg">
                {c.hero.sub}
              </p>

              <div className="mt-8 grid max-w-[560px] gap-5 sm:grid-cols-3">
                {c.hero.points.map((point, index) => {
                  const Icon = HERO_ICONS[index];
                  return (
                    <div key={point.title}>
                      <Icon className="size-[22px] text-mkt-blue" strokeWidth={1.8} aria-hidden />
                      <div className="mb-1 mt-2.5 font-display text-[14px] font-bold text-white">
                        {point.title}
                      </div>
                      <div className="text-[13.5px] leading-snug text-mkt-dim">{point.body}</div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <PrimaryButton href={primaryHref} size="lg">
                  {c.hero.cta}
                  <ArrowRight className="size-[18px]" aria-hidden />
                </PrimaryButton>
                <a
                  href="#how"
                  className="flex items-center gap-3 whitespace-nowrap rounded-[10px] border border-white/25 px-6 py-4 font-display text-base font-bold text-white transition-colors hover:bg-white/10"
                >
                  {c.hero.secondary}
                </a>
              </div>

              <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-mkt-dim">
                {c.hero.checks.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-mkt-green" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* The app on a laptop, with the load screen leaning on it. */}
            <div className="relative pb-14 sm:pb-16 lg:pl-8">
              <LaptopMock copy={c.preview} />
              <LoadPhone
                copy={c.preview}
                className="absolute -left-4 bottom-0 w-[124px] shadow-[0_34px_70px_-26px_rgba(0,0,0,0.95)] sm:-left-8 sm:w-[150px] lg:-left-10"
              />
            </div>
          </Container>
        </section>

        {/* -------------------------------------------------------- features */}
        <section id="features" className="scroll-mt-20 bg-gradient-to-b from-mkt-mid to-mkt-mid2">
          <Container className="py-14 sm:py-16">
            <h2 className="mx-auto max-w-3xl text-center font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {c.features.title}
            </h2>
            <div className="mt-10 grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {c.features.items.map((item, index) => {
                const Icon = FEATURE_ICONS[index];
                return (
                  <div
                    key={item.title}
                    className={cn(
                      "px-4 text-center",
                      index < c.features.items.length - 1 && "xl:border-r xl:border-white/[0.09]",
                    )}
                  >
                    <Icon
                      className="mx-auto size-[34px] text-mkt-blue"
                      strokeWidth={1.6}
                      aria-hidden
                    />
                    <div className="mb-2 mt-3.5 font-display text-[15.5px] font-bold text-white">
                      {item.title}
                    </div>
                    <div className="text-[14.5px] leading-snug text-mkt-dim">{item.body}</div>
                  </div>
                );
              })}
            </div>
          </Container>
        </section>

        {/* -------------------------------------------------- profit per mile */}
        <section
          id="how"
          className="relative scroll-mt-20 overflow-hidden border-t border-white/[0.07] bg-mkt-ink"
        >
          <Container className="relative grid items-center gap-9 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.05fr)]">
            <div>
              <h2 className="font-display text-[clamp(26px,3vw,42px)] font-black uppercase leading-[1.04] tracking-[-0.025em] text-white">
                {c.how.title}
                <br />
                <span className="text-mkt-amber">{c.how.titleAccent}</span>
              </h2>
              <p className="mt-6 text-[17px] leading-relaxed text-mkt-sub">{c.how.body}</p>
              <Script className="mt-7 text-mkt-blue" underline="border-mkt-blue">
                {c.how.script}
              </Script>
            </div>

            {/* The photograph bleeds to the top and bottom of the section, the
                way the design has it. It is a texture, not information, so it
                is the first thing to go when the row collapses. */}
            <div className="relative -my-16 hidden self-stretch sm:-my-20 lg:block">
              <Image
                src="/marketing/driver.webp"
                alt={c.proof.imageAlt}
                width={1400}
                height={933}
                className="absolute inset-0 size-full object-cover object-[34%_38%] [mask-composite:intersect] [mask-image:linear-gradient(90deg,transparent_0%,#000_16%,#000_84%,transparent_100%),linear-gradient(180deg,transparent_0%,#000_14%,#000_86%,transparent_100%)]"
              />
            </div>

            <div>
              <div className="mb-5 font-display text-[22px] font-extrabold uppercase tracking-[0.02em] text-white">
                {c.how.compareTitle}
              </div>
              <div className="relative grid grid-cols-2 gap-5 sm:gap-6">
                <CompareCard
                  title={c.how.cards[0].title}
                  note={c.how.cards[0].note}
                  value={PREVIEW_FIGURES.revenuePerMile}
                  unit={c.how.cards[0].unit}
                />
                <CompareCard
                  title={c.how.cards[1].title}
                  note={c.how.cards[1].note}
                  value={PREVIEW_FIGURES.profitPerMile}
                  unit={c.how.cards[1].unit}
                  accent
                />
                <div
                  aria-hidden
                  className="absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-mkt-amber bg-mkt-ink font-display text-sm font-extrabold text-mkt-amber"
                >
                  {c.how.vs}
                </div>
              </div>
              <Script className="ml-auto mt-7 text-right text-white" underline="border-mkt-amber" right>
                {c.how.scriptTwo}
              </Script>
            </div>
          </Container>
        </section>

        {/* ---------------------------------------------------- proof and CTA */}
        <section className="bg-mkt-paper text-mkt-slate">
          <Container className="flex flex-wrap items-start gap-x-14 gap-y-12 pb-14 pt-16">
            <div className="min-w-[300px] flex-1 basis-[420px]">
              <div className="font-display text-[13px] font-extrabold uppercase tracking-[0.14em] text-[#4A5A70]">
                {c.proof.eyebrow}
              </div>
              <div className="mt-5 flex flex-wrap items-start gap-6">
                <div className="min-w-[240px] flex-1 basis-[260px]">
                  <p className="font-display text-2xl font-bold leading-tight tracking-tight text-mkt-slate">
                    {c.proof.title}
                  </p>
                  <p className="mt-4 text-[17px] leading-relaxed text-[#3D4E66]">{c.proof.body}</p>
                  <ul className="mt-5 flex flex-col gap-2.5">
                    {c.proof.points.map((point) => (
                      <li key={point} className="flex gap-2.5 text-[15px] text-[#3D4E66]">
                        <Check className="mt-0.5 size-4 shrink-0 text-[#1C7A3E]" aria-hidden />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <Image
                  src="/marketing/truck-parked.webp"
                  alt={c.proof.imageAlt}
                  width={880}
                  height={563}
                  className="w-[190px] max-w-full shrink-0 rounded-xl shadow-[0_20px_44px_-24px_rgba(20,32,58,0.55)]"
                />
              </div>
            </div>

            <div className="flex min-w-[320px] flex-1 basis-[520px] flex-wrap items-start">
              <div className="min-w-[300px] flex-1 basis-[360px] rounded-2xl bg-[linear-gradient(160deg,#0E2647,#0A1B33)] px-8 pb-10 pt-9 shadow-[0_32px_70px_-34px_rgba(10,32,58,0.75)] sm:px-10 lg:mt-11">
                <h3 className="font-display text-[26px] font-extrabold leading-tight tracking-tight text-white sm:text-3xl">
                  {c.cta.title}
                </h3>
                <ul className="my-6 flex flex-col gap-3">
                  {c.cta.checks.map((item) => (
                    <li key={item} className="flex items-center gap-3 text-[15.5px] text-[#C3D1E4]">
                      <Check className="size-4 shrink-0 text-mkt-green" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
                <PrimaryButton href={primaryHref} size="lg">
                  {c.cta.button}
                  <ArrowRight className="size-[18px]" aria-hidden />
                </PrimaryButton>
              </div>

              <ExpensesPhone
                copy={c.preview}
                className="relative z-[2] -ml-6 hidden w-[190px] shrink-0 shadow-[0_34px_70px_-26px_rgba(20,32,58,0.75)] xl:block"
              />
            </div>
          </Container>

          <Container className="pb-12">
            <div className="flex flex-wrap items-center gap-x-10 gap-y-5 border-t border-mkt-slate/15 pt-6">
              <div className="font-display text-[14.5px] font-extrabold uppercase tracking-[0.08em] text-mkt-slate">
                {c.trust.line}
              </div>
              <div className="ml-auto flex flex-wrap gap-x-8 gap-y-3 text-[14.5px] text-[#3D4E66]">
                {c.trust.items.map((item, index) => {
                  const Icon = TRUST_ICONS[index];
                  return (
                    <span key={item} className="flex items-center gap-2.5">
                      <Icon className="size-[17px] text-mkt-slate" strokeWidth={1.7} aria-hidden />
                      {item}
                    </span>
                  );
                })}
              </div>
            </div>
          </Container>
        </section>

        {/* --------------------------------------------------------- pricing */}
        <section id="pricing" className="scroll-mt-20 bg-mkt-ink">
          <Container className="pt-16 text-center sm:pt-[72px]">
            <div className="font-display text-[13px] font-extrabold uppercase tracking-[0.14em] text-mkt-amber">
              {c.pricing.eyebrow}
            </div>
            <h2 className="mx-auto mt-4 max-w-[660px] font-display text-[clamp(30px,4.4vw,58px)] font-black uppercase leading-none tracking-[-0.03em] text-white">
              {c.pricing.title}
            </h2>
            <p className="mx-auto mt-5 max-w-[520px] text-lg leading-relaxed text-mkt-sub">
              {c.pricing.sub}
            </p>
          </Container>

          <Container className="grid max-w-[900px] items-start gap-5 pb-16 pt-10 sm:grid-cols-2 sm:pb-20">
            {c.pricing.plans.map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  "rounded-2xl px-7 pb-8 pt-8",
                  plan.featured
                    ? "border border-mkt-amber/55 bg-[linear-gradient(165deg,#123055,#0A1B33)] shadow-[0_30px_70px_-34px_rgba(246,168,27,0.5)]"
                    : "border border-white/10 bg-mkt-panel",
                )}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="font-display text-[19px] font-bold text-white">{plan.name}</div>
                  <span
                    className={cn(
                      "whitespace-nowrap rounded-md px-2.5 py-1 font-display text-[10.5px] font-extrabold uppercase tracking-[0.08em]",
                      plan.featured
                        ? "bg-mkt-amber text-mkt-slate"
                        : "border border-white/20 text-mkt-sub",
                    )}
                  >
                    {plan.badge}
                  </span>
                </div>
                <div className="mt-1.5 text-[14.5px] text-mkt-dim">{plan.tagline}</div>
                <div className="mb-1 mt-6 flex items-baseline gap-2">
                  <span
                    className={cn(
                      "tnum font-display text-[46px] font-extrabold tracking-[-0.03em]",
                      plan.featured ? "text-mkt-amber" : "text-white",
                    )}
                  >
                    {plan.price}
                  </span>
                  <span className="text-[15px] text-mkt-dim">{c.pricing.per}</span>
                </div>
                <ul className="my-7 flex flex-col gap-3 text-[15px] text-[#B9C9DD]">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-mkt-green" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
                {plan.featured ? (
                  <PrimaryButton href={primaryHref} block>
                    {plan.cta}
                  </PrimaryButton>
                ) : (
                  <Link
                    href={primaryHref}
                    className="block rounded-[10px] border border-white/25 px-4 py-3.5 text-center font-display text-base font-bold text-white transition-colors hover:bg-white/10"
                  >
                    {plan.cta}
                  </Link>
                )}
                {plan.note ? (
                  <p className="mt-4 text-[13px] leading-relaxed text-mkt-faint">{plan.note}</p>
                ) : null}
              </div>
            ))}
          </Container>
        </section>

        {/* ------------------------------------------------------------- FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-white/[0.07] bg-mkt-ink">
          <Container className="py-16 sm:py-20">
            <h2 className="font-display text-[26px] font-extrabold text-white">{c.faq.title}</h2>
            <div className="mt-6 grid gap-4.5 md:grid-cols-2">
              {c.faq.items.map((item) => (
                <div
                  key={item.q}
                  className="rounded-xl border border-white/[0.08] bg-mkt-panel px-6 py-6"
                >
                  <div className="mb-2 font-display text-[16.5px] font-bold text-white">{item.q}</div>
                  <p className="text-[15px] leading-relaxed text-mkt-dim">{item.a}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>
      </main>

      <footer className="border-t border-white/[0.07] bg-mkt-deep">
        <Container className="flex flex-wrap items-center gap-x-8 gap-y-6 py-11">
          <Wordmark className="h-9 sm:h-10" />
          <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-2 text-[14.5px]">
            {c.footer.links.map((link) => (
              <a key={link.href} href={link.href} className="text-mkt-dim transition-colors hover:text-white">
                {link.label}
              </a>
            ))}
            <Link href={primaryHref} className="text-mkt-dim transition-colors hover:text-white">
              {c.nav.signIn}
            </Link>
            <LangToggle label={c.nav.langLabel} lang={lang} onLang={setLang} />
          </div>
          <div className="w-full border-t border-white/[0.06] pt-5 text-[13px] leading-relaxed text-mkt-faint">
            <p>{c.footer.disclaimer}</p>
            <p className="mt-2">
              &copy; {year} OnRoad Books. {c.footer.tagline} {c.footer.rights}
            </p>
          </div>
        </Container>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ chrome */

function Header({
  copy,
  lang,
  onLang,
  primaryHref,
}: {
  copy: LandingCopy;
  lang: Lang;
  onLang: (lang: Lang) => void;
  primaryHref: string;
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-mkt-deep/85 backdrop-blur-md">
      <Container className="flex items-center gap-3 py-2.5 sm:gap-5 sm:py-3 lg:gap-8">
        <Link href="/" aria-label="OnRoad Books">
          <Wordmark className="h-10 sm:h-14" priority />
        </Link>

        <nav className="hidden gap-5 lg:flex">
          {copy.nav.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="whitespace-nowrap text-[15px] font-medium text-[#C3D1E4] transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5 sm:gap-3.5">
          <LangToggle
            className="hidden sm:flex"
            label={copy.nav.langLabel}
            lang={lang}
            onLang={onLang}
          />
          <Link
            href={primaryHref}
            className="hidden whitespace-nowrap rounded-lg border border-white/[0.22] px-5 py-2.5 font-display text-[14.5px] font-semibold text-mkt-text transition-colors hover:bg-white/10 hover:text-white sm:block"
          >
            {copy.nav.signIn}
          </Link>
          <PrimaryButton href={primaryHref}>
            <span className="sm:hidden">{copy.nav.ctaShort}</span>
            <span className="hidden sm:inline">{copy.nav.cta}</span>
          </PrimaryButton>
        </div>
      </Container>
    </header>
  );
}

/** The brand logo. Callers set the height; the width follows. */
function Wordmark({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/marketing/logo.webp"
      alt="OnRoad Books — Bookkeeping built for the road"
      width={720}
      height={179}
      priority={priority}
      className={cn("w-auto", className)}
    />
  );
}

function LangToggle({
  label,
  lang,
  onLang,
  className,
}: {
  label: string;
  lang: Lang;
  onLang: (lang: Lang) => void;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-center rounded-lg border border-white/[0.14] p-0.5", className)}
      role="group"
      aria-label={label}
    >
      {(["en", "es"] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onLang(value)}
          aria-pressed={lang === value}
          className={cn(
            "rounded-md px-2 py-1 font-display text-[11.5px] font-bold uppercase transition-colors",
            lang === value ? "bg-white/[0.12] text-white" : "text-mkt-faint hover:text-mkt-text",
          )}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- parts */

function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1280px] px-5 sm:px-10", className)}>{children}</div>;
}

function PrimaryButton({
  href,
  children,
  size = "sm",
  block = false,
}: {
  href: string;
  children: React.ReactNode;
  size?: "sm" | "lg";
  block?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "whitespace-nowrap rounded-lg bg-mkt-amber font-display font-extrabold text-mkt-slate transition-colors hover:bg-mkt-amberhi",
        size === "lg"
          ? "flex items-center gap-3 rounded-[10px] px-7 py-4 text-base shadow-[0_18px_40px_-18px_rgba(246,168,27,0.95)] sm:text-[17px]"
          : "px-3.5 py-2 text-[13px] shadow-[0_8px_24px_-10px_rgba(246,168,27,0.9)] sm:px-5 sm:py-2.5 sm:text-[14.5px]",
        block && "block w-full px-4 py-3.5 text-center text-base",
      )}
    >
      {children}
    </Link>
  );
}

function CompareCard({
  title,
  note,
  value,
  unit,
  accent = false,
}: {
  title: string;
  note: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-6 text-center sm:px-5",
        accent
          ? "border-mkt-green/40 bg-[#0C2A1C] shadow-[0_24px_60px_-30px_rgba(99,216,67,0.6)]"
          : "border-white/[0.12] bg-mkt-panel",
      )}
    >
      <div
        className={cn(
          "font-display text-[15px] font-bold sm:text-[17px]",
          accent ? "text-mkt-green" : "text-white",
        )}
      >
        {title}
      </div>
      <div className={cn("mt-1.5 text-[13px]", accent ? "text-[#93B79A]" : "text-mkt-dim")}>{note}</div>
      <div
        className={cn(
          "tnum mb-0.5 mt-4 font-display text-[38px] font-extrabold tracking-[-0.03em] sm:text-[46px]",
          accent ? "text-mkt-green" : "text-mkt-text",
        )}
      >
        {value}
      </div>
      <div className={cn("text-[13px]", accent ? "text-[#93B79A]" : "text-mkt-dim")}>{unit}</div>
    </div>
  );
}

/** One of the two handwritten asides, with the swoop underneath it. */
function Script({
  children,
  className,
  underline,
  right = false,
}: {
  children: string;
  className?: string;
  underline: string;
  right?: boolean;
}) {
  return (
    <div className={cn("font-script text-[27px] leading-tight sm:text-3xl", className)}>
      {children.split("\n").map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
      <div
        aria-hidden
        className={cn(
          "mt-0.5 h-2 w-[190px] rounded-b-[60%] border-b-[3px]",
          underline,
          right && "ml-auto w-[210px]",
        )}
      />
    </div>
  );
}
