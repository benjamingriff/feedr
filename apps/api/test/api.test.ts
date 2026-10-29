import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Plan, Recipe, RecipeVersion, Service, ShoppingList } from '@feedr/core';
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
  const me = await call<{ id: string }>('POST', '/people', { name: 'Ben', weight_kg: 80, daily_kcal: 2800, daily_protein_g: 180 }, 201);
  const sam = await call<{ id: string }>('POST', '/people', { name: 'Sam', daily_kcal: 2000, daily_protein_g: 110 }, 201);

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
  assert.equal(grams.reduce((s, g) => s + g, 0), 2400);

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
  assert.deepEqual(shopping.items.find((i) => i.ingredient === 'chicken thigh')!.amounts, [{ quantity: 1, unit: 'kg' }]);

  const byVersion = await call<ShoppingList>('GET', `/shopping?version_ids=${recipe.versions[0]!.id},${version.id}`);
  assert.deepEqual(byVersion.items.find((i) => i.ingredient === 'onion')!.amounts, [{ quantity: 5, unit: null }]);
  assert.deepEqual(byVersion.items.find((i) => i.ingredient === 'salt')!.unquantified, ['salt, to taste']);

  // A leftover dated next week shows in next week's plan even though it was cooked this week.
  const dated = await call<Service>('POST', `/services/${service.id}/portions`, [{ target_kcal: 400, date: '2026-11-09' }]);
  const datedSpare = dated.portions.find((p) => p.date === '2026-11-09')!;
  assert.equal((await call<Plan>('GET', '/plan?start=2026-11-09&end=2026-11-15')).unassigned.length, 1);
  assert.equal((await call<Plan>('GET', '/plan?start=2026-11-02&end=2026-11-08')).unassigned.length, 0);
  await call('DELETE', `/portions/${datedSpare.id}`);

  // A version in use can't be deleted; removing every portion removes the service.
  await call('DELETE', `/versions/${version.id}`, undefined, 400);
  for (const p of withSpare.portions) await call('DELETE', `/portions/${p.id}`);
  await call('GET', `/services/${service.id}`, undefined, 404);
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

  const bad = await rpc('tools/call', { name: 'get_recipe', arguments: { recipe_id: '00000000-0000-4000-8000-000000000000' } });
  assert.equal(bad.result.isError, true);
});
