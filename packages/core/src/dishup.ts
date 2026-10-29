import { SLOTS, type Slot } from './schemas.ts';
import { sharesFromTargets } from './portions.ts';

export interface DishUpPortionInput {
  id: string;
  person_name: string | null;
  date: string | null;
  slot: Slot | null;
  target_kcal: number;
}

export interface DishUpPortion {
  portion_id: string;
  person_name: string | null;
  /** Fraction of the whole dish. */
  share: number;
  /** Fraction of this meal's part of the dish. */
  share_of_meal: number;
  grams: number | null;
  /** The last portion takes whatever is left, so rounding never leaves anyone short. */
  is_rest: boolean;
}

export interface DishUpMeal {
  date: string | null;
  slot: Slot | null;
  share: number;
  grams: number | null;
  /** Plain-language size of this meal's part of the pot, e.g. "just over half". */
  fraction: string | null;
  /** Nearest simple ratio between the people at this meal, e.g. "4:3". */
  ratio: string | null;
  is_rest: boolean;
  portions: DishUpPortion[];
}

export interface DishUpGuide {
  cooked_weight_g: number | null;
  meals: DishUpMeal[];
}

/**
 * How to split one cooked dish: first into meals (tonight's plates, tomorrow's lunch boxes),
 * then between the people at each meal. Shares follow calorie targets; grams follow the cooked weight.
 */
export function dishUpGuide(portions: DishUpPortionInput[], cookedWeightG: number | null): DishUpGuide {
  const shares = sharesFromTargets(portions.map((p) => p.target_kcal));
  const withShare = portions.map((p, i) => ({ ...p, share: shares[i] ?? 0 }));

  const groups = new Map<string, typeof withShare>();
  for (const p of withShare) {
    const key = `${p.date ?? '~'}|${p.slot ? SLOTS.indexOf(p.slot) : 9}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g);

  // Grams rounded to 5 g; the very last portion takes the remainder.
  const flat = ordered.flat();
  const grams = new Map<string, number>();
  if (cookedWeightG != null) {
    let used = 0;
    flat.forEach((p, i) => {
      const g = i === flat.length - 1 ? cookedWeightG - used : Math.round((p.share * cookedWeightG) / 5) * 5;
      grams.set(p.id, Math.max(0, Math.round(g)));
      used += g;
    });
  }

  const meals = ordered.map((group, gi): DishUpMeal => {
    const share = group.reduce((s, p) => s + p.share, 0);
    const isLastMeal = gi === ordered.length - 1 && ordered.length > 1;
    return {
      date: group[0]?.date ?? null,
      slot: group[0]?.slot ?? null,
      share,
      grams: cookedWeightG == null ? null : group.reduce((s, p) => s + (grams.get(p.id) ?? 0), 0),
      fraction: ordered.length > 1 ? fractionWords(share) : 'all of it',
      ratio: group.length > 1 ? simpleRatio(group.map((p) => p.share)) : null,
      is_rest: isLastMeal,
      portions: group.map((p, pi) => ({
        portion_id: p.id,
        person_name: p.person_name,
        share: p.share,
        share_of_meal: share > 0 ? p.share / share : 0,
        grams: cookedWeightG == null ? null : (grams.get(p.id) ?? 0),
        is_rest: gi === ordered.length - 1 && pi === group.length - 1 && flat.length > 1,
      })),
    };
  });

  return { cooked_weight_g: cookedWeightG, meals };
}

const FRACTIONS: [number, string][] = [
  [1 / 4, 'a quarter'],
  [1 / 3, 'a third'],
  [1 / 2, 'half'],
  [2 / 3, 'two-thirds'],
  [3 / 4, 'three-quarters'],
];

/** e.g. 0.59 → "just over half", 0.34 → "about a third". null when nothing simple is close. */
export function fractionWords(share: number): string | null {
  const exact = FRACTIONS.find(([f]) => Math.abs(share - f) <= 0.02);
  if (exact) return `about ${exact[1]}`;
  // "Just over" reads more naturally when dishing up: serve the simple fraction, then a little more.
  const below = [...FRACTIONS].reverse().find(([f]) => f < share);
  if (below && share - below[0] <= 0.1) return `just over ${below[1]}`;
  const above = FRACTIONS.find(([f]) => f > share);
  if (above && above[0] - share <= 0.1) return `just under ${above[1]}`;
  return null;
}

/** Smallest whole-number ratio within 1.5 percentage points of the shares, e.g. [0.58, 0.42] → "4:3". */
export function simpleRatio(shares: number[]): string | null {
  const total = shares.reduce((s, x) => s + x, 0);
  if (total <= 0 || shares.length < 2) return null;
  const norm = shares.map((s) => s / total);
  const min = Math.min(...norm);
  if (min <= 0) return null;
  for (let base = 1; base <= 6; base++) {
    const ints = norm.map((s) => Math.round((s / min) * base));
    if (ints.some((n) => n > 9)) break;
    const sum = ints.reduce((s, x) => s + x, 0);
    if (ints.every((n, i) => Math.abs(n / sum - (norm[i] ?? 0)) <= 0.015)) return ints.join(':');
  }
  return null;
}
