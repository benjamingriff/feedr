import type { Slot, SlotSplit } from './schemas.ts';
import type { DishUpGuide } from './dishup.ts';
import type { NutritionTotals } from './nutrition.ts';

/** Response shapes shared by the REST API, the MCP server and the app. */

export interface Person {
  id: string;
  name: string;
  weight_kg: number | null;
  daily_kcal: number;
  daily_protein_g: number | null;
  slot_split: SlotSplit;
}

export interface Nutrition extends NutritionTotals {
  extra: Record<string, number>;
  source: 'from_source' | 'agent_estimate';
  notes: string | null;
}

export interface IngredientLine {
  id: string;
  ingredient_id: string;
  ingredient: string;
  aisle: string | null;
  quantity: number | null;
  unit: string | null;
  raw_text: string;
  preparation: string | null;
  section: string | null;
  optional: boolean;
}

export interface Step {
  id: string;
  position: number;
  text: string;
  section: string | null;
  timer_seconds: number | null;
}

export interface RecipeVersion {
  id: string;
  recipe_id: string;
  label: string;
  servings: number;
  notes: string | null;
  is_original: boolean;
  based_on_version_id: string | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  /** Whole-batch nutrition. Divide by servings for per serving. */
  nutrition: Nutrition | null;
  ingredients: IngredientLine[];
  steps: Step[];
  created_at: string;
}

export interface RecipeSummary {
  id: string;
  title: string;
  description: string | null;
  kind: 'full' | 'simple';
  tags: string[];
  image_url: string | null;
  source_url: string | null;
  source_name: string | null;
  versions: { id: string; label: string; servings: number; kcal: number | null; is_original: boolean }[];
  updated_at: string;
}

export interface Recipe extends Omit<RecipeSummary, 'versions'> {
  versions: RecipeVersion[];
}

export interface Portion {
  id: string;
  service_id: string;
  person_id: string | null;
  person_name: string | null;
  date: string | null;
  slot: Slot | null;
  target_kcal: number;
  /** Fraction of the cooked dish, 0..1. */
  share: number;
  /** share × the version's whole-batch nutrition. */
  nutrition: NutritionTotals;
}

export interface Service {
  id: string;
  recipe_id: string;
  recipe_title: string;
  version_id: string;
  version_label: string;
  version_servings: number;
  cook_date: string;
  cooked_weight_g: number | null;
  notes: string | null;
  portions: Portion[];
  dish_up: DishUpGuide;
}

export interface PlanMeal {
  portion_id: string;
  service_id: string;
  recipe_id: string;
  recipe_title: string;
  version_label: string;
  slot: Slot;
  share: number;
  nutrition: NutritionTotals;
}

export interface PlanDayPerson {
  person_id: string;
  name: string;
  target_kcal: number;
  target_protein_g: number | null;
  totals: NutritionTotals;
  meals: PlanMeal[];
}

export interface PlanDay {
  date: string;
  people: PlanDayPerson[];
}

export interface Plan {
  start: string;
  end: string;
  days: PlanDay[];
  /** Portions of services in range with no person or date yet, e.g. leftovers. */
  unassigned: Portion[];
}

export interface Me {
  id: string;
  name: string;
  auth: 'token' | 'clerk';
}
