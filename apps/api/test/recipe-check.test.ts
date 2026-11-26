import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRecipe, checkVersion, type CheckedVersion } from '../src/recipe-check.ts';

const est = (kcal: number) => ({ kcal, protein_g: kcal / 20, carbs_g: kcal / 10, fat_g: kcal / 30 });
const ingredients = [
  { ingredient: 'onion', section: 'Sauce', nutrition: est(40) },
  { ingredient: 'curry powder', section: 'Sauce', nutrition: est(20) },
  { ingredient: 'chicken breast', section: 'Katsu', nutrition: est(500) },
  { ingredient: 'panko breadcrumbs', section: 'Katsu', nutrition: est(200) },
];
const clean: CheckedVersion = {
  ingredients,
  steps: [
    { text: 'Soften the onion for 5 minutes, then stir in the curry powder.', ingredients: [{ line: 0 }, { line: 1 }] },
    {
      text: 'Coat the chicken in panko and air-fry for 12 minutes.',
      timer_seconds: 720,
      ingredients: [{ line: 2 }, { line: 3 }],
    },
  ],
};

test('a clean version and recipe pass', () => {
  assert.deepEqual(checkVersion(clean), { errors: [], warnings: [] });
  assert.deepEqual(
    checkRecipe({ title: 'Katsu curry', description: 'Crisp chicken with a mild curry sauce.' }).errors,
    [],
  );
});

test('refuses broken rules and warns about likely ones', () => {
  const { errors, warnings } = checkVersion({
    notes: 'x'.repeat(121),
    ingredients: [
      { ingredient: 'onion', section: 'Sauce', nutrition: est(40) },
      {
        ingredient: 'chicken breast',
        section: 'Katsu',
        nutrition: { kcal: 100, protein_g: 40, carbs_g: 0, fat_g: 10 },
      },
      { ingredient: 'curry powder', section: 'Sauce', nutrition: est(20) },
      { ingredient: 'salt' },
    ],
    steps: [
      // Names chicken without linking it, and links curry powder without naming it.
      {
        text: 'Soften the onion with the chicken breast.',
        timer_seconds: 300,
        ingredients: [{ line: 0 }, { line: 2 }],
      },
    ],
  });
  const problems = errors.join('\n');
  for (const expected of [
    /notes is 121 characters/,
    /lines 3 have no section/,
    /Section "Sauce" is split up/,
    /lines 1 \(chicken breast\), 3 \(salt\) aren't linked/,
    /Step 1 \(.*\) links line 2 \(curry powder\), but cook mode can't find that name/,
    /lines 3 have no nutrition estimate/,
    /Line 1 \(chicken breast\): 100 kcal doesn't match its macros/,
  ]) {
    assert.match(problems, expected);
  }
  assert.match(warnings.join('\n'), /Step 1 \(.*\) has a timer, but no time/);
  assert.match(warnings.join('\n'), /Step 1 \(.*\) names chicken breast but doesn't link line 1/);
  assert.match(checkRecipe({ title: 'Katsu curry (chicken or pumpkin)' }).errors.join(), /title has brackets/);
  // A method can't be dropped to dodge the link checks.
  assert.match(checkVersion({ ingredients, steps: [] }).errors.join(), /no steps/);
});

test('one wait per timer, one section is none, no leftovers from the base version', () => {
  const lines = [
    { ingredient: 'pumpkin', section: 'Katsu', nutrition: est(100) },
    { ingredient: 'vegetable stock', section: 'Katsu', nutrition: est(20) },
  ];
  const { errors } = checkVersion(
    {
      ingredients: lines,
      steps: [
        {
          text: 'Air-fry the pumpkin for 7 minutes, turn and cook 7 minutes more.',
          timer_seconds: 420,
          ingredients: [{ line: 0 }],
        },
        { text: 'Simmer the vegetable stock with the chicken stock.', ingredients: [{ line: 1 }] },
      ],
    },
    { baseNames: ['chicken breast', 'chicken stock', 'vegetable stock'] },
  );
  const problems = errors.join('\n');
  assert.match(problems, /Step 1 \(.*\) has a timer and gives 2 times/);
  assert.match(problems, /Leave section empty/);
  assert.match(problems, /Step 2 \(.*\) names chicken stock, which this version doesn't have/);
  // Compound times and ranges are one wait; a base name inside this version's own name isn't a leftover.
  const fine = checkVersion(
    {
      ingredients: [{ ingredient: 'smoked paprika', nutrition: est(5) }],
      steps: [
        {
          text: 'Stir in the smoked paprika and bake for 1 hour, 15 minutes.',
          timer_seconds: 4500,
          ingredients: [{ line: 0 }],
        },
      ],
    },
    { baseNames: ['paprika'] },
  );
  assert.deepEqual(fine.errors, []);
  // A source's own figures can be sent as they are, without per-line estimates.
  const published = checkVersion({
    ingredients: [{ ingredient: 'bread' }],
    steps: [{ text: 'Toast the bread.', ingredients: [{ line: 0 }] }],
    nutrition: { kcal: 200, protein_g: 8, carbs_g: 38, fat_g: 2, source: 'from_source' },
  });
  assert.deepEqual(published.errors, []);
});
