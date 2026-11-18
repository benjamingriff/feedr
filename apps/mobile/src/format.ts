// Display formatting shared by the screens.

/** A whole number with thousands separators, or an em dash when there's no value. */
export function num(n: number | null | undefined) {
  return n == null ? "—" : Math.round(n).toLocaleString("en-GB");
}

export const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** "Thinly sliced": names, tags and prep lines are stored lower case. */
export function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Ben", "Ben and Jess", "Ben, Jess and Sam" */
export function joinNames(names: string[]) {
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** "35 min", "1 hr", "1 hr 15 min" */
export function minutes(total: number) {
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/** Prep plus cook time, or null when a version gives neither. */
export function totalMinutes(v: { prep_minutes: number | null; cook_minutes: number | null }) {
  if (v.prep_minutes == null && v.cook_minutes == null) return null;
  return (v.prep_minutes ?? 0) + (v.cook_minutes ?? 0);
}

// Units that read the same for one or many: measures and sizes.
const FIXED_UNITS = new Set(["g", "kg", "mg", "ml", "l", "tsp", "tbsp", "oz", "lb", "large", "medium", "small"]);

/**
 * A quantity at the precision the API gave it, with its unit: "30 g", "2 large", "6 cloves", "2".
 * Count words are stored singular ("clove"), so they're made plural here.
 */
export function amount(quantity: number, unit: string | null) {
  if (!unit) return String(quantity);
  const plural =
    quantity > 1 && !FIXED_UNITS.has(unit.toLowerCase()) && !unit.endsWith("s")
      ? `${unit}${/(ch|sh|x|z)$/.test(unit) ? "es" : "s"}`
      : unit;
  return `${quantity} ${plural}`;
}
