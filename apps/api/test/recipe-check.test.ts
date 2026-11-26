import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRecipe, checkVersion, type CheckedVersion } from '../src/recipe-check.ts';

const est = (kcal: number) => ({ kcal, protein_g: kcal / 20, carbs_g: kcal / 10, fat_g: kcal / 30 });
const ingredients = [
  { quantity: 1, ingredient: 'onion', section: 'Sauce', nutrition: est(40) },
  { quantity: 1, ingredient: 'curry powder', section: 'Sauce', nutrition: est(20) },
  { quantity: 1, ingredient: 'chicken breast', section: 'Katsu', nutrition: est(500) },
  { quantity: 1, ingredient: 'panko breadcrumbs', section: 'Katsu', nutrition: est(200) },
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
      { quantity: 1, ingredient: 'onion', section: 'Sauce', nutrition: est(40) },
      {
        ingredient: 'chicken breast',
        section: 'Katsu',
        nutrition: { kcal: 100, protein_g: 40, carbs_g: 0, fat_g: 10 },
      },
      { quantity: 1, ingredient: 'curry powder', section: 'Sauce', nutrition: est(20) },
      { quantity: 1, ingredient: 'salt' },
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
    /lines 3 \(salt\) have no section/,
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
  // Line numbers and imperial measures in step text, and change notes, are refused.
  const text = checkVersion({
    notes: 'Rump instead of chuck',
    ingredients: [{ ingredient: 'beef stock', quantity: 250, unit: 'ml', nutrition: est(20) }],
    steps: [{ text: 'Add the beef stock (line 0) and reduce to 1 cup.', ingredients: [{ line: 0 }] }],
  }).errors.join('\n');
  assert.match(text, /mentions a line number/);
  assert.match(text, /imperial measure/);
  assert.match(text, /notes says what changed/);
  // An unmeasured line needs its amount as text.
  assert.match(
    checkVersion({ ingredients: [{ ingredient: 'salt', nutrition: est(0) }] }).errors.join(),
    /no quantity, so give raw_text/,
  );
  // A method can't be dropped to dodge the link checks.
  assert.match(checkVersion({ ingredients, steps: [] }).errors.join(), /no steps/);
});

test('one wait per timer, one section is none, no leftovers from the base version', () => {
  const lines = [
    { quantity: 1, ingredient: 'pumpkin', section: 'Katsu', nutrition: est(100) },
    { quantity: 1, ingredient: 'vegetable stock', section: 'Katsu', nutrition: est(20) },
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
      ingredients: [{ quantity: 1, ingredient: 'smoked paprika', nutrition: est(5) }],
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
    ingredients: [{ quantity: 1, ingredient: 'bread' }],
    steps: [{ text: 'Toast the bread.', ingredients: [{ line: 0 }] }],
    nutrition: { kcal: 200, protein_g: 8, carbs_g: 38, fat_g: 2, source: 'from_source' },
  });
  assert.deepEqual(published.errors, []);
});

test('sizes against the meals it is for, and keeps prep where the app shows it', () => {
  const lines = [
    {
      ingredient: 'chicken breast',
      quantity: 2,
      unit: 'breast',
      raw_text: '2 chicken breasts, halved',
      nutrition: { kcal: 600, protein_g: 120, carbs_g: 0, fat_g: 13 },
    },
    { ingredient: 'cumin', quantity: 1, unit: 'tsp', nutrition: est(10) },
  ];
  const { errors, warnings } = checkVersion(
    {
      ingredients: lines,
      steps: [
        {
          text: 'Air-fry the chicken breast with cumin for 7 minutes per side.',
          timer_seconds: 420,
          ingredients: [{ line: 0 }, { line: 1 }],
        },
      ],
    },
    {
      mealTargets: {
        kcal: 1453,
        portions: [
          { name: 'Ben', kcal: 875, protein_g: 53 },
          { name: 'Jess', kcal: 578, protein_g: 35 },
        ],
      },
      knownNames: ['ground cumin'],
    },
  );
  const problems = errors.join('\n');
  assert.match(problems, /unit "breast", which repeats its name/);
  assert.match(problems, /prep in raw_text/);
  assert.match(problems, /times a wait "per side"/);
  assert.match(problems, /610 kcal against 1453 kcal .*-58%/);
  assert.match(warnings.join('\n'), /looks like the existing ingredient "ground cumin"/);
  // Ordinary wording isn't mistaken for line numbers, imperial units, prep or a timed side.
  const fine = checkVersion({
    ingredients: [
      { ingredient: 'potato', quantity: 1000, unit: 'g', raw_text: '1,000 g potatoes', nutrition: est(770) },
    ],
    steps: [
      { text: 'Line 2 baking trays with parchment.', ingredients: [] },
      { text: 'Roast the potato on a side rack for 40 minutes.', timer_seconds: 2400, ingredients: [{ line: 0 }] },
    ],
  });
  assert.deepEqual(fine.errors, []);
  const more = checkVersion({
    ingredients: [
      { ingredient: 'tomatoes, cherry', quantity: 10, unit: 'g', raw_text: '10 g tomatoes, cherry', nutrition: est(2) },
    ],
    steps: [
      { text: 'Prepare the oven (line 2 trays with parchment while it heats).', ingredients: [] },
      {
        text: 'Smoke the tomatoes, cherry for 1 hour a side at 375 F.',
        timer_seconds: 3600,
        ingredients: [{ line: 0 }],
      },
    ],
  }).errors.join('\n');
  assert.doesNotMatch(more, /line number|prep in raw_text/);
  assert.match(more, /times a wait "per side"/);
  assert.match(more, /imperial measure/);
});

test('catches a swapped main left in a section name, and protein versions without targets', () => {
  const { errors, warnings } = checkVersion(
    {
      label: 'Pumpkin, high protein',
      ingredients: [
        { ingredient: 'pumpkin', quantity: 400, unit: 'g', section: 'Chicken', nutrition: est(100) },
        { ingredient: 'chicken stock', quantity: 150, unit: 'ml', section: 'Sauce', nutrition: est(10) },
      ],
      steps: [
        { text: 'Air-fry the pumpkin for 15 minutes.', timer_seconds: 900, ingredients: [{ line: 0 }] },
        { text: 'Simmer the chicken stock for 10 minutes.', timer_seconds: 600, ingredients: [{ line: 1 }] },
      ],
    },
    { baseNames: ['chicken breast', 'chicken stock'], baseLabel: 'Chicken', isNew: true, title: 'Chicken katsu curry' },
  );
  assert.match(errors.join('\n'), /title "Chicken katsu curry" names chicken/);
  assert.match(warnings.join('\n'), /Section "Chicken" names chicken/);
  assert.match(errors.join('\n'), /"Pumpkin, high protein" is a version for targets/);
  // Chicken stock with a pumpkin main is the cook's choice, not a leftover.
  assert.doesNotMatch(warnings.join('\n'), /chicken stock/);
});

test('leaves batch-size variants and unlisted liquids alone, but flags amounts a line can not cover', () => {
  const thighs = checkVersion(
    {
      label: 'Chicken for two',
      ingredients: [
        { ingredient: 'chicken thigh', quantity: 300, unit: 'g', section: 'Chicken thighs', nutrition: est(600) },
        { ingredient: 'cream', quantity: 100, unit: 'ml', section: 'Sauce', nutrition: est(340) },
        { ingredient: 'beef stock', quantity: 250, unit: 'ml', section: 'Sauce', nutrition: est(20) },
      ],
      steps: [
        { text: 'Fry the chicken thigh for 10 minutes.', timer_seconds: 600, ingredients: [{ line: 0 }] },
        {
          text: 'Stir in 100 ml cream, then 300 ml beef stock. Loosen with up to 150 ml pasta water.',
          ingredients: [{ line: 1 }, { line: 2 }],
        },
      ],
    },
    { baseNames: ['chicken thigh', 'cream', 'beef stock'], baseLabel: 'Chicken thighs', isNew: true },
  );
  assert.deepEqual(thighs.errors, []);
  const notes = thighs.warnings.join('\n');
  assert.match(notes, /says 300 ml beef stock, more than its line has \(250 ml\)/);
  assert.doesNotMatch(notes, /says 150 ml|says 100 ml/);
});

test('parallel work is one wait, and a first use at the end is still linked', () => {
  const { errors, warnings } = checkVersion({
    ingredients: [
      { ingredient: 'basmati rice', quantity: 150, unit: 'g', section: 'To serve', nutrition: est(540) },
      { ingredient: 'salt', raw_text: 'To taste', section: 'To serve', nutrition: est(0) },
    ],
    steps: [
      {
        text: 'Simmer the sauce for 15 minutes. Meanwhile, cook the basmati rice for 12 minutes.',
        timer_seconds: 900,
        ingredients: [{ line: 0 }],
      },
      { text: 'Taste and adjust with salt.', ingredients: [] },
    ],
  });
  assert.doesNotMatch(errors.join('\n'), /gives 2 times/);
  assert.doesNotMatch(warnings.join('\n'), /only cooks a side/);
  // Salt's only use is the tasting step, so it must still be linked there.
  assert.match(errors.join('\n'), /1 \(salt\) aren't linked/);
});

test('a step that turns the main links it, not just the side', () => {
  const { errors, warnings } = checkVersion({
    ingredients: [
      { ingredient: 'pumpkin', quantity: 400, unit: 'g', section: 'Katsu', nutrition: est(100) },
      { ingredient: 'lemongrass', quantity: 0.5, section: 'Katsu', nutrition: est(5) },
      { ingredient: 'basmati rice', quantity: 150, unit: 'g', section: 'To serve', nutrition: est(540) },
    ],
    steps: [
      { text: 'Bruise the lemongrass for the next step.', ingredients: [{ line: 1 }] },
      {
        text: 'Turn the pumpkin and air-fry for 7 minutes. Meanwhile, cook the basmati rice.',
        timer_seconds: 420,
        ingredients: [{ line: 2 }],
      },
    ],
  });
  const problems = errors.join('\n');
  assert.match(problems, /links only the side, but its text also handles line 0 \(pumpkin\)/);
  assert.match(problems, /refers to another step/);
  assert.match(warnings.join('\n'), /1 \(lemongrass\) are part of a whole item/);
});

test('ordinary wording around sides, steps and reserved liquid', () => {
  const { errors, warnings } = checkVersion({
    ingredients: [
      {
        ingredient: 'salmon',
        quantity: 300,
        unit: 'g',
        nutrition: { kcal: 600, protein_g: 60, carbs_g: 0, fat_g: 40 },
      },
      { ingredient: 'beef stock', quantity: 250, unit: 'ml', nutrition: est(20) },
      { ingredient: 'basmati rice', quantity: 150, unit: 'g', section: 'To serve', nutrition: est(540) },
    ],
    steps: [
      {
        text: 'Roast the salmon for 15 minutes. While it is in the oven, clear the worktop. Turn and roast for 10 more minutes.',
        timer_seconds: 900,
        ingredients: [{ line: 0 }],
      },
      { text: 'Pour in 300 ml of the reserved beef stock.', ingredients: [{ line: 1 }] },
      { text: 'As a last step, cook the basmati rice while the salmon rests.', ingredients: [{ line: 2 }] },
    ],
  });
  const problems = errors.join('\n');
  assert.doesNotMatch(problems, /refers to another step|links only the side/);
  assert.match(problems, /gives 2 times/);
  assert.match(warnings.join('\n'), /says 300 ml of the reserved beef stock/);
});
