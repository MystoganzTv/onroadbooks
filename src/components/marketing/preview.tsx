import { PREVIEW_FIGURES, type LandingCopy } from "@/lib/marketing/copy";
import { cn } from "@/lib/utils";

/**
 * THE MARKETING MOCK-UPS
 * ======================
 *
 * Hand-built from the design rather than screenshotted, so they stay sharp on
 * every display and cannot go stale the next time the dashboard is restyled.
 *
 * The hero shows the app the way the design does: on a laptop, with the load
 * screen on a phone leaning against it. Everything inside is sized in px so it
 * holds its proportions at any column width -- the laptop screen is roughly
 * 600px wide on a desktop and 340px on a phone, and the same markup has to
 * read at both.
 *
 * Every figure comes from `PREVIEW_FIGURES`, which is the seeded demo month --
 * the same month a new owner sees on their first visit. Nothing here is
 * invented for the sake of a nicer number.
 */

type Preview = LandingCopy["preview"];

/** Cost composition is not performance, so the donut stays on the blue/amber
 *  side of the palette: no green, no red. Order matches PREVIEW_FIGURES. */
const SLICE_COLORS = ["#4FA3F7", "#3E86D6", "#2E6AB0", "#F6A81B", "#B8801E", "#6C819B"];

function conicGradient(): string {
  let at = 0;
  const stops = PREVIEW_FIGURES.expenseSlices.map((slice, index) => {
    const from = at;
    at += slice.pct;
    return `${SLICE_COLORS[index]} ${from}% ${at}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

/* ------------------------------------------------------------------ laptop */

/**
 * The lid, the screen and the base. The base is deliberately wider than the
 * lid and sits outside the rounded corners, which is the whole trick that
 * makes a rectangle read as a laptop.
 */
export function LaptopMock({ copy, className }: { copy: Preview; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <div className="rounded-t-xl border border-b-0 border-white/[0.14] bg-[#161d28] p-2 pb-0 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.95)] sm:p-2.5 sm:pb-0">
        <div className="overflow-hidden rounded-t-md border border-b-0 border-white/[0.08]">
          <DashboardMock copy={copy} />
        </div>
      </div>
      <div
        aria-hidden
        className="relative left-1/2 h-3 w-[106%] -translate-x-1/2 rounded-b-[10px] bg-[linear-gradient(180deg,#39424f_0%,#222a35_45%,#10161f_100%)] shadow-[0_18px_30px_-18px_rgba(0,0,0,0.9)] sm:h-3.5"
      >
        <div className="mx-auto h-[3px] w-[14%] rounded-b-md bg-black/40" />
      </div>
    </div>
  );
}

function DashboardMock({ copy }: { copy: Preview }) {
  return (
    <div className="grid bg-[#0B1A30] sm:grid-cols-[104px_minmax(0,1fr)]">
      <aside className="hidden flex-col gap-px border-r border-white/[0.07] p-2 sm:flex">
        {copy.nav.map((item, index) => (
          <div
            key={item}
            className={cn(
              "truncate rounded px-2 py-[5px] text-[9.5px]",
              index === 0
                ? "flex items-center gap-1.5 bg-mkt-blue/[0.16] font-display font-semibold text-white"
                : "text-mkt-faint",
            )}
          >
            {index === 0 ? <span className="size-1 shrink-0 rounded-full bg-mkt-blue" /> : null}
            {item}
          </div>
        ))}
        <div className="mt-2 truncate px-2 py-[5px] text-[9.5px] text-mkt-faint/75">
          {copy.settings}
        </div>
      </aside>

      <div className="min-w-0 p-3 sm:p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-[13px] font-bold text-white sm:text-[15px]">
            {copy.title}
          </h3>
          <span className="whitespace-nowrap rounded border border-white/[0.14] px-2 py-[3px] text-[8.5px] text-mkt-sub">
            {copy.period}
          </span>
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-1.5 sm:gap-2">
          <MiniTile
            label={copy.tiles.revenue}
            value={PREVIEW_FIGURES.revenue}
            note={`${PREVIEW_FIGURES.expenses} ${copy.tiles.expensesNote}`}
          />
          <MiniTile
            label={copy.tiles.netProfit}
            value={PREVIEW_FIGURES.netProfit}
            note={`${PREVIEW_FIGURES.margin} ${copy.tiles.marginNote}`}
            tone="positive"
          />
          <MiniTile
            label={copy.tiles.profitPerMile}
            value={PREVIEW_FIGURES.profitPerMile}
            note={copy.tiles.cpmNote}
            accent
          />
        </div>

        <div className="mt-2 grid gap-1.5 sm:grid-cols-[1.4fr_1fr] sm:gap-2">
          <MiniPanel>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <div className="font-display text-[10px] font-semibold text-mkt-text">
                {copy.chart.title}
              </div>
              <div className="flex gap-2 text-[8px] text-mkt-dim">
                <span className="flex items-center gap-1">
                  <span className="h-px w-2.5 bg-mkt-blue" /> {copy.chart.revenue}
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-px w-2.5 bg-mkt-amber" /> {copy.chart.expenses}
                </span>
              </div>
            </div>
            <svg viewBox="0 0 420 150" className="mt-1.5 h-[84px] w-full sm:h-[100px]" aria-hidden>
              <line x1="0" y1="20" x2="420" y2="20" stroke="rgba(255,255,255,0.06)" />
              <line x1="0" y1="60" x2="420" y2="60" stroke="rgba(255,255,255,0.06)" />
              <line x1="0" y1="100" x2="420" y2="100" stroke="rgba(255,255,255,0.06)" />
              <line x1="0" y1="140" x2="420" y2="140" stroke="rgba(255,255,255,0.09)" />
              <polyline
                points="0,96 30,72 60,88 90,52 120,66 150,34 180,58 210,30 240,44 270,22 300,40 330,18 360,34 390,14 420,26"
                fill="none"
                stroke="#4FA3F7"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              <polyline
                points="0,126 30,118 60,130 90,112 120,122 150,104 180,118 210,100 240,112 270,96 300,110 330,92 360,104 390,88 420,98"
                fill="none"
                stroke="#F6A81B"
                strokeWidth="3"
                strokeLinejoin="round"
              />
            </svg>
            <div className="flex justify-between pt-1 text-[7.5px] text-mkt-faint">
              {copy.chart.ticks.map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>
          </MiniPanel>

          <MiniPanel className="flex flex-col">
            <div className="font-display text-[10px] font-semibold text-mkt-text">
              {copy.breakdown.title}
            </div>
            <div className="mt-1.5 flex flex-col">
              <MiniRow label={copy.breakdown.operatingProfit} value={PREVIEW_FIGURES.netProfit} strong />
              <MiniRow label={copy.breakdown.taxReserve} value={PREVIEW_FIGURES.taxReserve} />
              <MiniRow label={copy.breakdown.maintenanceReserve} value={PREVIEW_FIGURES.maintenanceReserve} />
              <MiniRow label={copy.breakdown.emergencyReserve} value={PREVIEW_FIGURES.emergencyReserve} />
            </div>
            <div className="mt-auto flex items-baseline justify-between gap-2 pt-2">
              <span className="font-display text-[9.5px] font-bold text-white">
                {copy.breakdown.available}
              </span>
              <span className="tnum font-display text-[15px] font-extrabold text-mkt-green">
                {PREVIEW_FIGURES.available}
              </span>
            </div>
          </MiniPanel>
        </div>
      </div>
    </div>
  );
}

function MiniPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-md border border-white/[0.08] bg-mkt-raised px-2.5 py-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

function MiniTile({
  label,
  value,
  note,
  tone = "neutral",
  accent = false,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "neutral" | "positive";
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-md border bg-mkt-raised px-2.5 py-2",
        accent ? "border-mkt-amber/35" : "border-white/[0.08]",
      )}
    >
      <div className="truncate text-[8.5px] text-mkt-dim">{label}</div>
      <div
        className={cn(
          "tnum my-0.5 font-display text-[15px] font-extrabold tracking-tight sm:text-[19px]",
          accent ? "text-mkt-amber" : "text-white",
        )}
      >
        {value}
      </div>
      <div
        className={cn("truncate text-[8px]", tone === "positive" ? "text-mkt-green" : "text-mkt-faint")}
      >
        {note}
      </div>
    </div>
  );
}

function MiniRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2 border-b border-white/[0.06] py-[5px] text-[9px] text-mkt-sub">
      <span className="min-w-0 truncate">{label}</span>
      <span className={cn("tnum whitespace-nowrap", strong ? "font-semibold text-white" : "text-mkt-text")}>
        {value}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------- phones */

function PhoneShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[24px] border-[6px] border-[#16202f] bg-[#0A1626] px-2.5 pb-3.5 pt-2.5 sm:rounded-[26px] sm:border-[7px] sm:px-3 sm:pb-4 sm:pt-3",
        className,
      )}
    >
      <div className="flex justify-between px-1 pb-2 text-[8.5px] text-mkt-faint">
        <span>9:41</span>
        <span aria-hidden>▮▮▮</span>
      </div>
      {children}
    </div>
  );
}

export function LoadPhone({ copy, className }: { copy: Preview; className?: string }) {
  return (
    <PhoneShell className={className}>
      <div className="flex items-center gap-1.5 text-[11px] text-mkt-sub">
        <span aria-hidden>&larr;</span> {copy.phone.back}
      </div>
      <div className="mb-1 mt-2.5 font-display text-[15px] font-bold leading-tight text-white">
        {copy.phone.route}
        <br />
        <span className="text-mkt-amber" aria-hidden>
          &rarr;
        </span>{" "}
        {copy.phone.routeTo}
      </div>
      <div className="text-[10px] text-mkt-faint">{copy.phone.milesNote}</div>
      <div className="mt-2.5 border-t border-white/[0.08]">
        <PhoneRow label={copy.phone.rate} value={PREVIEW_FIGURES.loadRate} className="text-white" />
        <PhoneRow
          label={copy.phone.profit}
          value={PREVIEW_FIGURES.loadProfit}
          className="font-bold text-mkt-green"
        />
        <PhoneRow
          label={copy.phone.perMile}
          value={PREVIEW_FIGURES.loadPerMile}
          className="font-bold text-mkt-amber"
          last
        />
      </div>
      <div className="mt-2 rounded-md bg-mkt-green/[0.13] py-1.5 text-center font-display text-[10px] font-bold tracking-wider text-mkt-green">
        {copy.phone.verdict}
      </div>
      <div className="mt-1 text-center text-[9px] text-mkt-faint">{copy.phone.score}</div>
    </PhoneShell>
  );
}

function PhoneRow({
  label,
  value,
  className,
  last = false,
}: {
  label: string;
  value: string;
  className?: string;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-2 py-[7px] text-[11px] text-mkt-sub",
        last ? "" : "border-b border-white/[0.06]",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className={cn("tnum whitespace-nowrap", className)}>{value}</span>
    </div>
  );
}

export function ExpensesPhone({ copy, className }: { copy: Preview; className?: string }) {
  return (
    <PhoneShell className={className}>
      <div className="text-center font-display text-[12px] font-semibold text-mkt-text">
        {copy.expensesPhone.title}
      </div>
      <div
        className="mx-auto my-3 flex size-[118px] items-center justify-center rounded-full"
        style={{ backgroundImage: conicGradient() }}
        aria-hidden
      >
        <div className="flex size-[78px] flex-col items-center justify-center rounded-full bg-[#0A1626]">
          <span className="text-[8px] text-mkt-faint">{copy.expensesPhone.total}</span>
          <span className="tnum font-display text-[16px] font-extrabold text-white">
            {PREVIEW_FIGURES.expenses}
          </span>
          <span className="text-[7.5px] text-mkt-faint">{copy.expensesPhone.note}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {PREVIEW_FIGURES.expenseSlices.map((slice, index) => (
          <div key={slice.key} className="flex items-center gap-1.5 text-[10px] text-mkt-sub">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: SLICE_COLORS[index] }}
            />
            <span className="min-w-0 truncate">{copy.expensesPhone.labels[index]}</span>
            <span className="tnum ml-auto text-white">{slice.amount}</span>
            <span className="tnum w-8 text-right text-mkt-faint">{slice.pct}%</span>
          </div>
        ))}
      </div>
    </PhoneShell>
  );
}
