/**
 * PRINT CHARTS
 * ============
 *
 * Static SVG, rendered on the server, used only on paper.
 *
 * The on-screen charts are Recharts, which measures its container to size
 * itself. During printing that measurement is unreliable -- the "Fixed vs
 * Variable" panel came out as a blank page -- and the bars are painted with
 * CSS background colour, which a browser drops when "Background graphics" is
 * off. SVG shapes are content, not decoration: they measure from a viewBox
 * and they always print.
 *
 * Colours are literal light-theme hex values rather than CSS variables,
 * because a printed page is always light no matter what the app is set to.
 */

import { categoryColor } from "@/lib/categories";
import { formatMoney, formatPercent } from "@/lib/formatters";

export const PRINT_INK = {
  revenue: "#15803d",
  expense: "#b91c1c",
  info: "#1d4ed8",
  warn: "#b45309",
  grid: "#d4d4d8",
  axis: "#52525b",
  rule: "#a1a1aa",
  text: "#18181b",
} as const;

interface Frame {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
}

const FRAME: Frame = { width: 760, height: 250, padLeft: 62, padRight: 10, padTop: 26, padBottom: 30 };

/** A rounded "nice" upper bound so the axis labels are readable numbers. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

function axisLabel(value: number, kind: "money" | "rate"): string {
  if (kind === "rate") return `$${value.toFixed(2)}`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

function Grid({
  frame,
  max,
  min = 0,
  kind,
  lines = 4,
}: {
  frame: Frame;
  max: number;
  min?: number;
  kind: "money" | "rate";
  lines?: number;
}) {
  const plotTop = frame.padTop;
  const plotBottom = frame.height - frame.padBottom;
  const rows = Array.from({ length: lines + 1 }, (_, i) => min + ((max - min) * i) / lines);

  return (
    <g>
      {rows.map((value, i) => {
        const y = plotBottom - ((value - min) / (max - min || 1)) * (plotBottom - plotTop);
        return (
          <g key={i}>
            <line
              x1={frame.padLeft}
              x2={frame.width - frame.padRight}
              y1={y}
              y2={y}
              stroke={PRINT_INK.grid}
              strokeWidth={0.75}
              strokeDasharray={i === 0 ? undefined : "3 4"}
            />
            <text
              x={frame.padLeft - 8}
              y={y + 3.5}
              textAnchor="end"
              fontSize={10}
              fill={PRINT_INK.axis}
            >
              {axisLabel(value, kind)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function XLabels({ frame, labels }: { frame: Frame; labels: string[] }) {
  const plotWidth = frame.width - frame.padLeft - frame.padRight;
  const band = plotWidth / Math.max(1, labels.length);
  return (
    <g>
      {labels.map((label, i) => (
        <text
          key={`${label}-${i}`}
          x={frame.padLeft + band * i + band / 2}
          y={frame.height - frame.padBottom + 15}
          textAnchor="middle"
          fontSize={10}
          fill={PRINT_INK.axis}
        >
          {label}
        </text>
      ))}
    </g>
  );
}

function Legend({
  frame,
  items,
  shape,
}: {
  frame: Frame;
  items: { name: string; color: string }[];
  shape: "square" | "line";
}) {
  // Laid out from the right edge so the longest label never collides with the plot.
  let cursor = frame.width - frame.padRight;
  const nodes = [...items].reverse().map((item) => {
    const textWidth = item.name.length * 5.4;
    cursor -= textWidth;
    const textX = cursor;
    cursor -= 6;
    const markX = cursor - 10;
    cursor = markX - 14;
    return (
      <g key={item.name}>
        {shape === "square" ? (
          <rect x={markX} y={7} width={8} height={8} rx={1.5} fill={item.color} />
        ) : (
          <line x1={markX} x2={markX + 12} y1={11} y2={11} stroke={item.color} strokeWidth={2} />
        )}
        <text x={textX} y={14} fontSize={10} fill={PRINT_INK.axis}>
          {item.name}
        </text>
      </g>
    );
  });
  return <g>{nodes}</g>;
}

export interface PrintSeries {
  dataKey: string;
  name: string;
  color: string;
}

/**
 * Any labelled row. Kept structural rather than tied to TrendPoint so the same
 * two charts serve every series the reports page draws, and read defensively
 * because a row written by an older build can be missing a column.
 */
export interface PrintRow {
  label: string;
}

const numberAt = (row: PrintRow, key: string): number => {
  const value = (row as unknown as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

/** Grouped bars. Used for revenue vs expenses. */
export function PrintBarChart({
  data,
  series,
  kind = "money",
}: {
  data: readonly PrintRow[];
  series: PrintSeries[];
  kind?: "money" | "rate";
}) {
  const frame = FRAME;
  const plotTop = frame.padTop;
  const plotBottom = frame.height - frame.padBottom;
  const plotWidth = frame.width - frame.padLeft - frame.padRight;
  const band = plotWidth / Math.max(1, data.length);

  const max = niceMax(
    Math.max(...data.flatMap((row) => series.map((s) => numberAt(row, s.dataKey))), 0),
  );
  const barWidth = Math.min(18, (band - 10) / series.length);

  return (
    <svg
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      width="100%"
      role="img"
      aria-label={series.map((s) => s.name).join(" and ") + " by period"}
    >
      <Grid frame={frame} max={max} kind={kind} />
      <Legend frame={frame} items={series} shape="square" />
      {data.map((row, i) => (
        <g key={`${row.label}-${i}`}>
          {series.map((s, j) => {
            const value = numberAt(row, s.dataKey);
            const height = Math.max(0, (value / max) * (plotBottom - plotTop));
            const groupWidth = barWidth * series.length + 2 * (series.length - 1);
            const x = frame.padLeft + band * i + (band - groupWidth) / 2 + j * (barWidth + 2);
            return (
              <rect
                key={s.dataKey}
                x={x}
                y={plotBottom - height}
                width={barWidth}
                height={height}
                fill={s.color}
                rx={1.5}
              />
            );
          })}
        </g>
      ))}
      <XLabels frame={frame} labels={data.map((row) => row.label)} />
    </svg>
  );
}

/** One or more lines. Used for the profit, rate and cost-per-mile trends. */
export function PrintLineChart({
  data,
  series,
  kind = "money",
}: {
  data: readonly PrintRow[];
  series: PrintSeries[];
  kind?: "money" | "rate";
}) {
  const frame = FRAME;
  const plotTop = frame.padTop;
  const plotBottom = frame.height - frame.padBottom;
  const plotWidth = frame.width - frame.padLeft - frame.padRight;
  const band = plotWidth / Math.max(1, data.length);

  const values = data.flatMap((row) => series.map((s) => numberAt(row, s.dataKey)));
  const rawMax = Math.max(...values, 0);
  const rawMin = Math.min(...values, 0);
  const max = niceMax(rawMax);
  // A cost or profit per mile can legitimately go negative; the axis has to
  // follow it rather than clipping the line flat against the floor.
  const min = rawMin < 0 ? -niceMax(Math.abs(rawMin)) : 0;

  const x = (i: number) => frame.padLeft + band * i + band / 2;
  const y = (value: number) =>
    plotBottom - ((value - min) / (max - min || 1)) * (plotBottom - plotTop);

  return (
    <svg
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      width="100%"
      role="img"
      aria-label={series.map((s) => s.name).join(" and ") + " trend"}
    >
      <Grid frame={frame} max={max} min={min} kind={kind} />
      <Legend frame={frame} items={series} shape="line" />
      {series.map((s) => (
        <g key={s.dataKey}>
          <polyline
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={data.map((row, i) => `${x(i)},${y(numberAt(row, s.dataKey))}`).join(" ")}
          />
          {data.map((row, i) => (
            <circle
              key={`${s.dataKey}-${i}`}
              cx={x(i)}
              cy={y(numberAt(row, s.dataKey))}
              r={2.4}
              fill={s.color}
            />
          ))}
        </g>
      ))}
      <XLabels frame={frame} labels={data.map((row) => row.label)} />
    </svg>
  );
}

/* ---- Donut -------------------------------------------------------------- */

function polar(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function ring(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number) {
  const large = end - start > 180 ? 1 : 0;
  const o1 = polar(cx, cy, rOuter, start);
  const o2 = polar(cx, cy, rOuter, end);
  const i2 = polar(cx, cy, rInner, end);
  const i1 = polar(cx, cy, rInner, start);
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i2.x} ${i2.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i1.x} ${i1.y}`,
    "Z",
  ].join(" ");
}

export function PrintDonut({
  data,
  total,
}: {
  data: { category: string; label: string; amount: number; share: number }[];
  total: number;
}) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const sum = data.reduce((n, d) => n + d.amount, 0) || 1;

  let angle = 0;
  const slices = data.map((item) => {
    const sweep = (item.amount / sum) * 360;
    const path = ring(cx, cy, 92, 60, angle, angle + Math.max(sweep - 0.6, 0.4));
    angle += sweep;
    return { path, color: categoryColor(item.category), key: item.category };
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Expense mix">
      {slices.map((slice) => (
        <path key={slice.key} d={slice.path} fill={slice.color} />
      ))}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={9} fill={PRINT_INK.axis} letterSpacing="0.08em">
        TOTAL
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={15} fontWeight={600} fill={PRINT_INK.text}>
        {formatMoney(total)}
      </text>
    </svg>
  );
}

/** Fixed vs variable, as one stacked bar that always prints. */
export function PrintSplitBar({ fixed, variable }: { fixed: number; variable: number }) {
  const total = fixed + variable;
  const fixedPct = total > 0 ? (fixed / total) * 100 : 0;
  const width = 760;
  const fixedWidth = (fixedPct / 100) * width;

  return (
    <svg viewBox={`0 0 ${width} 34`} width="100%" role="img" aria-label="Fixed versus variable costs">
      <rect x={0} y={10} width={fixedWidth} height={14} fill={PRINT_INK.info} rx={2} />
      <rect
        x={fixedWidth}
        y={10}
        width={Math.max(0, width - fixedWidth)}
        height={14}
        fill={PRINT_INK.warn}
        rx={2}
      />
      <text x={4} y={7} fontSize={10} fill={PRINT_INK.axis}>
        Fixed {formatMoney(fixed)} ({formatPercent(fixedPct)})
      </text>
      <text x={width - 4} y={7} fontSize={10} textAnchor="end" fill={PRINT_INK.axis}>
        Variable {formatMoney(variable)} ({formatPercent(100 - fixedPct)})
      </text>
    </svg>
  );
}

/** A horizontal share bar for the category list. */
export function PrintShareBar({ share, color }: { share: number; color: string }) {
  return (
    <svg viewBox="0 0 100 4" width="100%" height={4} preserveAspectRatio="none" aria-hidden>
      <rect x={0} y={0} width={100} height={4} fill="#e4e4e7" rx={2} />
      <rect x={0} y={0} width={Math.max(0.5, Math.min(100, share))} height={4} fill={color} rx={2} />
    </svg>
  );
}
