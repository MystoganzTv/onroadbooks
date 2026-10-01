/**
 * The PO is how an owner-operator names a load. A lane repeats every week --
 * National Harbor to Cincinnati twice in a month is two different loads -- but
 * the broker's PO / load number never does, so it is the identifier every
 * screen leads with.
 *
 * Rate cons and people type it with its label attached ("PO# 38525680",
 * "Load #38525680", "P.O. No: 38525680"). Stored with the label, the screens
 * that add their own prefix printed "Load #PO# 38525680". So the label is
 * stripped once, on the way in, and added back once, on the way out.
 */

const LABEL = String.raw`(?:p\.?\s?o\.?|purchase\s+order|load|order|carga|orden)`;
const NUMBER_WORD = String.raw`(?:\s*(?:no\.?|number|num\.?|nbr|n[º°]\.?))?`;
// A label only counts when a separator follows it, so a value that merely
// starts with those letters ("ORDERLY-7", "LOADSTAR-2") is left alone.
const PREFIX = new RegExp(
  String.raw`^(?:${LABEL}${NUMBER_WORD}\s*[#:.\-]\s*|${LABEL}${NUMBER_WORD}\s+(?=\S)|#\s*)`,
  "i",
);

/** "PO# 38525680" -> "38525680". Null when nothing is left. */
export function bareLoadReference(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.replace(/\s+/g, " ").trim();
  // "Load # PO# 38525680" carries two labels; three passes covers any real one.
  for (let pass = 0; pass < 3; pass += 1) {
    const next = value.replace(PREFIX, "").trim();
    if (!next) return null; // only a label, no number
    if (next === value) break;
    value = next;
  }
  // "PO38525680" -- the label glued straight onto the digits.
  value = value.replace(/^p\.?o\.?(?=\d)/i, "");
  return value || null;
}

/** "38525680" or "PO# 38525680" -> "PO# 38525680". Null when there is no PO. */
export function formatLoadReference(raw: string | null | undefined): string | null {
  const bare = bareLoadReference(raw);
  return bare ? `PO# ${bare}` : null;
}
