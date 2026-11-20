// Sample data that shows off the app: pnpm seed <userId>
// Two people, nine recipes (the katsu curry has sections, step links and timers) and this week's plan,
// with a leftover lunch, a different breakfast each on Tuesday, a snack and two meals left to plan.
import type { VersionInput } from '@feedr/core';
import { db } from '../src/db.ts';
import * as svc from '../src/service.ts';

const userId = process.argv[2];
if (!userId) throw new Error('Usage: pnpm seed <userId>  (from pnpm account:create)');

type Line = VersionInput['ingredients'][number];
/** A step's ingredients by name, or [name, quantity, unit] when the step uses part of the line. */
type Link = string | [name: string, quantity: number, unit?: string];

/** An ingredient line. The cook's line (raw_text) is written from the parts. */
function line(
  quantity: number,
  unit: string | null,
  ingredient: string,
  aisle: string,
  more: { prep?: string; section?: string; optional?: boolean } = {},
): Line {
  return {
    ingredient,
    aisle,
    quantity,
    unit,
    raw_text: `${quantity}${unit ? ` ${unit}` : ''} ${ingredient}${more.prep ? `, ${more.prep}` : ''}`,
    preparation: more.prep,
    section: more.section,
    optional: more.optional,
  };
}

const step = (text: string, links: Link[] = [], timerMinutes?: number) => ({ text, links, timerMinutes });

/** Builds a version, turning each step's ingredient names into indexes into the ingredient list. */
function version(
  v: Pick<VersionInput, 'label' | 'servings' | 'notes' | 'based_on_version_id' | 'prep_minutes' | 'cook_minutes'> & {
    ingredients: Line[];
    steps: ReturnType<typeof step>[];
    /** Whole batch: kcal, protein, carbs, fat. */
    nutrition: [number, number, number, number];
    source?: 'from_source' | 'agent_estimate';
  },
): VersionInput {
  const [kcal, protein_g, carbs_g, fat_g] = v.nutrition;
  const { source, ...rest } = v;
  return {
    ...rest,
    steps: v.steps.map((s) => ({
      text: s.text,
      timer_seconds: s.timerMinutes ? s.timerMinutes * 60 : undefined,
      ingredients: s.links.map((link) => {
        const [name, quantity, unit] = typeof link === 'string' ? [link] : link;
        const index = v.ingredients.findIndex((i) => i.ingredient === name);
        if (index < 0) throw new Error(`"${name}" isn't an ingredient of ${v.label}`);
        return { line: index, quantity, unit };
      }),
    })),
    nutrition: { kcal, protein_g, carbs_g, fat_g, source: source ?? 'agent_estimate' },
  };
}

const ben = await svc.createPerson(userId, { name: 'Ben', weight_kg: 80, daily_kcal: 2400, daily_protein_g: 150 });
const jess = await svc.createPerson(userId, { name: 'Jess', weight_kg: 62, daily_kcal: 1880, daily_protein_g: 110 });

/* --------------------------------- Recipes --------------------------------- */

const SAUCE = 'Sauce';
const CHICKEN_RICE = 'Chicken & rice';

const katsu = await svc.createRecipe(userId, {
  title: 'Chicken katsu curry',
  description:
    'Crisp panko chicken with a mild, sweet curry sauce. Make the sauce while the chicken bakes, and everything lands at once.',
  source_url: 'https://example.com/weeknight-katsu',
  source_name: 'Weeknight katsu',
  tags: ['dinner', 'japanese', 'freezes well'],
  original: version({
    label: 'Original',
    servings: 4,
    prep_minutes: 25,
    cook_minutes: 45,
    source: 'from_source',
    nutrition: [2760, 172, 280, 96],
    ingredients: [
      line(60, 'g', 'butter', 'Dairy & eggs', { section: SAUCE }),
      line(4, 'large', 'onions', 'Produce', { section: SAUCE, prep: 'thinly sliced' }),
      line(8, 'clove', 'garlic', 'Produce', { section: SAUCE, prep: 'crushed' }),
      line(3, 'tbsp', 'curry powder', 'Cupboard', { section: SAUCE, prep: 'mild' }),
      line(2, 'tbsp', 'plain flour', 'Cupboard', { section: SAUCE }),
      line(800, 'ml', 'chicken stock', 'Cupboard', { section: SAUCE, prep: 'hot' }),
      line(2, 'tsp', 'honey', 'Cupboard', { section: SAUCE, optional: true }),
      line(4, null, 'chicken breasts', 'Meat & fish', { section: CHICKEN_RICE, prep: 'butterflied, about 600 g' }),
      line(2, null, 'egg', 'Dairy & eggs', { section: CHICKEN_RICE, prep: 'beaten' }),
      line(120, 'g', 'panko breadcrumbs', 'Cupboard', { section: CHICKEN_RICE }),
      line(300, 'g', 'basmati rice', 'Cupboard', { section: CHICKEN_RICE, prep: 'rinsed' }),
      line(200, 'ml', 'vegetable oil', 'Cupboard', { section: CHICKEN_RICE, prep: 'for frying' }),
    ],
    steps: [
      step('Rinse the rice, then simmer it in 600 ml water, covered, until the water has gone. Leave it to steam off the heat.', ['basmati rice'], 12),
      step("Dip the chicken in the egg, then press it into the panko until it's well coated.", ['chicken breasts', 'egg', 'panko breadcrumbs']),
      step(
        'Melt the butter in a wide pan. Add the onions and garlic and cook for 10–12 min until soft and golden, then stir in the curry powder.',
        ['butter', 'onions', ['garlic', 6, 'clove'], 'curry powder'],
        12,
      ),
      step(
        'Heat the oil in a deep frying pan and fry the chicken in two batches, 4 min a side, until golden and cooked through.',
        ['vegetable oil', 'chicken breasts'],
        16,
      ),
      step(
        'Stir the flour and the last 2 cloves of garlic into the onions. Add the stock a splash at a time, then simmer until it coats a spoon. Add the honey and blend smooth.',
        ['plain flour', ['garlic', 2, 'clove'], 'chicken stock', 'honey'],
        15,
      ),
      step('Slice the chicken into strips. Serve on the rice with the sauce spooned over the side, so the crumb stays crisp.', [
        'chicken breasts',
        'basmati rice',
      ]),
    ],
  }),
});
const katsuForTwo = await svc.createVersion(
  userId,
  katsu.id,
  version({
    label: 'For two',
    servings: 2,
    based_on_version_id: katsu.versions[0]!.id,
    notes: 'Halved from the original (serves 4) and baked instead of fried. The sauce makes extra, so freeze half for next week.',
    prep_minutes: 20,
    cook_minutes: 40,
    nutrition: [1280, 84, 136, 36],
    ingredients: [
      line(30, 'g', 'butter', 'Dairy & eggs', { section: SAUCE }),
      line(2, 'large', 'onions', 'Produce', { section: SAUCE, prep: 'thinly sliced' }),
      line(6, 'clove', 'garlic', 'Produce', { section: SAUCE, prep: 'crushed' }),
      line(2, 'tbsp', 'curry powder', 'Cupboard', { section: SAUCE, prep: 'mild' }),
      line(1, 'tbsp', 'plain flour', 'Cupboard', { section: SAUCE }),
      line(400, 'ml', 'chicken stock', 'Cupboard', { section: SAUCE, prep: 'hot' }),
      line(1, 'tsp', 'honey', 'Cupboard', { section: SAUCE, optional: true }),
      line(2, null, 'chicken breasts', 'Meat & fish', { section: CHICKEN_RICE, prep: 'butterflied, about 300 g' }),
      line(1, null, 'egg', 'Dairy & eggs', { section: CHICKEN_RICE, prep: 'beaten' }),
      line(60, 'g', 'panko breadcrumbs', 'Cupboard', { section: CHICKEN_RICE }),
      line(150, 'g', 'basmati rice', 'Cupboard', { section: CHICKEN_RICE, prep: 'rinsed' }),
    ],
    steps: [
      step('Rinse the rice, then simmer it in 300 ml water, covered, until the water has gone. Leave it to steam off the heat.', ['basmati rice'], 12),
      step(
        "Heat the oven to 200°C fan. Dip the chicken in the egg, then press it into the panko until it's well coated. Lay it on a lined tray.",
        ['chicken breasts', 'egg', 'panko breadcrumbs'],
      ),
      step(
        'Melt the butter in a wide pan. Add the onions and garlic and cook for 8–10 min until soft and golden, then stir in the curry powder.',
        ['butter', 'onions', ['garlic', 4, 'clove'], 'curry powder'],
        10,
      ),
      step("Bake the chicken for 20 min until golden and cooked through. Start the sauce while it's in.", ['chicken breasts'], 20),
      step(
        'Stir the flour and the last 2 cloves of garlic into the onions. Add the stock a splash at a time, then simmer until it coats a spoon. Add the honey and blend smooth.',
        ['plain flour', ['garlic', 2, 'clove'], 'chicken stock', 'honey'],
        15,
      ),
      step('Slice the chicken into strips. Serve on the rice with the sauce spooned over the side, so the crumb stays crisp.', [
        'chicken breasts',
        'basmati rice',
      ]),
    ],
  }),
);

const salmon = await svc.createRecipe(userId, {
  title: 'Miso salmon with greens',
  description: 'Sticky glazed salmon roasted while the rice cooks, with pak choi steamed over the pan.',
  tags: ['dinner', 'fish', 'quick'],
  original: version({
    label: 'Original',
    servings: 2,
    prep_minutes: 10,
    cook_minutes: 25,
    nutrition: [1040, 76, 96, 38],
    ingredients: [
      line(2, 'fillet', 'salmon', 'Meat & fish'),
      line(2, 'tbsp', 'white miso', 'Cupboard'),
      line(1, 'tbsp', 'honey', 'Cupboard'),
      line(1, 'tbsp', 'soy sauce', 'Cupboard'),
      line(2, 'head', 'pak choi', 'Produce', { prep: 'halved' }),
      line(150, 'g', 'basmati rice', 'Cupboard', { prep: 'rinsed' }),
      line(1, 'tsp', 'sesame seeds', 'Cupboard', { optional: true }),
    ],
    steps: [
      step('Heat the oven to 200°C fan. Simmer the rice in 300 ml water, covered, for 12 min, then leave it to steam.', ['basmati rice'], 12),
      step('Whisk the miso, honey and soy sauce into a glaze.', ['white miso', 'honey', 'soy sauce']),
      step('Lay the salmon on a lined tray, brush it with the glaze and roast for 10–12 min.', ['salmon'], 11),
      step('Steam the pak choi over the rice pan for 3 min, until just tender.', ['pak choi'], 3),
      step('Serve the salmon on the rice with the greens, scattered with sesame seeds.', ['sesame seeds']),
    ],
  }),
});

const chickpea = await svc.createRecipe(userId, {
  title: 'Chickpea & spinach curry',
  description: 'A storecupboard curry that reheats well for lunch.',
  tags: ['dinner', 'lunch', 'vegetarian', 'freezes well'],
  original: version({
    label: 'Original',
    servings: 4,
    prep_minutes: 10,
    cook_minutes: 25,
    nutrition: [1720, 68, 256, 40],
    ingredients: [
      line(1, 'large', 'onions', 'Produce', { prep: 'finely chopped' }),
      line(3, 'clove', 'garlic', 'Produce', { prep: 'crushed' }),
      line(1, 'tbsp', 'curry powder', 'Cupboard'),
      line(2, 'tin', 'chickpeas', 'Cupboard', { prep: 'drained' }),
      line(1, 'tin', 'chopped tomatoes', 'Cupboard'),
      line(200, 'g', 'spinach', 'Produce'),
      line(250, 'g', 'basmati rice', 'Cupboard', { prep: 'rinsed' }),
    ],
    steps: [
      step('Soften the onions in a little oil for 8 min, then stir in the garlic and curry powder for 1 min.', ['onions', 'garlic', 'curry powder'], 8),
      step('Add the chickpeas and tomatoes with half a tin of water. Simmer for 15 min.', ['chickpeas', 'chopped tomatoes'], 15),
      step('Meanwhile, simmer the rice, covered, for 12 min.', ['basmati rice'], 12),
      step('Stir the spinach into the curry until it wilts. Serve over the rice.', ['spinach']),
    ],
  }),
});

const wrap = await svc.createRecipe(userId, {
  title: 'Chicken caesar wrap',
  tags: ['lunch', 'quick'],
  original: version({
    label: 'Original',
    servings: 2,
    prep_minutes: 10,
    cook_minutes: 10,
    nutrition: [1160, 88, 84, 48],
    ingredients: [
      line(2, null, 'chicken breasts', 'Meat & fish'),
      line(1, 'head', 'romaine lettuce', 'Produce', { prep: 'shredded' }),
      line(30, 'g', 'parmesan', 'Dairy & eggs', { prep: 'finely grated' }),
      line(2, 'tbsp', 'caesar dressing', 'Cupboard'),
      line(2, null, 'tortilla wraps', 'Bakery'),
    ],
    steps: [
      step('Season the chicken and fry it for 5 min a side, until cooked through. Rest it, then slice.', ['chicken breasts'], 10),
      step('Toss the lettuce with the dressing and parmesan.', ['romaine lettuce', 'caesar dressing', 'parmesan']),
      step('Pile the salad and chicken onto the wraps and roll them up tightly.', ['tortilla wraps']),
    ],
  }),
});

const oatsLines = (n: number) => [
  line(50 * n, 'g', 'porridge oats', 'Cupboard'),
  line(150 * n, 'ml', 'milk', 'Dairy & eggs'),
  line(100 * n, 'g', 'Greek yogurt', 'Dairy & eggs'),
  line(n, 'tbsp', 'chia seeds', 'Cupboard'),
  line(80 * n, 'g', 'mixed berries', 'Produce'),
];
const oatsSteps = [
  step('Stir the oats, milk, yogurt and chia seeds together. Cover and chill overnight.', ['porridge oats', 'milk', 'Greek yogurt', 'chia seeds']),
  step('Top with the berries.', ['mixed berries']),
];
const oats = await svc.createRecipe(userId, {
  title: 'Overnight oats',
  tags: ['breakfast', 'make ahead'],
  original: version({ label: 'Original', servings: 1, prep_minutes: 5, cook_minutes: 0, nutrition: [420, 21, 56, 12], ingredients: oatsLines(1), steps: oatsSteps }),
});
const oatsForTwo = await svc.createVersion(
  userId,
  oats.id,
  version({
    label: 'For two',
    servings: 2,
    based_on_version_id: oats.versions[0]!.id,
    notes: 'Doubled. Make it in two jars so each is ready to grab.',
    prep_minutes: 5,
    cook_minutes: 0,
    nutrition: [840, 42, 112, 24],
    ingredients: oatsLines(2),
    steps: oatsSteps,
  }),
);

const yogurtLines = (n: number) => [
  line(200 * n, 'g', 'Greek yogurt', 'Dairy & eggs'),
  line(100 * n, 'g', 'mixed berries', 'Produce'),
  line(40 * n, 'g', 'granola', 'Cupboard'),
  line(n, 'tsp', 'honey', 'Cupboard', { optional: true }),
];
const yogurtSteps = [step('Spoon the yogurt into a bowl and top with the berries, granola and honey.', ['Greek yogurt', 'mixed berries', 'granola', 'honey'])];
const yogurt = await svc.createRecipe(userId, {
  title: 'Yogurt, berries & granola',
  tags: ['breakfast', 'quick'],
  original: version({ label: 'Original', servings: 1, prep_minutes: 5, cook_minutes: 0, nutrition: [350, 22, 40, 11], ingredients: yogurtLines(1), steps: yogurtSteps }),
});
const yogurtForTwo = await svc.createVersion(
  userId,
  yogurt.id,
  version({
    label: 'For two',
    servings: 2,
    based_on_version_id: yogurt.versions[0]!.id,
    notes: 'Doubled.',
    prep_minutes: 5,
    cook_minutes: 0,
    nutrition: [700, 44, 80, 22],
    ingredients: yogurtLines(2),
    steps: yogurtSteps,
  }),
);

const traybake = await svc.createRecipe(userId, {
  title: 'Harissa chicken traybake',
  description: 'Everything roasts in one tin.',
  tags: ['dinner', 'one tin'],
  original: version({
    label: 'Original',
    servings: 2,
    prep_minutes: 10,
    cook_minutes: 35,
    nutrition: [1120, 82, 78, 52],
    ingredients: [
      line(4, null, 'chicken thighs', 'Meat & fish'),
      line(2, 'tbsp', 'harissa paste', 'Cupboard'),
      line(400, 'g', 'new potatoes', 'Produce', { prep: 'halved' }),
      line(1, null, 'red pepper', 'Produce', { prep: 'cut into chunks' }),
      line(1, null, 'lemon', 'Produce', { prep: 'halved' }),
    ],
    steps: [
      step('Heat the oven to 200°C fan. Toss the potatoes and pepper with oil in a roasting tin and roast for 10 min.', ['new potatoes', 'red pepper'], 10),
      step('Rub the chicken with the harissa, nestle it into the tin with the lemon and roast for 25 min.', ['chicken thighs', 'harissa paste', 'lemon'], 25),
      step('Squeeze the roasted lemon over everything and serve from the tin.'),
    ],
  }),
});

const risotto = await svc.createRecipe(userId, {
  title: 'Mushroom risotto',
  tags: ['dinner', 'vegetarian'],
  original: version({
    label: 'Original',
    servings: 2,
    prep_minutes: 10,
    cook_minutes: 30,
    nutrition: [1080, 30, 150, 38],
    ingredients: [
      line(20, 'g', 'butter', 'Dairy & eggs'),
      line(1, null, 'onions', 'Produce', { prep: 'finely chopped' }),
      line(2, 'clove', 'garlic', 'Produce', { prep: 'crushed' }),
      line(250, 'g', 'chestnut mushrooms', 'Produce', { prep: 'sliced' }),
      line(150, 'g', 'risotto rice', 'Cupboard'),
      line(600, 'ml', 'vegetable stock', 'Cupboard', { prep: 'hot' }),
      line(30, 'g', 'parmesan', 'Dairy & eggs', { prep: 'finely grated' }),
    ],
    steps: [
      step('Melt the butter and soften the onions for 5 min. Add the garlic and mushrooms and cook until golden.', ['butter', 'onions', 'garlic', 'chestnut mushrooms'], 5),
      step('Stir in the rice for 1 min, until the edges turn clear.', ['risotto rice']),
      step('Add the stock a ladle at a time, stirring, for 18–20 min, until the rice is just tender.', ['vegetable stock'], 20),
      step('Take it off the heat, beat in the parmesan and rest for 2 min before serving.', ['parmesan'], 2),
    ],
  }),
});

const apple = await svc.createRecipe(userId, {
  title: 'Apple & peanut butter',
  kind: 'simple',
  tags: ['snack'],
  original: version({
    label: 'Original',
    servings: 1,
    prep_minutes: 2,
    cook_minutes: 0,
    nutrition: [190, 5, 26, 8],
    ingredients: [line(1, null, 'apple', 'Produce'), line(1, 'tbsp', 'peanut butter', 'Cupboard')],
    steps: [step('Slice the apple and serve it with the peanut butter.', ['apple', 'peanut butter'])],
  }),
});

/* ---------------------------------- Plan ----------------------------------- */

const monday = new Date();
monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
const day = (offset: number) => {
  const d = new Date(monday);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const [MON, TUE, WED, THU, FRI, SAT, SUN] = [0, 1, 2, 3, 4, 5, 6];
type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const both = [ben, jess];

/** Plans a version cooked on a day, for the given people at each (day, slot) meal. */
const plan = (versionId: string, cookDay: number, meals: [number, Slot][], people = both) =>
  svc.planService(userId, {
    version_id: versionId,
    cook_date: day(cookDay),
    portions: meals.flatMap(([d, slot]) => people.map((p) => ({ person_id: p.id, date: day(d), slot }))),
  });

for (const d of [MON, WED, FRI, SUN]) await plan(oatsForTwo.id, d, [[d, 'breakfast']]);
for (const d of [THU, SAT]) await plan(yogurtForTwo.id, d, [[d, 'breakfast']]);
// Tuesday: a different breakfast each.
await plan(oats.versions[0]!.id, TUE, [[TUE, 'breakfast']], [ben]);
await plan(yogurt.versions[0]!.id, TUE, [[TUE, 'breakfast']], [jess]);

for (const d of [MON, FRI, SUN]) await plan(wrap.versions[0]!.id, d, [[d, 'lunch']]);
// Cooked once, eaten twice: the second meal is the leftovers.
await plan(katsu.versions[0]!.id, MON, [[MON, 'dinner'], [TUE, 'lunch']]);
await plan(chickpea.versions[0]!.id, WED, [[WED, 'lunch'], [THU, 'lunch']]);

await plan(salmon.versions[0]!.id, TUE, [[TUE, 'dinner']]);
await plan(traybake.versions[0]!.id, THU, [[THU, 'dinner']]);
await plan(risotto.versions[0]!.id, FRI, [[FRI, 'dinner']]);
await plan(katsuForTwo.id, SAT, [[SAT, 'dinner']]);
await plan(salmon.versions[0]!.id, SUN, [[SUN, 'dinner']]);
await plan(apple.versions[0]!.id, THU, [[THU, 'snack']], [ben]);
// Wednesday dinner and Saturday lunch are left to plan.

await db.destroy();
console.log(`Seeded 2 people, 9 recipes and this week's plan (from ${day(0)}).`);
