export type UnitFamily = 'mass' | 'volume' | 'count' | 'other';

interface UnitDef {
  family: UnitFamily;
  /** Multiplier to the family's base unit: g, ml, or 1 item. */
  factor: number;
}

const UNITS: Record<string, UnitDef> = {
  g: { family: 'mass', factor: 1 },
  gram: { family: 'mass', factor: 1 },
  kg: { family: 'mass', factor: 1000 },
  mg: { family: 'mass', factor: 0.001 },
  oz: { family: 'mass', factor: 28.3495 },
  lb: { family: 'mass', factor: 453.592 },
  ml: { family: 'volume', factor: 1 },
  l: { family: 'volume', factor: 1000 },
  litre: { family: 'volume', factor: 1000 },
  tsp: { family: 'volume', factor: 5 },
  teaspoon: { family: 'volume', factor: 5 },
  tbsp: { family: 'volume', factor: 15 },
  tablespoon: { family: 'volume', factor: 15 },
  cup: { family: 'volume', factor: 240 },
};

/** Normalises a unit string, e.g. "Tbsp", "grams", "kgs" → "tbsp", "g", "kg". Count units keep their singular word. */
export function normaliseUnit(unit: string | null | undefined): string | null {
  if (unit == null) return null;
  let u = unit.trim().toLowerCase().replace(/\.$/, '');
  if (u === '' || u === 'item' || u === 'items' || u === 'whole') return null;
  if (u === 'grams') u = 'g';
  if (u === 'kgs' || u === 'kilograms' || u === 'kilogram') u = 'kg';
  if (u === 'millilitres' || u === 'milliliters' || u === 'millilitre') u = 'ml';
  if (u === 'litres' || u === 'liters' || u === 'liter') u = 'l';
  if (u === 'tbs' || u === 'tablespoons') u = 'tbsp';
  if (u === 'teaspoons') u = 'tsp';
  if (u === 'cups') u = 'cup';
  if (u === 'ounces' || u === 'ounce') u = 'oz';
  if (u === 'lbs' || u === 'pounds' || u === 'pound') u = 'lb';
  if (!(u in UNITS) && u.length > 3 && u.endsWith('es') && /(ch|sh|s|x|z)es$/.test(u)) u = u.slice(0, -2);
  else if (!(u in UNITS) && u.length > 2 && u.endsWith('s') && !u.endsWith('ss')) u = u.slice(0, -1);
  return u;
}

export function unitFamily(unit: string | null): { family: UnitFamily; factor: number; key: string } {
  if (unit == null) return { family: 'count', factor: 1, key: '' };
  const def = UNITS[unit];
  if (def) return { ...def, key: def.family };
  return { family: 'other', factor: 1, key: unit };
}
