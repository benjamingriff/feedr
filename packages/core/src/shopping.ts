import { normaliseUnit, unitFamily } from './units.ts';

export interface ShoppingLineInput {
  ingredient_id: string;
  ingredient: string;
  aisle: string | null;
  quantity: number | null;
  unit: string | null;
  raw_text: string;
  optional: boolean;
  recipe_title: string;
}

export interface ShoppingAmount {
  quantity: number;
  /** null means whole items, e.g. 3 (eggs). */
  unit: string | null;
}

export interface ShoppingItem {
  ingredient_id: string;
  ingredient: string;
  aisle: string;
  amounts: ShoppingAmount[];
  /** Lines without a quantity, e.g. "salt, to taste". */
  unquantified: string[];
  recipes: string[];
  /** True when every recipe lists it as optional. */
  optional: boolean;
}

export interface ShoppingList {
  start: string | null;
  end: string | null;
  items: ShoppingItem[];
}

export const OTHER_AISLE = 'Other';

/** Combines ingredient lines from many versions into one list grouped by ingredient and aisle. */
export function aggregateShopping(lines: ShoppingLineInput[]): ShoppingItem[] {
  const byIngredient = new Map<
    string,
    { item: ShoppingItem; totals: Map<string, { family: string; unit: string | null; base: number }> }
  >();

  for (const line of lines) {
    let entry = byIngredient.get(line.ingredient_id);
    if (!entry) {
      entry = {
        item: {
          ingredient_id: line.ingredient_id,
          ingredient: line.ingredient,
          aisle: line.aisle?.trim() || OTHER_AISLE,
          amounts: [],
          unquantified: [],
          recipes: [],
          optional: true,
        },
        totals: new Map(),
      };
      byIngredient.set(line.ingredient_id, entry);
    }
    const { item, totals } = entry;
    if (!line.optional) item.optional = false;
    if (!item.recipes.includes(line.recipe_title)) item.recipes.push(line.recipe_title);

    if (line.quantity == null) {
      if (!item.unquantified.includes(line.raw_text)) item.unquantified.push(line.raw_text);
      continue;
    }
    const unit = normaliseUnit(line.unit);
    const { family, factor, key } = unitFamily(unit);
    const total = totals.get(key) ?? { family, unit: family === 'other' ? unit : null, base: 0 };
    total.base += line.quantity * factor;
    totals.set(key, total);
  }

  const items = [...byIngredient.values()].map(({ item, totals }) => {
    item.amounts = [...totals.values()].map((t) => displayAmount(t.family, t.unit, t.base));
    return item;
  });
  return items.sort(
    (a, b) =>
      Number(a.aisle === OTHER_AISLE) - Number(b.aisle === OTHER_AISLE) ||
      a.aisle.localeCompare(b.aisle) ||
      a.ingredient.localeCompare(b.ingredient),
  );
}

function displayAmount(family: string, unit: string | null, base: number): ShoppingAmount {
  if (family === 'mass') {
    if (base >= 1000) return { quantity: round(base / 1000, 3), unit: 'kg' };
    return { quantity: base >= 10 ? Math.round(base) : round(base, 2), unit: 'g' };
  }
  if (family === 'volume') {
    if (base >= 1000) return { quantity: round(base / 1000, 3), unit: 'l' };
    // Spoons only when they express the amount exactly (to a quarter spoon); otherwise ml.
    if (base < 75 && isQuarter(base / 15) && base >= 15) return { quantity: round(base / 15, 2), unit: 'tbsp' };
    if (base < 75 && isQuarter(base / 5)) return { quantity: round(base / 5, 2), unit: 'tsp' };
    return { quantity: base >= 10 ? Math.round(base) : round(base, 1), unit: 'ml' };
  }
  return { quantity: round(base, 2), unit };
}

function isQuarter(n: number): boolean {
  return Math.abs(n * 4 - Math.round(n * 4)) < 0.01;
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
