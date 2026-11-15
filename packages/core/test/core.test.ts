import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SLOT_SPLIT,
  aggregateShopping,
  defaultVersion,
  dishUpGuide,
  fractionWords,
  matchIngredientNames,
  normaliseUnit,
  sharesFromTargets,
  simpleRatio,
  slotTarget,
  type ShoppingLineInput,
} from '../src/index.ts';

const me = { daily_kcal: 2800, daily_protein_g: 180, slot_split: DEFAULT_SLOT_SPLIT };
const partner = { daily_kcal: 2000, daily_protein_g: 110, slot_split: DEFAULT_SLOT_SPLIT };

test('slot targets follow the daily split', () => {
  assert.deepEqual(slotTarget(me, 'dinner'), { kcal: 980, protein_g: 63 });
  assert.deepEqual(slotTarget(partner, 'dinner'), { kcal: 700, protein_g: 39 });
  assert.deepEqual(slotTarget({ ...me, daily_protein_g: null }, 'snack'), { kcal: 280, protein_g: null });
});

test('shares are proportional to calorie targets', () => {
  const [a, b] = sharesFromTargets([980, 700]);
  assert.ok(Math.abs(a! - 0.5833) < 0.001);
  assert.ok(Math.abs(b! - 0.4167) < 0.001);
  assert.deepEqual(sharesFromTargets([0, 0]), [0.5, 0.5]);
});

test('two-person dinner: ratio, fraction and grams', () => {
  const guide = dishUpGuide(
    [
      { id: 'a', person_name: 'Ben', date: '2026-11-02', slot: 'dinner', target_kcal: 980 },
      { id: 'b', person_name: 'Sam', date: '2026-11-02', slot: 'dinner', target_kcal: 700 },
    ],
    1203,
  );
  assert.equal(guide.meals.length, 1);
  const meal = guide.meals[0]!;
  assert.equal(meal.fraction, 'all of it');
  assert.equal(meal.ratio, '4:3');
  assert.equal(meal.grams, 1203);
  assert.deepEqual(meal.portions.map((p) => p.grams), [700, 503]);
  assert.equal(meal.portions[1]!.is_rest, true);
});

test('four portions over two meals split by meal, then person', () => {
  const guide = dishUpGuide(
    [
      { id: 'l1', person_name: 'Ben', date: '2026-11-03', slot: 'lunch', target_kcal: 700 },
      { id: 'd1', person_name: 'Ben', date: '2026-11-02', slot: 'dinner', target_kcal: 990 },
      { id: 'd2', person_name: 'Sam', date: '2026-11-02', slot: 'dinner', target_kcal: 720 },
      { id: 'l2', person_name: 'Sam', date: '2026-11-03', slot: 'lunch', target_kcal: 500 },
    ],
    2400,
  );
  const [dinner, lunch] = guide.meals;
  assert.equal(dinner!.slot, 'dinner');
  assert.equal(dinner!.fraction, 'just over half');
  assert.equal(dinner!.ratio, '4:3');
  assert.equal(lunch!.is_rest, true);
  const grams = guide.meals.flatMap((m) => m.portions.map((p) => p.grams!));
  assert.equal(grams.reduce((s, g) => s + g, 0), 2400);
  assert.ok(grams.slice(0, -1).every((g) => g % 5 === 0));
  assert.equal(dinner!.grams! + lunch!.grams!, 2400);
});

test('without a cooked weight there are no grams', () => {
  const guide = dishUpGuide([{ id: 'a', person_name: null, date: null, slot: null, target_kcal: 500 }], null);
  assert.equal(guide.meals[0]!.grams, null);
  assert.equal(guide.meals[0]!.portions[0]!.grams, null);
});

test('fraction words and ratios', () => {
  assert.equal(fractionWords(0.5), 'about half');
  assert.equal(fractionWords(0.34), 'about a third');
  assert.equal(fractionWords(0.41), 'just over a third');
  assert.equal(fractionWords(0.46), 'just under half');
  assert.equal(simpleRatio([0.5, 0.5]), '1:1');
  assert.equal(simpleRatio([2, 1, 1]), '2:1:1');
  assert.equal(simpleRatio([0.6, 0.4]), '3:2');
});

test('unit normalisation', () => {
  assert.equal(normaliseUnit('Tbsp'), 'tbsp');
  assert.equal(normaliseUnit('grams'), 'g');
  assert.equal(normaliseUnit('cloves'), 'clove');
  assert.equal(normaliseUnit('tins'), 'tin');
  assert.equal(normaliseUnit('bunches'), 'bunch');
  assert.equal(normaliseUnit(''), null);
  assert.equal(normaliseUnit(undefined), null);
});

test('shopping list combines lines across recipes', () => {
  const line = (over: Partial<ShoppingLineInput>): ShoppingLineInput => ({
    ingredient_id: 'onion',
    ingredient: 'onion',
    aisle: 'Produce',
    quantity: 1,
    unit: null,
    raw_text: '1 onion',
    optional: false,
    recipe_title: 'Curry',
    ...over,
  });
  const items = aggregateShopping([
    line({ quantity: 2 }),
    line({ quantity: 150, unit: 'g', recipe_title: 'Soup' }),
    line({ quantity: 0.2, unit: 'kg', recipe_title: 'Soup' }),
    line({ ingredient_id: 'cumin', ingredient: 'ground cumin', aisle: 'Spices', quantity: 1, unit: 'tbsp' }),
    line({ ingredient_id: 'cumin', ingredient: 'ground cumin', aisle: 'Spices', quantity: 2, unit: 'tsp' }),
    line({ ingredient_id: 'salt', ingredient: 'salt', aisle: null, quantity: null, raw_text: 'salt, to taste' }),
    line({ ingredient_id: 'garlic', ingredient: 'garlic', quantity: 3, unit: 'cloves' }),
    line({ ingredient_id: 'cream', ingredient: 'double cream', aisle: 'Dairy', quantity: 300, unit: 'ml', optional: true }),
  ]);
  assert.deepEqual(
    items.map((i) => [i.aisle, i.ingredient]),
    [
      ['Dairy', 'double cream'],
      ['Produce', 'garlic'],
      ['Produce', 'onion'],
      ['Spices', 'ground cumin'],
      ['Other', 'salt'],
    ],
  );
  const onion = items.find((i) => i.ingredient_id === 'onion')!;
  assert.deepEqual(onion.amounts, [
    { quantity: 2, unit: null },
    { quantity: 350, unit: 'g' },
  ]);
  assert.deepEqual(onion.recipes, ['Curry', 'Soup']);
  // 1 tbsp + 2 tsp = 25 ml: not a whole number of tablespoons, so teaspoons.
  assert.deepEqual(items.find((i) => i.ingredient_id === 'cumin')!.amounts, [{ quantity: 5, unit: 'tsp' }]);
  assert.deepEqual(items.find((i) => i.ingredient_id === 'garlic')!.amounts, [{ quantity: 3, unit: 'clove' }]);
  assert.deepEqual(items.find((i) => i.ingredient_id === 'salt')!.unquantified, ['salt, to taste']);
  assert.equal(items.find((i) => i.ingredient_id === 'cream')!.optional, true);
});

test('shopping keeps small quantities exact', () => {
  const line = (quantity: number, unit: string): ShoppingLineInput => ({
    ingredient_id: unit + quantity,
    ingredient: 'x',
    aisle: null,
    quantity,
    unit,
    raw_text: '',
    optional: false,
    recipe_title: 'R',
  });
  const amounts = aggregateShopping([line(0.2, 'g'), line(1, 'ml'), line(1.25, 'tsp'), line(3, 'tbsp'), line(5, 'tbsp'), line(1250, 'g')]).map(
    (i) => i.amounts[0],
  );
  assert.deepEqual(amounts, [
    { quantity: 0.2, unit: 'g' },
    { quantity: 1, unit: 'ml' },
    { quantity: 1.25, unit: 'tsp' },
    { quantity: 3, unit: 'tbsp' },
    { quantity: 5, unit: 'tbsp' },
    { quantity: 1.25, unit: 'kg' },
  ]);
});

test('default version is the newest adapted one, or the original', () => {
  const original = { id: 'o', is_original: true };
  const older = { id: 'a', is_original: false };
  const newer = { id: 'b', is_original: false };
  assert.equal(defaultVersion([original, older, newer]), newer);
  assert.equal(defaultVersion([original]), original);
  assert.equal(defaultVersion([]), undefined);
});

test('ingredient names are found in step text', () => {
  const found = (text: string, names: string[]) =>
    matchIngredientNames(text, names).map((m) => [text.slice(m.start, m.end), names[m.index]]);

  // Case and plurals, either way round.
  assert.deepEqual(found('Soften the Onions, then add one tomato.', ['onion', 'tomatoes']), [
    ['Onions', 'onion'],
    ['tomato', 'tomatoes'],
  ]);
  assert.deepEqual(found('Scatter over the berry mix.', ['mixed berries']), [['berry', 'mixed berries']]);

  // The whole name beats its last word, and both beat a first word.
  assert.deepEqual(found('Stir in the curry powder, then the rice.', ['curry powder', 'basmati rice']), [
    ['curry powder', 'curry powder'],
    ['rice', 'basmati rice'],
  ]);
  assert.deepEqual(found('Dip the chicken in the egg, then the panko.', ['chicken breasts', 'egg', 'panko breadcrumbs']), [
    ['chicken', 'chicken breasts'],
    ['egg', 'egg'],
    ['panko', 'panko breadcrumbs'],
  ]);
  // A first word is only used when nothing better was found, so adjectives don't match by accident.
  assert.deepEqual(found('Add the chopped onions and the tomatoes.', ['chopped tomatoes', 'onions']), [
    ['onions', 'onions'],
    ['tomatoes', 'chopped tomatoes'],
  ]);

  // A word two names could claim equally is left alone.
  assert.deepEqual(found('Bake the chicken, then cook the rice.', ['chicken stock', 'chicken breasts', 'basmati rice', 'risotto rice']), []);

  // Whole words only, and every occurrence.
  assert.deepEqual(found('Season the eggplant. Beat the egg; add egg.', ['egg']), [
    ['egg', 'egg'],
    ['egg', 'egg'],
  ]);
  assert.deepEqual(matchIngredientNames('Melt the butter.', ['butter']), [{ start: 9, end: 15, index: 0 }]);
});
