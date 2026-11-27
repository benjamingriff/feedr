import { normaliseUnit } from './units.ts';

// How quantities and count names read on screen: "1½ tsp", "250 g", "2 eggs".

const FRACTIONS: [number, string][] = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [3 / 8, '⅜'],
  [1 / 2, '½'],
  [5 / 8, '⅝'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [7 / 8, '⅞'],
];

// Close enough to read 0.33 as ⅓, not so loose that 0.37 reads as ⅜.
const TOLERANCE = 0.004;

// Metric weights and volumes are measured on a scale or jug, so they keep their decimals.
const DECIMAL_UNITS = new Set(['g', 'kg', 'mg', 'ml', 'l']);

/**
 * A quantity as a cook reads it: fractions for spoons, cups and counts ("⅛", "1½", "¾"),
 * the number as given for metric units ("250", "0.5"). A fraction with no simple glyph is
 * rounded to two places ("0.37").
 */
export function quantityText(quantity: number, unit: string | null): string {
  const u = normaliseUnit(unit);
  if (u && DECIMAL_UNITS.has(u)) return String(quantity);
  const whole = Math.floor(quantity);
  const rest = quantity - whole;
  if (rest < TOLERANCE) return String(whole);
  if (1 - rest < TOLERANCE) return String(whole + 1);
  const glyph = FRACTIONS.find(([f]) => Math.abs(rest - f) < TOLERANCE)?.[1];
  if (!glyph) return String(Math.round(quantity * 100) / 100);
  return whole ? `${whole}${glyph}` : glyph;
}

/** Plurals the rules in `pluralise` get wrong. */
const IRREGULAR: Record<string, string> = {
  chilli: 'chillies',
  leaf: 'leaves',
  potato: 'potatoes',
  tomato: 'tomatoes',
};

/** The plural of a name's last word: "egg" → "eggs", "dried red chilli" → "dried red chillies". */
export function pluralise(name: string): string {
  const [, head = '', word = ''] = /^(.*?)(\p{L}+)$/u.exec(name) ?? [];
  if (!word) return name;
  const lower = word.toLowerCase();
  let plural: string;
  if (IRREGULAR[lower]) plural = IRREGULAR[lower];
  else if (/[^aeiou]y$/.test(lower)) plural = `${word.slice(0, -1)}ies`;
  else if (/(s|x|z|ch|sh)$/.test(lower)) plural = `${word}es`;
  else plural = `${word}s`;
  return head + plural;
}

/**
 * An ingredient name to sit beside its amount. Names are stored singular, so a count with no
 * unit is made plural ("2 eggs"); with a unit the unit carries the count ("2 cloves garlic").
 */
export function countName(name: string, quantity: number | null, unit: string | null): string {
  return quantity != null && quantity > 1 && !unit ? pluralise(name) : name;
}
