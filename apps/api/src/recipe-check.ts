import { matchIngredientNames, type RecipeVersion } from '@feedr/core';
import { InvalidError } from './service.ts';

// Checks an agent's recipe before the MCP saves it. Small models skip rules buried in long tool
// descriptions, but they fix a list of concrete problems. So the MCP refuses a write that breaks an
// objective rule (errors), and saves but flags what might be wrong (warnings), since a check that
// can misfire mustn't trap an agent. Only the MCP runs these: agents write recipes, and the REST
// API keeps accepting whatever it's sent.

/** Errors refuse the write; warnings come back with the saved recipe. */
export interface Check {
  errors: string[];
  warnings: string[];
}

/** The parts of a version the checks need, from a write or from the stored version. */
export interface CheckedVersion {
  notes?: string | null;
  ingredients?: { ingredient: string; unit?: string | null; section?: string | null; nutrition?: LineNutrition }[];
  steps?: { text: string; timer_seconds?: number | null; ingredients?: { line: number }[] }[];
  nutrition?: {
    kcal: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    source?: string;
  };
}

type LineNutrition = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

export interface CheckOptions {
  /** False when the ingredients are the stored ones, which carry no per-line estimates. */
  newIngredients?: boolean;
  /** Ingredient names of the version this one was based on, to catch text left over from it. */
  baseNames?: string[];
}

const DURATION = /\d+(?:\s*[–-]\s*\d+)?\s?(?:more\s)?(?:min(?:ute)?s?|hrs?|hours?|sec(?:ond)?s?)\b/gi;
const macroKcal = (n: { protein_g: number; carbs_g: number; fat_g: number }) =>
  4 * n.protein_g + 4 * n.carbs_g + 9 * n.fat_g;
/** Whole-name matches of `names` in `text`, so "stock" alone doesn't count as "chicken stock". */
const wholeNames = (text: string, names: string[]) =>
  matchIngredientNames(text, names).filter((m) => wordCount(text.slice(m.start, m.end)) === wordCount(names[m.index]!));
const wordCount = (s: string) => s.match(/\p{L}+/gu)?.length ?? 0;

/** How many separate times a step's text gives: "1 hour 15 minutes" and "10 to 12 minutes" count once. */
function waitCount(text: string) {
  const found = [...text.matchAll(DURATION)];
  return found.filter((m, i) => {
    const prev = found[i - 1];
    return !prev || !/^\s*,?\s*(?:and|to|or|-|–)?\s*$/i.test(text.slice(prev.index + prev[0].length, m.index));
  }).length;
}

/** What's wrong with a version, as instructions an agent can act on. Checks only the parts given. */
export function checkVersion(v: CheckedVersion, opts: CheckOptions = {}): Check {
  const problems: string[] = [];
  const warnings: string[] = [];
  const lines = v.ingredients ?? [];
  const steps = v.steps ?? [];

  if (lines.length && v.steps && !steps.length) problems.push('There are no steps. Give the method.');

  if (v.notes && v.notes.length > 120) {
    problems.push(`notes is ${v.notes.length} characters. Keep it to one short line, or leave it empty.`);
  }

  // Sections: all or nothing, and each section's lines together.
  const sections = new Set(opts.newIngredients === false ? [] : lines.flatMap((l) => (l.section ? [l.section] : [])));
  if (sections.size === 1) {
    problems.push('Every ingredient line has the same section. Leave section empty when the recipe has one part.');
  } else if (sections.size) {
    const missing = lines.flatMap((l, i) => (l.section ? [] : [i]));
    if (missing.length) problems.push(`Ingredient lines ${missing.join(', ')} have no section. Give every line one.`);
    const seen = new Set<string>();
    lines.forEach((l, i) => {
      if (!l.section || l.section === lines[i - 1]?.section) return;
      if (seen.has(l.section)) problems.push(`Section "${l.section}" is split up. Keep its lines together.`);
      seen.add(l.section);
    });
  }

  const counted =
    opts.newIngredients === false ? [] : lines.flatMap((l, i) => (l.unit?.toLowerCase() === 'count' ? [i] : []));
  if (counted.length) {
    problems.push(`Ingredient lines ${counted.join(', ')} have unit "count". Leave unit out for whole items (2 eggs).`);
  }

  if (steps.length) {
    const linked = new Set(steps.flatMap((s) => (s.ingredients ?? []).map((i) => i.line)));
    const unlinked = lines.flatMap((l, i) => (linked.has(i) ? [] : [`${i} (${l.ingredient})`]));
    if (unlinked.length) {
      problems.push(
        `Ingredient lines ${unlinked.join(', ')} aren't linked to any step. Link each to the step that uses it.`,
      );
    }
  }

  steps.forEach((step, s) => {
    const n = `${s + 1} ("${step.text.length > 40 ? `${step.text.slice(0, 40).trimEnd()}…` : step.text}")`;
    if (step.text.length > 400) {
      problems.push(
        `Step ${n} is ${step.text.length} characters. Split it into stages of one to three short sentences.`,
      );
    }
    const times = waitCount(step.text);
    if (step.timer_seconds && times > 1) {
      problems.push(
        `Step ${n} has a timer and gives ${times} times. Time one wait per step: split it where the next wait starts.`,
      );
    } else if (step.timer_seconds && !times) {
      warnings.push(
        `Step ${n} has a timer, but no time like "10 minutes" was found in its text. Check it's a wait the cook times.`,
      );
    }
    const links = [...new Set((step.ingredients ?? []).map((i) => i.line))].filter((i) => lines[i]);
    const names = links.map((i) => lines[i]!.ingredient);
    const named = new Set(matchIngredientNames(step.text, names).map((m) => links[m.index]));
    // Two linked lines with one name can't be told apart in the text, so they aren't checked.
    const unnamed = links.filter(
      (i, k) => !named.has(i) && names.filter((x) => x.toLowerCase() === names[k]!.toLowerCase()).length === 1,
    );
    if (unnamed.length) {
      problems.push(
        `Step ${n} links ${unnamed.map((i) => `line ${i} (${lines[i]!.ingredient})`).join(', ')}, but cook mode can't find ${unnamed.length > 1 ? 'those names' : 'that name'} in its text. Write each name as it is on its line, or drop links the step doesn't add. Once lines are combined into a paste or sauce, later steps name the paste or sauce and don't link its lines.`,
      );
    }
    // Whole ingredient names in the text whose lines this step doesn't link. Water to cover or top up needn't be.
    for (const m of wholeNames(
      step.text,
      lines.map((l) => l.ingredient),
    )) {
      const name = lines[m.index]!.ingredient;
      if (links.includes(m.index) || name.toLowerCase() === 'water') continue;
      warnings.push(
        `Step ${n} names ${name} but doesn't link line ${m.index}. Link it if the step adds or handles it.`,
      );
    }

    // Names copied from the version this one is based on, which it doesn't have.
    // Matches inside this version's own names ("paprika" in "smoked paprika") and water don't count.
    const own = new Set(lines.map((l) => l.ingredient.toLowerCase()));
    const leftover = [...new Set(opts.baseNames ?? [])].filter(
      (x) => !own.has(x.toLowerCase()) && x.toLowerCase() !== 'water',
    );
    // Deduplicated, as two lines with one name cancel each other out in the matcher.
    const ownSpans = wholeNames(step.text, [...new Set(lines.map((l) => l.ingredient.toLowerCase()))]);
    for (const m of wholeNames(step.text, leftover)) {
      if (ownSpans.some((o) => o.start <= m.start && m.end <= o.end)) continue;
      problems.push(
        `Step ${n} names ${leftover[m.index]}, which this version doesn't have. Rewrite it for this version.`,
      );
    }
  });

  // Nutrition is added up from per-line estimates, unless it's a source's published figures.
  const n = v.nutrition;
  const published = n?.source === 'from_source';
  if (n && !published) {
    problems.push(
      'Leave nutrition out and give each ingredient line its own nutrition estimate instead: the server adds them up.',
    );
  }
  if (opts.newIngredients !== false && lines.length && !published) {
    const missing = lines.flatMap((l, i) => (l.nutrition ? [] : [i]));
    if (missing.length) {
      problems.push(
        `Ingredient lines ${missing.join(', ')} have no nutrition estimate. Give every line one (0 for water and salt).`,
      );
    }
    lines.forEach((l, i) => {
      if (!l.nutrition) return;
      const fromMacros = macroKcal(l.nutrition);
      const gap = fromMacros - l.nutrition.kcal;
      if (Math.abs(gap) <= Math.max(30, 0.25 * l.nutrition.kcal)) return;
      const message = `Line ${i} (${l.ingredient}): ${l.nutrition.kcal} kcal doesn't match its macros (4 x protein + 4 x carbs + 9 x fat = ${Math.round(fromMacros)}).`;
      // Macros can't add up to more than the energy, but alcohol adds energy they don't cover.
      if (gap > 0) problems.push(`${message} Estimate it again.`);
      else warnings.push(`${message} Check it, unless the line has alcohol.`);
    });
    // Small gaps on each line can still add up to impossible totals.
    if (lines.every((l) => l.nutrition)) {
      const total = (k: keyof LineNutrition) => lines.reduce((sum, l) => sum + l.nutrition![k], 0);
      const kcal = total('kcal');
      const fromMacros = macroKcal({ protein_g: total('protein_g'), carbs_g: total('carbs_g'), fat_g: total('fat_g') });
      if (fromMacros - kcal > Math.max(50, 0.1 * kcal)) {
        problems.push(
          `The lines add up to ${Math.round(kcal)} kcal, but their macros come to ${Math.round(fromMacros)} kcal. Estimate the lines again.`,
        );
      }
    }
  }
  if (published && n.kcal && n.protein_g != null && n.carbs_g != null && n.fat_g != null) {
    const fromMacros = macroKcal({ protein_g: n.protein_g, carbs_g: n.carbs_g, fat_g: n.fat_g });
    // Published figures can include energy from alcohol or fibre, so they're only flagged.
    if (Math.abs(fromMacros - n.kcal) / n.kcal > 0.15) {
      warnings.push(
        `nutrition: ${n.kcal} kcal doesn't match its macros (${Math.round(fromMacros)}). Check the source's figures.`,
      );
    }
  }
  return { errors: problems, warnings };
}

/** What's wrong with a recipe's shared fields. */
export function checkRecipe(r: { title?: string; description?: string | null }): Check {
  const problems: string[] = [];
  if (r.title?.includes('(')) problems.push('title has brackets. Use just the dish name.');
  if (r.description && r.description.length > 300) {
    problems.push(`description is ${r.description.length} characters. Keep it to one or two sentences.`);
  }
  return { errors: problems, warnings: [] };
}

/** A stored version in the shape the checks take, with step links as line indexes. */
export function storedVersion(v: RecipeVersion): CheckedVersion {
  return {
    notes: v.notes,
    ingredients: v.ingredients,
    steps: v.steps.map((s) => ({
      text: s.text,
      timer_seconds: s.timer_seconds,
      ingredients: s.ingredients.map((i) => ({ line: v.ingredients.findIndex((l) => l.id === i.line_id) })),
    })),
    nutrition: v.nutrition ?? undefined,
  };
}

/**
 * Saves only when the checks found no errors, throwing them as one message so the agent can fix
 * them all in one go. Warnings come back with the saved result.
 */
export async function saveChecked<T extends object>(checks: Check[], save: () => Promise<T>) {
  const errors = checks.flatMap((c) => c.errors);
  const warnings = checks.flatMap((c) => c.warnings);
  if (errors.length) throw new InvalidError(`Not saved. Fix these and send it again:\n- ${errors.join('\n- ')}`);
  const saved = await save();
  return warnings.length
    ? { ...saved, warnings: ['Saved. Check these and fix any that are real:', ...warnings] }
    : saved;
}
