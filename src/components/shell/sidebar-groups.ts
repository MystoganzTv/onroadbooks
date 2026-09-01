"use client";

/**
 * Which sidebar groups the person has collapsed.
 *
 * Two decisions worth stating, because both were wrong before.
 *
 * It stores the COLLAPSED labels, not the expanded ones. Groups get added to
 * the nav over time, and a group nobody has ever seen should arrive open --
 * storing the open ones would make every new group show up shut.
 *
 * And it is a module-level store rather than component state because the
 * shell mounts the sidebar twice, once for the desktop rail and once for the
 * mobile drawer. With local state, collapsing a group on a phone and then
 * rotating to the wide layout showed it open again.
 */

const STORAGE_KEY = "onroad.sidebar.collapsed.v1";

/** Referentially stable: useSyncExternalStore compares snapshots by identity. */
const NONE: readonly string[] = Object.freeze([]);

let collapsed: readonly string[] = NONE;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function hydrate() {
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const labels = parsed.filter((l): l is string => typeof l === "string");
    if (labels.length > 0) {
      collapsed = Object.freeze(labels);
      emit();
    }
  } catch {
    // Private mode, a cleared profile, a value someone hand-edited: the
    // sidebar opens everything and still works. Never worth throwing over.
  }
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsed));
  } catch {
    // Same: the toggle keeps working for this session, it just won't outlive it.
  }
}

export function subscribeToCollapsedGroups(listener: () => void) {
  // Subscribe first, hydrate second. The other order reads localStorage while
  // nothing is listening, and the very first sidebar to mount would keep
  // rendering the server's "everything open" until something else re-rendered it.
  listeners.add(listener);
  if (!hydrated) hydrate();
  return () => {
    listeners.delete(listener);
  };
}

export function getCollapsedGroups(): readonly string[] {
  return collapsed;
}

/** The server has no localStorage, so it renders every group open. */
export function getCollapsedGroupsOnServer(): readonly string[] {
  return NONE;
}

export function toggleGroup(label: string) {
  collapsed = Object.freeze(
    collapsed.includes(label)
      ? collapsed.filter((l) => l !== label)
      : [...collapsed, label],
  );
  persist();
  emit();
}
