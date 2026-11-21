import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Plan, Recipe, RecipeSummary, RecipeVersion, Service, ShoppingList } from '@feedr/core';
import { app } from '../src/app.ts';
import { createAccessToken } from '../src/auth.ts';
import { db, migrate } from '../src/db.ts';

let token = '';
let userId = '';

before(async () => {
  await migrate();
  userId = (await db.insertInto('users').values({ name: 'Test' }).returning('id').executeTakeFirstOrThrow()).id;
  token = await createAccessToken(userId, 'test');
});
after(async () => {
  await db.deleteFrom('users').where('id', '=', userId).execute();
  await db.destroy();
});

async function call<T>(method: string, path: string, body?: unknown, status = 200): Promise<T> {
  const res = await app.request(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  assert.equal(res.status, status, `${method} ${path}: ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

const nutrition = (kcal: number, protein_g: number) => ({
  kcal,
  protein_g,
  carbs_g: 200,
  fat_g: 80,
  saturated_fat_g: 20,
  fibre_g: 30,
  sugar_g: 25,
  salt_g: 6,
  source: 'agent_estimate' as const,
});

test('rejects missing and bad tokens', async () => {
  assert.equal((await app.request('/recipes')).status, 401);
  assert.equal((await app.request('/recipes', { headers: { Authorization: 'Bearer feedr_nope' } })).status, 401);
  assert.equal((await app.request('/health')).status, 200);
});

test('recipe → version → service → plan → shopping', async () => {
  const me = await call<{ id: string }>(
    'POST',
    '/people',
    { name: 'Ben', weight_kg: 80, daily_kcal: 2800, daily_protein_g: 180 },
    201,
  );
  const sam = await call<{ id: string }>(
    'POST',
    '/people',
    { name: 'Sam', daily_kcal: 2000, daily_protein_g: 110 },
    201,
  );

  const recipe = await call<Recipe>(
    'POST',
    '/recipes',
    {
      title: 'Chicken curry',
      source_url: 'https://example.com/curry',
      tags: ['curry', 'batch'],
      original: {
        servings: 4,
        ingredients: [
          { ingredient: 'chicken thigh', aisle: 'Meat', quantity: 800, unit: 'g', raw_text: '800g chicken thighs' },
          { ingredient: 'onion', aisle: 'Produce', quantity: 2, raw_text: '2 onions, sliced', preparation: 'sliced' },
          { ingredient: 'curry powder', aisle: 'Spices', quantity: 2, unit: 'tbsp', raw_text: '2 tbsp curry powder' },
          { ingredient: 'salt', raw_text: 'salt, to taste' },
        ],
        steps: [{ text: 'Brown the chicken.' }, { text: 'Add onions and curry powder.', timer_seconds: 600 }],
        nutrition: nutrition(2200, 180),
      },
    },
    201,
  );
  assert.equal(recipe.versions.length, 1);
  assert.equal(recipe.versions[0]!.label, 'Original');
  assert.equal(recipe.versions[0]!.ingredients[1]!.ingredient, 'onion');

  const targets = await call<{ total_kcal: number }>('GET', `/slot-targets?slot=dinner&person_ids=${me.id},${sam.id}`);
  assert.equal(targets.total_kcal, 1680);

  const version = await call<RecipeVersion>(
    'POST',
    `/recipes/${recipe.id}/versions`,
    {
      label: 'Two dinners + two lunches',
      servings: 5,
      notes: 'Whole onions; curry powder 2.5 tbsp',
      based_on_version_id: recipe.versions[0]!.id,
      ingredients: [
        { ingredient: 'Chicken Thigh', quantity: 1000, unit: 'g', raw_text: '1kg chicken thighs' },
        { ingredient: 'onion', quantity: 3, raw_text: '3 onions, sliced' },
        { ingredient: 'curry powder', quantity: 2.5, unit: 'tbsp', raw_text: '2½ tbsp curry powder' },
      ],
      steps: [{ text: 'Brown the chicken in two batches.' }],
      nutrition: nutrition(2910, 230),
    },
    201,
  );
  // Ingredient names are matched case-insensitively and keep their aisle.
  assert.equal(version.ingredients[0]!.ingredient, 'chicken thigh');
  assert.equal(version.ingredients[0]!.aisle, 'Meat');

  const service = await call<Service>(
    'POST',
    '/services',
    {
      version_id: version.id,
      cook_date: '2026-11-02',
      portions: [
        { person_id: me.id, date: '2026-11-02', slot: 'dinner' },
        { person_id: sam.id, date: '2026-11-02', slot: 'dinner' },
        { person_id: me.id, date: '2026-11-03', slot: 'lunch' },
        { person_id: sam.id, date: '2026-11-03', slot: 'lunch' },
      ],
    },
    201,
  );
  assert.deepEqual(
    service.portions.map((p) => p.target_kcal),
    [980, 700, 840, 600],
  );
  const shareSum = service.portions.reduce((s, p) => s + p.share, 0);
  assert.ok(Math.abs(shareSum - 1) < 1e-9);
  assert.equal(service.dish_up.meals.length, 2);
  assert.equal(service.dish_up.meals[0]!.slot, 'dinner');
  assert.equal(service.dish_up.meals[0]!.portions[0]!.grams, null);

  const weighed = await call<Service>('PATCH', `/services/${service.id}`, { cooked_weight_g: 2400 });
  const grams = weighed.dish_up.meals.flatMap((m) => m.portions.map((p) => p.grams ?? 0));
  assert.equal(
    grams.reduce((s, g) => s + g, 0),
    2400,
  );

  const plan = await call<Plan>('GET', '/plan?start=2026-11-02&end=2026-11-08');
  assert.equal(plan.days.length, 7);
  const monBen = plan.days[0]!.people.find((p) => p.person_id === me.id)!;
  assert.equal(monBen.meals.length, 1);
  assert.equal(monBen.meals[0]!.recipe_title, 'Chicken curry');
  assert.ok(Math.abs(monBen.totals.kcal! - (2910 * 980) / 3120) < 0.2);

  // Leftover portion with no person shows as unassigned, then can be assigned.
  const withSpare = await call<Service>('POST', `/services/${service.id}/portions`, [{ target_kcal: 500 }]);
  const spare = withSpare.portions.find((p) => p.person_id === null)!;
  assert.equal((await call<Plan>('GET', '/plan?start=2026-11-02&end=2026-11-08')).unassigned.length, 1);
  await call('PATCH', `/portions/${spare.id}`, { person_id: me.id, date: '2026-11-04', slot: 'lunch' });
  assert.equal((await call<Plan>('GET', '/plan?start=2026-11-02&end=2026-11-08')).unassigned.length, 0);

  const shopping = await call<ShoppingList>('GET', '/shopping?start=2026-11-01&end=2026-11-07');
  const onion = shopping.items.find((i) => i.ingredient === 'onion')!;
  assert.deepEqual(onion.amounts, [{ quantity: 3, unit: null }]);
  assert.deepEqual(shopping.items.find((i) => i.ingredient === 'chicken thigh')!.amounts, [
    { quantity: 1, unit: 'kg' },
  ]);

  const byVersion = await call<ShoppingList>('GET', `/shopping?version_ids=${recipe.versions[0]!.id},${version.id}`);
  assert.deepEqual(byVersion.items.find((i) => i.ingredient === 'onion')!.amounts, [{ quantity: 5, unit: null }]);
  assert.deepEqual(byVersion.items.find((i) => i.ingredient === 'salt')!.unquantified, ['salt, to taste']);

  // A leftover dated next week shows in next week's plan even though it was cooked this week.
  const dated = await call<Service>('POST', `/services/${service.id}/portions`, [
    { target_kcal: 400, date: '2026-11-09' },
  ]);
  const datedSpare = dated.portions.find((p) => p.date === '2026-11-09')!;
  assert.equal((await call<Plan>('GET', '/plan?start=2026-11-09&end=2026-11-15')).unassigned.length, 1);
  assert.equal((await call<Plan>('GET', '/plan?start=2026-11-02&end=2026-11-08')).unassigned.length, 0);
  await call('DELETE', `/portions/${datedSpare.id}`);

  // A version in use can't be deleted; removing every portion removes the service.
  await call('DELETE', `/versions/${version.id}`, undefined, 400);
  for (const p of withSpare.portions) await call('DELETE', `/portions/${p.id}`);
  await call('GET', `/services/${service.id}`, undefined, 404);
});

test('step ingredient links are stored with a version and read back', async () => {
  const recipe = await call<Recipe>(
    'POST',
    '/recipes',
    {
      title: 'Garlic rice',
      tags: ['dinner'],
      original: {
        servings: 2,
        prep_minutes: 5,
        cook_minutes: 15,
        ingredients: [
          { ingredient: 'garlic', aisle: 'Produce', quantity: 6, unit: 'clove', raw_text: '6 garlic cloves' },
          {
            ingredient: 'basmati rice',
            aisle: 'Rice & pasta',
            quantity: 150,
            unit: 'g',
            raw_text: '150g basmati rice',
          },
        ],
        steps: [
          { text: 'Fry 4 cloves of garlic.', ingredients: [{ line: 0, quantity: 4, unit: 'clove' }] },
          {
            text: 'Add the rice and the rest of the garlic.',
            ingredients: [{ line: 1 }, { line: 0, quantity: 2, unit: 'clove' }],
          },
          { text: 'Serve.' },
        ],
        nutrition: nutrition(900, 20),
      },
    },
    201,
  );
  const version = recipe.versions[0]!;
  const [garlic, rice] = version.ingredients;
  assert.deepEqual(
    version.steps.map((s) => s.ingredients),
    [
      [{ line_id: garlic!.id, quantity: 4, unit: 'clove' }],
      // In ingredient order, whatever order they were given in.
      [
        { line_id: garlic!.id, quantity: 2, unit: 'clove' },
        { line_id: rice!.id, quantity: null, unit: null },
      ],
      [],
    ],
  );

  // Reading the recipe back gives the same links, and the summary carries the minutes.
  const read = await call<Recipe>('GET', `/recipes/${recipe.id}`);
  assert.deepEqual(read.versions[0]!.steps, version.steps);
  const summary = (await call<RecipeSummary[]>('GET', '/recipes?q=garlic rice'))[0]!;
  assert.deepEqual([summary.versions[0]!.prep_minutes, summary.versions[0]!.cook_minutes], [5, 15]);

  // Steps can be replaced on their own; links then index the stored ingredients.
  const updated = await call<RecipeVersion>('PATCH', `/versions/${version.id}`, {
    steps: [{ text: 'Cook the rice.', ingredients: [{ line: 1 }] }],
  });
  assert.deepEqual(updated.steps[0]!.ingredients, [{ line_id: rice!.id, quantity: null, unit: null }]);
  await call('PATCH', `/versions/${version.id}`, { steps: [{ text: 'Cook.', ingredients: [{ line: 2 }] }] }, 400);
  await call('DELETE', `/recipes/${recipe.id}`, undefined, 204);
});

test('plan_services plans a batch atomically', async () => {
  const people = await call<{ id: string }[]>('GET', '/people');
  const recipes = await call<{ versions: { id: string }[] }[]>('GET', '/recipes');
  const versionId = recipes[0]!.versions[0]!.id;
  const rpc = async (args: unknown) => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'plan_services', arguments: args },
      }),
    });
    return ((await res.json()) as { result: { content: { text: string }[]; isError?: boolean } }).result;
  };
  const days = ['2026-12-07', '2026-12-08', '2026-12-09'];
  const ok = await rpc({
    services: days.map((d) => ({
      version_id: versionId,
      cook_date: d,
      portions: [{ person_id: people[0]!.id, date: d, slot: 'breakfast' }],
    })),
  });
  const planned = JSON.parse(ok.content[0]!.text) as { id: string; portions: { kcal: number }[] }[];
  assert.equal(planned.length, 3);
  // One bad service means nothing is planned.
  const bad = await rpc({
    services: [
      { version_id: versionId, cook_date: '2026-12-10', portions: [{ person_id: people[0]!.id, slot: 'breakfast' }] },
      { version_id: '00000000-0000-4000-8000-000000000000', cook_date: '2026-12-10', portions: [{ target_kcal: 100 }] },
    ],
  });
  assert.equal(bad.isError, true);
  const plan = await call<Plan>('GET', '/plan?start=2026-12-07&end=2026-12-10');
  assert.equal(plan.days.filter((d) => d.people.some((p) => p.meals.length)).length, 3);
  for (const s of planned) await call('DELETE', `/services/${s.id}`, undefined, 204);
});

test('cannot read another user’s data', async () => {
  const other = (await db.insertInto('users').values({ name: 'Other' }).returning('id').executeTakeFirstOrThrow()).id;
  const otherToken = await createAccessToken(other, 'other');
  const recipes = await call<Recipe[]>('GET', '/recipes');
  const res = await app.request(`/recipes/${recipes[0]!.id}`, { headers: { Authorization: `Bearer ${otherToken}` } });
  assert.equal(res.status, 404);
  await db.deleteFrom('users').where('id', '=', other).execute();
});

test('MCP lists tools and calls them', async () => {
  const rpc = async (method: string, params: unknown) => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    assert.equal(res.status, 200);
    return (await res.json()) as { result: any };
  };
  const tools = await rpc('tools/list', {});
  const names = tools.result.tools.map((t: { name: string }) => t.name);
  for (const n of ['create_recipe', 'create_recipe_version', 'plan_service', 'get_plan', 'get_shopping_list']) {
    assert.ok(names.includes(n), n);
  }
  const search = await rpc('tools/call', { name: 'search_recipes', arguments: { q: 'curry' } });
  const found = JSON.parse(search.result.content[0].text);
  assert.equal(found[0].title, 'Chicken curry');
  assert.equal(found[0].versions.length, 2);

  const bad = await rpc('tools/call', {
    name: 'get_recipe',
    arguments: { recipe_id: '00000000-0000-4000-8000-000000000000' },
  });
  assert.equal(bad.result.isError, true);
});
