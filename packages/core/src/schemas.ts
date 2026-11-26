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
  source: z
    .enum(['from_source', 'agent_estimate'])
    .describe(
      "agent_estimate: your own estimate. from_source: only when its ingredients are exactly the source's and every figure is published.",
    ),
  notes: z.string().nullish().describe('Leave empty'),
});
export type NutritionInput = z.infer<typeof NutritionInput>;

/** An agent's estimate for one ingredient line. The server adds a version's lines up for its batch nutrition. */
export const LineNutritionInput = z.object({
  kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
});

export const IngredientLineInput = z.object({
  ingredient: z
    .string()
    .min(1)
    .describe('Canonical ingredient name, e.g. "red onion". Reuse existing names from list_ingredients.'),
  aisle: z
    .string()
    .nullish()
    .describe(
      'For a new ingredient: an existing aisle, or one of Produce, Meat & fish, Dairy, Bakery, Baking, Spices, Tins & jars, Rice & pasta, Oils & sauces, Frozen. Omit for water.',
    ),
  quantity: z.number().positive().nullish(),
  unit: z
    .string()
    .nullish()
    .describe('g, kg, ml, l, tsp, tbsp, or a count word like "clove", "can". Omit for whole items (e.g. 2 eggs).'),
  raw_text: z
    .string()
    .min(1)
    .describe(
      'The line as it reads in this version, e.g. "2 red onions, finely sliced". Shown only when there is no quantity.',
    ),
  preparation: z.string().nullish().describe('The prep the cook must do, e.g. "finely sliced". Shown under the name.'),
  section: z
    .string()
    .nullish()
    .describe('Only when the recipe has separate parts, e.g. "Sauce". Then every line gets one.'),
  optional: z.boolean().optional().describe('For garnishes and extras'),
  nutrition: LineNutritionInput.optional().describe(
    "Your estimate for this line's amount, as bought (rice and pasta dry). 0 for water and salt.",
  ),
});
export type IngredientLineInput = z.infer<typeof IngredientLineInput>;

export const StepIngredientInput = z.object({
  line: z.number().int().nonnegative().describe("Index into this version's ingredients array, starting at 0"),
  quantity: z
    .number()
    .positive()
    .nullish()
    .describe('Amount used in this step, when the step uses only part of the line'),
  unit: z.string().nullish(),
});

export const StepInput = z.object({
  text: z
    .string()
    .min(1)
    .describe('One stage of cooking in one to three short sentences, naming the ingredients it uses'),
  section: z.string().nullish(),
  timer_seconds: z
    .number()
    .int()
    .positive()
    .nullish()
    .describe('For the one wait the cook times in this step, until their next action'),
  ingredients: z
    .array(StepIngredientInput)
    .optional()
    .describe('The ingredient lines this step uses. The app lists them beside the step in cook mode.'),
});

export const VersionInput = z.object({
  label: z.string().min(1).describe('What makes this version different, e.g. "Original", "Chicken", "For two"'),
  servings: z.number().positive().describe('How many even portions the batch makes'),
  notes: z
    .string()
    .nullish()
    .describe(
      'Usually empty. One short line the cook must know before starting, e.g. "High protein: twice the usual chicken". Never what changed or why (not "Chicken replaces the beef").',
    ),
  based_on_version_id: Id.nullish().describe(
    "The version this one starts from: a versions[].id from get_recipe, not the recipe's id",
  ),
  prep_minutes: z.number().int().nonnegative().nullish(),
  cook_minutes: z.number().int().nonnegative().nullish(),
  ingredients: z.array(IngredientLineInput),
  steps: z.array(StepInput),
  nutrition: NutritionInput.optional().describe(
    "Leave out: the server adds up the lines' estimates. Send it only to copy a source's published figures for its unchanged recipe.",
  ),
});
export type VersionInput = z.infer<typeof VersionInput>;

export const RecipeFields = z.object({
  title: z.string().min(1),
  description: z.string().nullish().describe('One or two sentences on what the dish is and what it is like to eat'),
  source_url: z.url().nullish(),
  source_name: z.string().nullish(),
  kind: z.enum(['full', 'simple']).optional().describe('"simple" for snacks like "yoghurt + honey"'),
  tags: z.array(z.string()).optional().describe('Meal type: breakfast, lunch, dinner or treat'),
  image_url: z.url().nullish(),
});

export const RecipeCreate = RecipeFields.extend({
  original: VersionInput.partial({ label: true }).describe(
    'The recipe as this household cooks it. Its label defaults to "Original".',
  ),
});
export type RecipeCreate = z.infer<typeof RecipeCreate>;
export const RecipeUpdate = RecipeFields.partial();

export const PortionInput = z
  .object({
    person_id: Id.nullish(),
    date: IsoDate.nullish(),
    slot: Slot.nullish(),
    target_kcal: z
      .number()
      .positive()
      .nullish()
      .describe(
        'Override the calculated target. Required when there is no person and slot (e.g. unassigned leftovers).',
      ),
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
