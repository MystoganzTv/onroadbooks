"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Spreadsheet-style column widths for a `table-fixed` table.
 *
 * One column is the "fill" column (typically Description): it has no stored
 * width and takes whatever the container has left, so the table fits its
 * card and never scrolls sideways at desktop widths. Every other column has a
 * width the owner can drag, like the column borders in Excel:
 *
 *   - a border left of the fill column grows the column on its left;
 *   - a border right of the fill column grows the column on its right
 *     (dragging it left widens that column, and the fill column gives way).
 *
 * Drags are clamped so the fill column never drops below `fillMinWidth`
 * inside the current container, and when the card narrows the chosen widths
 * scale down to fit; only a phone-width viewport scrolls.
 * Widths are a per-browser convenience kept in localStorage.
 */
export interface ResizableColumn {
  key: string;
  /** Default width in px. Omit only for the single fill column. */
  width?: number;
  /** Smallest width a drag may reach, px. */
  minWidth?: number;
  /** Fixed-width columns (e.g. row actions) are never resizable. */
  fixed?: boolean;
}

interface Options {
  storageKey: string;
  /** The scroll container around the table; drags are clamped to its width. */
  containerRef: React.RefObject<HTMLElement | null>;
  columns: ResizableColumn[];
  fillMinWidth?: number;
}

type Widths = Record<string, number>;

const DEFAULT_MIN = 56;

function defaultWidths(columns: ResizableColumn[]): Widths {
  const widths: Widths = {};
  for (const column of columns) if (column.width != null) widths[column.key] = column.width;
  return widths;
}

function readStored(storageKey: string): Widths | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const widths: Widths = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) widths[key] = value;
    }
    return widths;
  } catch {
    return null;
  }
}

function writeStored(storageKey: string, widths: Widths) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(widths));
  } catch {
    // Private mode or blocked storage: widths simply reset next visit.
  }
}

export interface ColumnResizeState {
  /** Width for a column, or undefined for the fill column. */
  widthOf: (key: string) => number | undefined;
  /** Minimum table width: all sized columns plus the fill column's floor. */
  tableMinWidth: number;
  /** Which column a border after `key` controls, and in which direction. */
  handleFor: (key: string) => { target: string; direction: 1 | -1 } | null;
  startDrag: (target: string, direction: 1 | -1, event: React.PointerEvent) => void;
  nudge: (target: string, delta: number) => void;
  reset: (target: string) => void;
  resizing: boolean;
}

export function useColumnResize({ storageKey, containerRef, columns, fillMinWidth = 200 }: Options): ColumnResizeState {
  const defaults = React.useMemo(() => defaultWidths(columns), [columns]);
  const [widths, setWidths] = React.useState<Widths>(defaults);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [resizing, setResizing] = React.useState(false);

  // Server render and first paint use the defaults; the stored widths are
  // applied after mount so hydration always matches.
  React.useEffect(() => {
    const stored = readStored(storageKey);
    setWidths(stored ? { ...defaults, ...pick(stored, defaults) } : defaults);
  }, [storageKey, defaults]);

  // The card is narrower than the viewport whenever the breakdown panel sits
  // beside it, and it changes with the sidebar and window. Track it so the
  // columns always fit what is actually there.
  React.useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setContainerWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef]);

  const fillIndex = columns.findIndex((column) => column.width == null);

  const minOf = React.useCallback(
    (key: string) => columns.find((column) => column.key === key)?.minWidth ?? DEFAULT_MIN,
    [columns],
  );

  // What is rendered: the chosen widths, scaled down proportionally when the
  // card cannot hold them plus a readable fill column. Nothing drops below
  // its minimum; below that point (phones) the table scrolls.
  const effective = React.useMemo(() => {
    if (containerWidth <= 0) return widths;
    const flexible = columns.filter((column) => column.width != null && !column.fixed);
    const fixedTotal = columns
      .filter((column) => column.fixed)
      .reduce((total, column) => total + (widths[column.key] ?? column.width ?? 0), 0);
    const flexibleTotal = flexible.reduce((total, column) => total + (widths[column.key] ?? 0), 0);
    const available = containerWidth - fillMinWidth - fixedTotal;
    if (flexibleTotal <= available || flexibleTotal <= 0) return widths;
    const factor = Math.max(available, 0) / flexibleTotal;
    const next: Widths = { ...widths };
    for (const column of flexible) {
      next[column.key] = Math.max(minOf(column.key), Math.floor((widths[column.key] ?? 0) * factor));
    }
    return next;
  }, [columns, containerWidth, fillMinWidth, minOf, widths]);

  const clamp = React.useCallback(
    (target: string, next: number, current: Widths) => {
      const others = Object.entries(current)
        .filter(([key]) => key !== target)
        .reduce((total, [, width]) => total + width, 0);
      // Keep the fill column readable inside the card.
      const room = containerWidth > 0 ? containerWidth - others - fillMinWidth : Number.POSITIVE_INFINITY;
      const max = Math.max(minOf(target), room);
      return Math.round(Math.min(Math.max(next, minOf(target)), max));
    },
    [containerWidth, fillMinWidth, minOf],
  );

  const commit = React.useCallback(
    (next: Widths) => {
      setWidths(next);
      writeStored(storageKey, next);
    },
    [storageKey],
  );

  const handleFor = React.useCallback(
    (key: string) => {
      const index = columns.findIndex((column) => column.key === key);
      if (index < 0 || fillIndex < 0) return null;
      if (index < fillIndex) {
        return columns[index].fixed ? null : { target: key, direction: 1 as const };
      }
      const right = columns[index + 1];
      if (!right || right.fixed || right.width == null) return null;
      return { target: right.key, direction: -1 as const };
    },
    [columns, fillIndex],
  );

  const startDrag = React.useCallback(
    (target: string, direction: 1 | -1, event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      // Start from what is on screen, so a drag never jumps.
      const startWidths = effective;
      const startWidth = startWidths[target] ?? 0;
      let latest = startWidths;
      setResizing(true);
      const previousCursor = document.body.style.cursor;
      const previousSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (move: PointerEvent) => {
        const next = clamp(target, startWidth + (move.clientX - startX) * direction, startWidths);
        latest = { ...startWidths, [target]: next };
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
    [clamp, commit, effective],
  );

  const nudge = React.useCallback(
    (target: string, delta: number) => {
      commit({ ...effective, [target]: clamp(target, (effective[target] ?? 0) + delta, effective) });
    },
    [clamp, commit, effective],
  );

  const reset = React.useCallback(
    (target: string) => {
      if (defaults[target] == null) return;
      commit({ ...widths, [target]: defaults[target] });
    },
    [commit, defaults, widths],
  );

  const tableMinWidth = React.useMemo(
    () => Object.values(effective).reduce((total, width) => total + width, 0) + fillMinWidth,
    [effective, fillMinWidth],
  );

  return {
    widthOf: (key) => effective[key],
    tableMinWidth,
    handleFor,
    startDrag,
    nudge,
    reset,
    resizing,
  };
}

function pick(stored: Widths, defaults: Widths): Widths {
  const out: Widths = {};
  for (const key of Object.keys(defaults)) if (stored[key] != null) out[key] = stored[key];
  return out;
}

/**
 * The draggable border at the right edge of a header cell. Its parent
 * `<th>` must be `relative`. Double-click restores the default width;
 * arrow keys move the border 16px at a time.
 */
export function ColumnResizeHandle({
  state,
  columnKey,
  label,
}: {
  state: ColumnResizeState;
  columnKey: string;
  label: string;
}) {
  const handle = state.handleFor(columnKey);
  if (!handle) return null;
  const { target, direction } = handle;
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={state.widthOf(target)}
      tabIndex={0}
      onPointerDown={(event) => state.startDrag(target, direction, event)}
      onDoubleClick={() => state.reset(target)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const step = event.key === "ArrowRight" ? 16 : -16;
          state.nudge(target, step * direction);
        }
      }}
      className={cn(
        "group/resize absolute inset-y-0 -right-1.5 z-10 hidden w-3 cursor-col-resize touch-none select-none sm:block",
        "focus-visible:outline-none",
      )}
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
