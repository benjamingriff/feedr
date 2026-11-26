// Connects to a running API's /mcp endpoint with the official MCP client and walks the agent workflow.
// FEEDR_URL=http://localhost:4100 FEEDR_TOKEN=feedr_... pnpm smoke:mcp
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = process.env.FEEDR_URL ?? `http://localhost:${process.env.PORT ?? 4100}`;
const token = process.env.FEEDR_TOKEN;
if (!token) throw new Error('Set FEEDR_TOKEN');

const client = new Client({ name: 'feedr-smoke', version: '0.0.0' });
await client.connect(
  new StreamableHTTPClientTransport(new URL('/mcp', url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  if (res.isError) throw new Error(`${name}: ${res.content[0]?.text}`);
  return JSON.parse(res.content[0]!.text);
};

const { tools } = await client.listTools();
console.log(`${tools.length} tools; instructions: ${client.getInstructions()?.length ?? 0} chars`);

const people = await call('list_people');
const targets = await call('get_slot_targets', { slot: 'dinner', person_ids: people.map((p: { id: string }) => p.id) });
console.log(
  'dinner targets',
  targets.people.map((p: any) => `${p.name} ${p.kcal} kcal`).join(', '),
  '→',
  targets.total_kcal,
);

// Per-line nutrition estimates; the server adds them up for the batch.
const est = (kcal: number, protein_g: number, carbs_g: number, fat_g: number) => ({ kcal, protein_g, carbs_g, fat_g });
const recipe = await call('create_recipe', {
  title: 'Smoke test shakshuka',
  source_url: 'https://example.com/shakshuka',
  tags: ['eggs', 'smoke'],
  original: {
    servings: 2,
    ingredients: [
      { ingredient: 'egg', aisle: 'Dairy', quantity: 4, raw_text: '4 eggs', nutrition: est(290, 25, 1, 20) },
      {
        ingredient: 'chopped tomatoes',
        quantity: 1,
        unit: 'tin',
        raw_text: '1 tin chopped tomatoes',
        nutrition: est(80, 4, 14, 1),
      },
      {
        ingredient: 'ground cumin',
        aisle: 'Spices',
        quantity: 1,
        unit: 'tsp',
        raw_text: '1 tsp ground cumin',
        nutrition: est(8, 0.4, 1, 0.5),
      },
    ],
    steps: [
      {
        text: 'Simmer the tomatoes with cumin, crack in the eggs, cover and cook for 8 minutes until set.',
        timer_seconds: 480,
        ingredients: [{ line: 0 }, { line: 1 }, { line: 2 }],
      },
    ],
  },
});
const saved = await call('create_recipe_version', {
  recipe_id: recipe.recipe_id,
  label: 'For two, bigger',
  servings: 3,
  based_on_version_id: recipe.versions[0].version_id,
  ingredients: [
    { ingredient: 'egg', quantity: 6, raw_text: '6 eggs', nutrition: est(430, 38, 2, 30) },
    {
      ingredient: 'chopped tomatoes',
      quantity: 2,
      unit: 'tin',
      raw_text: '2 tins chopped tomatoes',
      nutrition: est(160, 8, 28, 2),
    },
    {
      ingredient: 'ground cumin',
      quantity: 1.25,
      unit: 'tsp',
      raw_text: '1¼ tsp ground cumin',
      nutrition: est(10, 0.5, 1, 0.6),
    },
  ],
  steps: [
    {
      text: 'In a large pan, simmer the tomatoes with cumin, crack in the eggs, cover and cook for 10 minutes until set.',
      timer_seconds: 600,
      ingredients: [{ line: 0 }, { line: 1 }, { line: 2 }],
    },
  ],
});
// Writes return ids and counts; the new version is the last one.
const version = { id: saved.versions.at(-1).version_id };
const service = await call('plan_service', {
  version_id: version.id,
  cook_date: '2027-01-04',
  portions: people.map((p: { id: string }) => ({ person_id: p.id, date: '2027-01-04', slot: 'dinner' })),
});
console.log('dish-up', service.dish_up.meals.map((m: any) => `${m.slot} ${m.ratio ?? ''} ${m.fraction}`).join('; '));
const plan = await call('get_plan', { start: '2027-01-04', end: '2027-01-04' });
console.log(
  'day totals',
  plan.days[0].people.map((p: any) => `${p.name} ${p.totals.kcal}/${p.target_kcal}`).join(', '),
);
const shopping = await call('get_shopping_list', { start: '2027-01-04', end: '2027-01-04' });
console.log(
  'shopping',
  shopping.items
    .map(
      (i: any) =>
        `${i.ingredient}: ${i.amounts.map((a: any) => `${a.quantity}${a.unit ? ' ' + a.unit : ''}`).join(' + ')}`,
    )
    .join('; '),
);

await call('delete_service', { service_id: service.id });
await call('delete_recipe', { recipe_id: recipe.recipe_id });
await client.close();
console.log('MCP smoke passed');
