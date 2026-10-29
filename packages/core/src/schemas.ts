import { z } from 'zod';

export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const Slot = z.enum(SLOTS);
export type Slot = z.infer<typeof Slot>;

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const Id = z.uuid();

/** Fraction of a person's daily calories for each meal slot. Snack is the total for all snacks that day. */
export const SlotSplit = z.object({
  breakfast: z.number().min(0).max(1),
  lunch: z.number().min(0).max(1),
  dinner: z.number().min(0).max(1),
  snack: z.number().min(0).max(1),
});
export type SlotSplit = z.infer<typeof SlotSplit>;
export const DEFAULT_SLOT_SPLIT: SlotSplit = { breakfast: 0.25, lunch: 0.3, dinner: 0.35, snack: 0.1 };

export const PersonInput = z.object({
  name: z.string().min(1),
  weight_kg: z.number().positive().nullish(),
  daily_kcal: z.number().int().positive(),
  daily_protein_g: z.number().nonnegative().nullish(),
  slot_split: SlotSplit.optional(),
});
export const PersonUpdate = PersonInput.partial();

/** Nutrition for the WHOLE batch a version makes, not per serving. */
export const NutritionInput = z.object({
  kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  saturated_fat_g: z.number().nonnegative().nullish(),
  fibre_g: z.number().nonnegative().nullish(),
  sugar_g: z.number().nonnegative().nullish(),
  salt_g: z.number().nonnegative().nullish(),
  extra: z.record(z.string(), z.number()).optional().describe('Further nutrients, e.g. {"iron_mg": 4.2}'),
  source: z.enum(['from_source', 'agent_estimate']),
  notes: z.string().nullish(),
});
export type NutritionInput = z.infer<typeof NutritionInput>;

export const IngredientLineInput = z.object({
  ingredient: z.string().min(1).describe('Canonical ingredient name, e.g. "red onion". Reuse existing names from list_ingredients.'),
  aisle: z.string().nullish().describe('Supermarket aisle for new ingredients, e.g. "Produce", "Dairy", "Spices"'),
  quantity: z.number().positive().nullish(),
  unit: z.string().nullish().describe('g, kg, ml, l, tsp, tbsp, or a count word like "clove", "can". Omit for whole items (e.g. 2 eggs).'),
  raw_text: z.string().min(1).describe('The line as a cook reads it, e.g. "2 red onions, finely sliced"'),
  preparation: z.string().nullish(),
  section: z.string().nullish().describe('Group heading, e.g. "For the sauce"'),
  optional: z.boolean().optional(),
});
export type IngredientLineInput = z.infer<typeof IngredientLineInput>;

export const StepInput = z.object({
  text: z.string().min(1),
  section: z.string().nullish(),
  timer_seconds: z.number().int().positive().nullish(),
});

export const VersionInput = z.object({
  label: z.string().min(1).describe('e.g. "Original", "For two", "Batch for four"'),
  servings: z.number().positive(),
  notes: z.string().nullish().describe('What changed and why, e.g. "Kept 3 eggs; curry powder 1.5 tbsp, not a straight 1.1"'),
  based_on_version_id: Id.nullish(),
  prep_minutes: z.number().int().nonnegative().nullish(),
  cook_minutes: z.number().int().nonnegative().nullish(),
  ingredients: z.array(IngredientLineInput),
  steps: z.array(StepInput),
  nutrition: NutritionInput,
});
export type VersionInput = z.infer<typeof VersionInput>;

export const RecipeFields = z.object({
  title: z.string().min(1),
  description: z.string().nullish(),
  source_url: z.url().nullish(),
  source_name: z.string().nullish(),
  kind: z.enum(['full', 'simple']).optional().describe('"simple" for snacks like "yoghurt + honey"'),
  tags: z.array(z.string()).optional(),
  image_url: z.url().nullish(),
});

export const RecipeCreate = RecipeFields.extend({
  original: VersionInput.describe('The recipe as published. Its label defaults to "Original".').partial({ label: true }),
});
export type RecipeCreate = z.infer<typeof RecipeCreate>;
export const RecipeUpdate = RecipeFields.partial();

export const PortionInput = z
  .object({
    person_id: Id.nullish(),
    date: IsoDate.nullish(),
    slot: Slot.nullish(),
    target_kcal: z.number().positive().nullish().describe('Override the calculated target. Required when there is no person and slot (e.g. unassigned leftovers).'),
  })
  .refine((p) => p.target_kcal != null || (p.person_id != null && p.slot != null), {
    message: 'Give target_kcal, or both person_id and slot so it can be calculated',
  });
export type PortionInput = z.infer<typeof PortionInput>;

export const ServiceCreate = z.object({
  version_id: Id,
  cook_date: IsoDate,
  notes: z.string().nullish(),
  portions: z.array(PortionInput).min(1),
});
export type ServiceCreate = z.infer<typeof ServiceCreate>;

export const ServiceUpdate = z.object({
  cooked_weight_g: z.number().positive().nullable().optional(),
  cook_date: IsoDate.optional(),
  notes: z.string().nullable().optional(),
});

export const PortionUpdate = z.object({
  person_id: Id.nullable().optional(),
  date: IsoDate.nullable().optional(),
  slot: Slot.nullable().optional(),
  target_kcal: z.number().positive().optional(),
});

export const DateRange = z.object({ start: IsoDate, end: IsoDate });
