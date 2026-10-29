export const NUTRIENT_KEYS = [
  'kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'saturated_fat_g',
  'fibre_g',
  'sugar_g',
  'salt_g',
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** null means the source didn't give a value. */
export type NutritionTotals = Record<NutrientKey, number | null>;

export function emptyTotals(): NutritionTotals {
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as NutritionTotals;
}

export function scaleNutrition(n: NutritionTotals, factor: number): NutritionTotals {
  return Object.fromEntries(
    NUTRIENT_KEYS.map((k) => [k, n[k] == null ? null : round1(n[k] * factor)]),
  ) as NutritionTotals;
}

/** Adds b into a. A missing value on either side makes the total unknown. */
export function addNutrition(a: NutritionTotals, b: NutritionTotals): NutritionTotals {
  return Object.fromEntries(
    NUTRIENT_KEYS.map((k) => {
      const x = a[k];
      const y = b[k];
      return [k, x == null || y == null ? null : round1(x + y)];
    }),
  ) as NutritionTotals;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
