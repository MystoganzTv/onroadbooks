"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Column widths that behave like a spreadsheet (Excel, Sheets):
 *
 *   - every column has its own width, and the border you drag is always the
 *     RIGHT edge of the column you are changing;
 *   - only that column changes -- the columns after it move along, nothing
 *     else shrinks or grows to compensate;
 *   - the table is exactly as wide as its columns. Wider than the card, it
 *     scrolls sideways; narrower, it ends where the last column ends;
 *   - double-clicking a border fits the column to its widest content;
 *   - arrow keys on a focused border move it 16px.
 *
 * Widths are a per-browser convenience kept in localStorage.
 */
export interface SheetColumn {
  key: string;
  /** Default width, px. */
  width: number;
  /** Narrowest a drag or autofit may make it, px. */
  minWidth?: number;
}

type Widths = Record<string, number>;

const DEFAULT_MIN = 40;
const MAX_WIDTH = 900;

function readStored(storageKey: string): Widths {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    const widths: Widths = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) widths[key] = value;
    }
    return widths;
  } catch {
    return {};
  }
}

function writeStored(storageKey: string, widths: Widths) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(widths));
  } catch {
    // Private mode or blocked storage: widths simply reset next visit.
  }
}

/** The natural one-line width of every cell in the header cell's column. */
function contentWidth(th: HTMLTableCellElement): number {
  const table = th.closest("table");
  if (!table) return 0;
  const index = th.cellIndex;
  let widest = 0;
  for (const row of Array.from(table.rows)) {
    const cell = row.cells[index];
    if (!cell || cell.colSpan > 1) continue;
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;width:max-content;left:-100000px;top:0";
    for (const child of Array.from(cell.childNodes)) {
      if (child instanceof HTMLElement && child.getAttribute("role") === "separator") continue;
      probe.appendChild(child.cloneNode(true));
    }
    cell.appendChild(probe);
    const style = getComputedStyle(cell);
    const width = probe.getBoundingClientRect().width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    cell.removeChild(probe);
    widest = Math.max(widest, width);
  }
  return Math.ceil(widest) + 4;
}

export interface SheetColumnsState {
  widthOf: (key: string) => number;
  /** Sum of the given columns' widths: the table's exact width. */
  totalWidth: (keys: string[]) => number;
  startDrag: (key: string, event: React.PointerEvent) => void;
  nudge: (key: string, delta: number) => void;
  autofit: (key: string, th: HTMLTableCellElement) => void;
  resizing: boolean;
}

export function useSheetColumns({ storageKey, columns }: { storageKey: string; columns: SheetColumn[] }): SheetColumnsState {
  const defaults = React.useMemo(() => Object.fromEntries(columns.map((column) => [column.key, column.width])) as Widths, [columns]);
  const [widths, setWidths] = React.useState<Widths>(defaults);
  const [resizing, setResizing] = React.useState(false);

  // Server render and first paint use the defaults; stored widths apply after
  // mount so hydration always matches.
  React.useEffect(() => {
    const stored = readStored(storageKey);
    setWidths({ ...defaults, ...Object.fromEntries(Object.entries(stored).filter(([key]) => key in defaults)) });
  }, [storageKey, defaults]);

  const clamp = React.useCallback(
    (key: string, width: number) => {
      const min = columns.find((column) => column.key === key)?.minWidth ?? DEFAULT_MIN;
      return Math.round(Math.min(Math.max(width, min), MAX_WIDTH));
    },
    [columns],
  );

  const commit = React.useCallback(
    (next: Widths) => {
      setWidths(next);
      writeStored(storageKey, next);
    },
    [storageKey],
  );

  const widthOf = React.useCallback((key: string) => widths[key] ?? defaults[key] ?? 100, [defaults, widths]);

  const startDrag = React.useCallback(
    (key: string, event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const start = widths;
      const startWidth = widthOf(key);
      let latest = start;
      setResizing(true);
      const previousCursor = document.body.style.cursor;
      const previousSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const onMove = (move: PointerEvent) => {
        latest = { ...start, [key]: clamp(key, startWidth + move.clientX - startX) };
        setWidths(latest);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousSelect;
        setResizing(false);
        commit(latest);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [clamp, commit, widthOf, widths],
  );

  return {
    widthOf,
    totalWidth: (keys) => keys.reduce((total, key) => total + widthOf(key), 0),
    startDrag,
    nudge: (key, delta) => commit({ ...widths, [key]: clamp(key, widthOf(key) + delta) }),
    autofit: (key, th) => {
      const width = contentWidth(th);
      if (width > 0) commit({ ...widths, [key]: clamp(key, width) });
    },
    resizing,
  };
}

/** The draggable right border of a header cell. Its parent `<th>` must be `relative`. */
export function SheetResizeHandle({ state, columnKey, label }: { state: SheetColumnsState; columnKey: string; label: string }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={state.widthOf(columnKey)}
      tabIndex={0}
      onPointerDown={(event) => state.startDrag(columnKey, event)}
      onDoubleClick={(event) => {
        const th = (event.currentTarget as HTMLElement).closest("th");
        if (th) state.autofit(columnKey, th as HTMLTableCellElement);
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          state.nudge(columnKey, event.key === "ArrowRight" ? 16 : -16);
        }
      }}
      className="group/resize absolute inset-y-0 -right-1.5 z-10 w-3 cursor-col-resize touch-none select-none focus-visible:outline-none"
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-border transition-colors",
          "group-hover/resize:inset-y-0 group-hover/resize:w-0.5 group-hover/resize:bg-primary",
          "group-focus-visible/resize:inset-y-0 group-focus-visible/resize:w-0.5 group-focus-visible/resize:bg-primary",
          state.resizing && "bg-primary/60",
        )}
      />
    </span>
  );
}
