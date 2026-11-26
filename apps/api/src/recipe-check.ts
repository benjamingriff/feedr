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
  label?: string;
  servings?: number;
  notes?: string | null;
  ingredients?: {
    ingredient: string;
    quantity?: number | null;
    unit?: string | null;
    raw_text?: string | null;
    preparation?: string | null;
    section?: string | null;
    nutrition?: LineNutrition;
  }[];
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
  /** Protein per serving of the version this one is based on, for checking a high-protein version. */
  baseProteinPerServing?: number;
  /** The recipe's shared title, checked against a new version's ingredients. */
  title?: string;
  /** True for create_recipe and create_recipe_version, where a new version is being written. */
  isNew?: boolean;
  /** The label of the version this one was based on, naming the main it may have swapped out. */
  baseLabel?: string;
  /** Names already in the user's catalog, to catch near-duplicates like "cumin" and "ground cumin". */
  knownNames?: string[];
  /** The summed targets of the meals the version is cooked for, when the agent says. */
  mealTargets?: { kcal: number; portions: { name: string; kcal: number; protein_g: number | null }[] };
}

/**
 * True when another, longer line's last two words end at `end` in the text, so a match for the shorter
 * name there ("shallots" in "fried shallots") really belongs to the longer line (Asian fried shallots).
 */
function endsLongerName(text: string, end: number, lines: { ingredient: string }[], index: number, linked: number[]) {
  const before = (
    text
      .slice(0, end)
      .toLowerCase()
      .match(/\p{L}+/gu) ?? []
  ).map((w) => w.replace(/e?s$/, ''));
  return lines.some((l, i) => {
    const name = (l.ingredient.toLowerCase().match(/\p{L}+/gu) ?? []).map((w) => w.replace(/e?s$/, ''));
    if (i === index || name.length < 2 || !linked.includes(i)) return false;
    const tail = name.slice(-2);
    return before.slice(-2).join(' ') === tail.join(' ') && tail.length === 2;
  });
}

/** Words in raw_text beyond the amount, name and unit: prep the app would drop. */
function extraWords(text: string, fields: string) {
  const known = new Set((fields.toLowerCase().match(/\p{L}+/gu) ?? []).map((w) => w.replace(/e?s$/, '')));
  const filler = new Set(['of', 'a', 'an', 'x', 'can', 'tin', 'pack', 'about', 'and']);
  return (text.toLowerCase().match(/\p{L}+/gu) ?? []).filter(
    (w) => !known.has(w.replace(/e?s$/, '')) && !filler.has(w) && !/^(?:g|kg|ml|l|tsp|tbsp)$/.test(w),
  );
}

/** "Ground cumin", "cumins" and "cumin" all come to "cumin". */
const baseName = (name: string) =>
  name
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !['ground', 'dried', 'fresh'].includes(w))
    .map((w) => (w.length > 3 ? w.replace(/e?s$/, '') : w))
    .join(' ');

const DURATION = /\d+[½¼¾]?(?:\s*[–-]\s*\d+[½¼¾]?)?\s?(?:more\s)?(?:min(?:ute)?s?|hrs?|hours?|sec(?:ond)?s?)\b/gi;
// A sentence opening "Meanwhile", "At the same time" or "While …": a separate task done during a wait.
const PARALLEL = /^\s*(?:meanwhile|at the same time|while)\b|[.;:]\s*(?:meanwhile|at the same time|while)\b/i;
const IMPERIAL =
  /(?:\b\d+(?:[./]\d+)?|[½¼¾⅓⅔])\s*-?\s*(?:cups?|oz|ounces?|lbs?|pounds?|inch(?:es)?|°\s?F)(?![a-z])|\b\d{3}\s?F\b/i;
const macroKcal = (n: { protein_g: number; carbs_g: number; fat_g: number }) =>
  4 * n.protein_g + 4 * n.carbs_g + 9 * n.fat_g;
/** Whole-name matches of `names` in `text`, so "stock" alone doesn't count as "chicken stock". */
const wholeNames = (text: string, names: string[]) =>
  matchIngredientNames(text, names).filter((m) => wordCount(text.slice(m.start, m.end)) === wordCount(names[m.index]!));
const wordCount = (s: string) => s.match(/\p{L}+/gu)?.length ?? 0;

/** How many separate times a step's text gives: "1 hour 15 minutes" and "10 to 12 minutes" count once. */
function waitCount(text: string) {
  // A parallel task ("Meanwhile, cook the rice for 12 minutes") is done during a wait, so its sentence
  // doesn't add one; times in the other sentences still count.
  const own = text
    .split(/(?<=[.;:!?])\s+/)
    .map((part) => {
      if (!PARALLEL.test(part)) return part;
      // "While the curry simmers for 15 minutes, cook the rice": the opening clause holds the main wait.
      return /^\s*while\b/i.test(part) ? (part.split(',')[0] ?? '') : '';
    })
    .join(' ');
  const found = [...own.matchAll(DURATION)];
  return found.filter((m, i) => {
    const prev = found[i - 1];
    return !prev || !/^\s*,?\s*(?:and|to|or|-|–)?\s*$/i.test(own.slice(prev.index + prev[0].length, m.index));
  }).length;
}

/** The clause of `text` up to `at`: since the last full stop, semicolon, comma or "then". */
function clauseBefore(text: string, at: number) {
  return (
    text
      .slice(0, at)
      .split(/[.;!?,]|\bthen\b/i)
      .at(-1) ?? ''
  );
}

/** What's wrong with a version, as instructions an agent can act on. Checks only the parts given. */
export function checkVersion(v: CheckedVersion, opts: CheckOptions = {}): Check {
  const problems: string[] = [];
  const warnings: string[] = [];
  const lines = v.ingredients ?? [];
  const steps = v.steps ?? [];

  if (lines.length && v.steps && !steps.length) problems.push('There are no steps. Give the method.');
  if (opts.isNew && v.label && /\bhigh[- ]protein\b/i.test(v.label) && !opts.mealTargets) {
    problems.push(`"${v.label}" is a version for targets: pass for_meals so the server can check it.`);
  }

  // A swapped main can linger in the title and section names: a word that starts a base line this version
  // dropped ("chicken" when chicken breast became pumpkin), unless one of its own protein-rich lines still
  // has it (chicken thigh). Other lines naming it, like chicken stock with a pumpkin main, can be the
  // cook's choice, so they aren't checked.
  if (opts.baseNames && opts.newIngredients !== false) {
    const own = lines.map((l) => l.ingredient.toLowerCase());
    const dropped = opts.baseNames.filter((x) => !own.includes(x.toLowerCase()));
    const keeps = (w: string) =>
      lines.some((l) => l.ingredient.toLowerCase().split(/\s+/).includes(w) && (l.nutrition?.protein_g ?? 0) >= 10);
    const swapped = [...new Set(dropped.map((x) => x.toLowerCase().split(/\s+/)[0]!))].filter(
      (w) => w.length > 3 && !keeps(w),
    );
    // The shared title must fit this version too: "Chicken katsu curry" over a pumpkin version.
    for (const word of swapped) {
      if (opts.title && new RegExp(`\\b${word}\\b`, 'i').test(opts.title)) {
        warnings.push(
          `The recipe's title "${opts.title}" names ${word}, which this version may not have. If so, rename the recipe with update_recipe so the title fits every version (e.g. drop "${word}").`,
        );
      }
    }
    for (const word of swapped) {
      const re = new RegExp(`\\b${word}\\b`, 'i');
      const section = [...new Set(lines.flatMap((l) => (l.section && re.test(l.section) ? [l.section] : [])))];
      if (section.length)
        warnings.push(
          `Section "${section[0]}" names ${word}, which this version swapped out. Rename it if the main changed.`,
        );
    }
  }

  if (v.notes && v.notes.length > 120) {
    problems.push(`notes is ${v.notes.length} characters. Keep it to one short line, or leave it empty.`);
  }
  if (v.notes && /\b(?:instead|in place of|replaces|to keep)\b/i.test(v.notes)) {
    problems.push('notes says what changed. Leave it empty, or give one line the cook needs before starting.');
  }

  // Sections: all or nothing, and each section's lines together.
  const sections = new Set(opts.newIngredients === false ? [] : lines.flatMap((l) => (l.section ? [l.section] : [])));
  if (sections.size === 1) {
    problems.push('Every ingredient line has the same section. Leave section empty when the recipe has one part.');
  } else if (sections.size) {
    const missing = lines.flatMap((l, i) => (l.section ? [] : [i]));
    if (missing.length) {
      problems.push(
        `Ingredient lines ${missing.map((i) => `${i} (${lines[i]!.ingredient})`).join(', ')} have no section. Give every line a section, or none.`,
      );
    }
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

  if (opts.newIngredients !== false) {
    lines.forEach((l, i) => {
      // "2 egg egg" or "2 breast chicken breast": the unit is the thing itself.
      const lastWord = l.ingredient.toLowerCase().split(/\s+/).at(-1)!.replace(/e?s$/, '');
      if (l.unit && l.unit.toLowerCase().replace(/e?s$/, '') === lastWord) {
        problems.push(
          `Line ${i} (${l.ingredient}) has unit "${l.unit}", which repeats its name. Leave unit out for whole items.`,
        );
      }
      // raw_text is rebuilt from the fields for measured lines, so prep written only there is lost.
      if (l.quantity != null && !l.preparation && l.raw_text) {
        // The name itself can hold a comma ("tomatoes, cherry"), so look past it.
        const rest = l.raw_text.toLowerCase().split(l.ingredient.toLowerCase()).join(' ');
        if (/,\s*[a-z]/i.test(rest)) {
          problems.push(
            `Line ${i} (${l.ingredient}) has prep in raw_text ("${l.raw_text}") but no preparation. Put the prep in preparation; the app shows it there.`,
          );
        } else if (extraWords(l.raw_text, `${l.ingredient} ${l.unit ?? ''}`).length) {
          warnings.push(
            `Line ${i} (${l.ingredient}): raw_text "${l.raw_text}" has words the app won't show. Put any prep in preparation.`,
          );
        }
      }
      if (l.quantity != null && ['g', 'ml'].includes(l.unit ?? '') && l.quantity >= 20 && l.quantity % 5) {
        warnings.push(
          `Line ${i} (${l.ingredient}) is ${l.quantity}${l.unit}. Round it to an amount a cook measures, in 5${l.unit} steps.`,
        );
      }
      const known = opts.knownNames ?? [];
      if (!known.some((k) => k.toLowerCase() === l.ingredient.toLowerCase())) {
        const twin = known.find((k) => baseName(k) === baseName(l.ingredient));
        if (twin)
          warnings.push(`Line ${i} (${l.ingredient}) looks like the existing ingredient "${twin}". Use that name.`);
      }
    });
    const halves = lines.flatMap((l, i) =>
      l.quantity != null && !l.unit && l.quantity < 1 ? [`${i} (${l.ingredient})`] : [],
    );
    if (halves.length) {
      warnings.push(
        `Ingredient lines ${halves.join(', ')} are part of a whole item. Round to whole items (1 cinnamon stick, 1 small potato); weigh only what the source weighs.`,
      );
    }
    const unmeasured = lines.flatMap((l, i) => (l.quantity == null && !l.raw_text ? [`${i} (${l.ingredient})`] : []));
    if (unmeasured.length) {
      problems.push(
        `Ingredient lines ${unmeasured.join(', ')} have no quantity, so give raw_text as the amount, e.g. "To taste", or give a quantity.`,
      );
    }
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
    if (wordCount(step.text) > 60) {
      warnings.push(
        `Step ${n} is ${wordCount(step.text)} words. Split it into stages of one to three short sentences.`,
      );
    }
    if (step.text.length > 400) {
      problems.push(
        `Step ${n} is ${step.text.length} characters. Split it into stages of one to three short sentences.`,
      );
    }
    if (/\(\s*lines?\s+\d+(?:\s*(?:,|and)\s*\d+)*\s*\)/i.test(step.text)) {
      problems.push(
        `Step ${n} mentions a line number. Line numbers belong only in the links; in the text say e.g. "the oil for the sauce".`,
      );
    }
    if (IMPERIAL.test(step.text)) problems.push(`Step ${n} uses an imperial measure. Use g, ml, cm or °C.`);
    if (step.timer_seconds && step.timer_seconds < 60) {
      warnings.push(`Step ${n} has a timer under a minute. Leave it out for short hands-on work.`);
    }
    if (/\b(?:the|in|from) (?:next|previous) steps?\b|\bsteps? \d+\b/i.test(step.text)) {
      problems.push(`Step ${n} refers to another step. Say the action itself, in the step where it happens.`);
    }
    // A step that links only a side: either it also handles the main (link it), or it only cooks the side.
    const linkedLines = (step.ingredients ?? []).map((i) => lines[i.line]).filter(Boolean);
    const isSide = (l: (typeof lines)[number] | undefined) =>
      /^(?:to serve|serve with|sides?)$/i.test(l?.section ?? '');
    if (linkedLines.length && linkedLines.every(isSide)) {
      const handled = wholeNames(
        step.text,
        lines.map((l) => l.ingredient),
      )
        .filter((m) => {
          // "Discard the bay leaf", "while the salmon rests": mentions, not handling.
          const before = clauseBefore(step.text, m.start);
          const after = step.text.slice(m.end).split(/[.;!?]/)[0] ?? '';
          return (
            !/\b(?:tast|adjust|discard|remov|strain|while)\w*/i.test(before) &&
            !/^\s+rests?\b/i.test(after) &&
            !endsLongerName(
              step.text,
              m.end,
              lines,
              m.index,
              (step.ingredients ?? []).map((x) => x.line),
            )
          );
        })
        .map((m) => m.index)
        .filter((i) => !isSide(lines[i]) && !(step.ingredients ?? []).some((x) => x.line === i));
      if (handled.length) {
        problems.push(
          `Step ${n} links only the side, but its text also handles ${[...new Set(handled)].map((i) => `line ${i} (${lines[i]!.ingredient})`).join(', ')}. Link those too.`,
        );
      } else if (/\b(?:cook|boil|simmer|steam)\b/i.test(step.text) && !PARALLEL.test(step.text)) {
        warnings.push(
          `Step ${n} only cooks a side. Put it in the step whose wait it cooks during, with how long it takes.`,
        );
      }
    }
    // Amounts in the text that no linked line has, e.g. "300 ml" after the stock was cut to 250 ml.
    // Only amounts written against a linked line's name ("300 ml beef stock") are compared.
    for (const l of linkedLines) {
      if (!l!.unit || !['g', 'ml'].includes(l!.unit) || l!.quantity == null) continue;
      const name = l!.ingredient.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(
        `(\\d+(?:\\.\\d+)?)\\s?${l!.unit}\\s+(?:of\\s+)?(?:the\\s+)?(?:reserved\\s+)?${name}`,
        'giu',
      );
      for (const m of step.text.matchAll(re)) {
        if (Number(m[1]) > l!.quantity) {
          warnings.push(
            `Step ${n} says ${m[0]}, more than its line has (${l!.quantity} ${l!.unit}). Check the amount for this version.`,
          );
        }
      }
    }
    const times = waitCount(step.text);
    if (
      step.timer_seconds &&
      /\b(?:per|each) side\b|(?:min(?:ute)?s?|secs?|seconds?|hrs?|hours?)\s+a side\b/i.test(step.text)
    ) {
      problems.push(`Step ${n} times a wait "per side". Make it two timed steps, the second starting with the turn.`);
    } else if (step.timer_seconds && times > 1) {
      problems.push(
        `Step ${n} has a timer and gives ${times} times. Time one wait per step: start a new step where the unattended wait begins and keep the timer on it. Drop a timer only when the time is hands-on work like stirring or frying.`,
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
      // "Taste and adjust with fish sauce", "discard the bay leaves": no link needed for a line used earlier.
      const usedEarlier = steps.slice(0, s).some((st) => st.ingredients?.some((i) => i.line === m.index));
      const sentence = clauseBefore(step.text, m.start);
      if (usedEarlier && /\b(?:tast|adjust|discard|remov|strain)\w*/i.test(sentence)) continue;
      // A longer line's name ends here ("fried shallots" for Asian fried shallots), so it's that line.
      if (endsLongerName(step.text, m.end, lines, m.index, links)) continue;
      // "Meanwhile, coat the chicken": a preview of the next step, which links it.
      if (
        /^\s*meanwhile\b/i.test(
          step.text
            .slice(0, m.start)
            .split(/[.;!?]/)
            .at(-1) ?? '',
        )
      )
        continue;
      warnings.push(
        `Step ${n} names ${name} but doesn't link line ${m.index}. Link it if the step adds or handles it; leave it if the step only mentions or discards it, with no need to resend.`,
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
  // A high-protein version has more protein per serving than the one it's based on.
  if (
    opts.baseProteinPerServing &&
    v.servings &&
    /\bhigh[- ]protein\b/i.test(v.label ?? '') &&
    lines.length &&
    lines.every((l) => l.nutrition)
  ) {
    const perServing = lines.reduce((sum, l) => sum + l.nutrition!.protein_g, 0) / v.servings;
    if (perServing <= opts.baseProteinPerServing) {
      warnings.push(
        `"${v.label}" has ${Math.round(perServing)} g protein a serving against ${Math.round(opts.baseProteinPerServing)} g in the version it's based on. Give it clearly more of the main per serving.`,
      );
    }
  }

  // Against the targets of the meals it's cooked for: calories are refused when well off, protein flagged.
  const t = opts.mealTargets;
  const batch =
    published && n?.kcal != null
      ? { kcal: n.kcal, protein_g: n.protein_g ?? 0 }
      : lines.length && lines.every((l) => l.nutrition)
        ? {
            kcal: lines.reduce((sum, l) => sum + l.nutrition!.kcal, 0),
            protein_g: lines.reduce((sum, l) => sum + l.nutrition!.protein_g, 0),
          }
        : undefined;
  if (t && batch && t.kcal) {
    const off = (batch.kcal - t.kcal) / t.kcal;
    if (Math.abs(off) > 0.1) {
      const message = `The batch is ${Math.round(batch.kcal)} kcal against ${t.kcal} kcal for the meals it's for (${off > 0 ? '+' : ''}${Math.round(off * 100)}%); aim for ${Math.ceil(t.kcal * 0.9)} to ${Math.floor(t.kcal * 1.1)} kcal.`;
      if (published) warnings.push(message);
      else if (batch.kcal <= 0) {
        problems.push(`${message} Estimate each line's nutrition for its amount.`);
      } else {
        const gap = Math.round(Math.abs(t.kcal - batch.kcal));
        const proteinMet = t.portions.every(
          (p) => p.protein_g == null || (batch.protein_g * p.kcal) / t.kcal >= 0.95 * p.protein_g,
        );
        const factor = Math.round((t.kcal / batch.kcal) * 100) / 100;
        const forProtein = /\bhigh[- ]protein\b/i.test(v.label ?? '');
        const advice = !forProtein
          ? `Scale every line together by about ${factor}, keeping tins, eggs and whole spices whole, then round each line to an amount a cook measures.`
          : off < 0
            ? `Add about ${gap} kcal: more of every line together, sides at about 75g dry rice a person.`
            : proteinMet
              ? `Take off about ${gap} kcal: trim the sides first (not under 50g dry rice a person), then use a lighter form of the sauce's rich ingredient and less oil, then the main if needed.`
              : `Take off about ${gap} kcal from the sides and the sauce's fat, not the main: protein is already short.`;
        problems.push(
          `${message} ${advice} Re-estimate each changed line's nutrition, keep for_meals and send it again.`,
        );
      }
    }
    // The dish is split by calorie target, so each portion's protein is its calorie share of the batch.
    const short = t.portions.flatMap((p) => {
      const gets = (batch.protein_g * p.kcal) / t.kcal;
      return p.protein_g != null && gets < 0.95 * p.protein_g
        ? [`${p.name} ${Math.round(gets)} g of ${p.protein_g} g`]
        : [];
    });
    if (short.length) {
      warnings.push(
        `Protein falls short at each portion's share of the dish: ${short.join(', ')}. Tell the user, or for a protein version add more of the main.`,
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
