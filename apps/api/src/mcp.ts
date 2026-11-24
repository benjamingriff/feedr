import type { Context } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPTransport } from '@hono/mcp';
import { z } from 'zod';
import {
  DateRange,
  IsoDate,
  PersonInput,
  PersonUpdate,
  PortionInput,
  PortionUpdate,
  RecipeCreate,
  RecipeUpdate,
  ServiceCreate,
  ServiceUpdate,
  Slot,
  VersionInput,
} from '@feedr/core';
import type { AuthUser } from './auth.ts';
import * as svc from './service.ts';
import { fetchRecipeSource } from './recipe-source.ts';

const INSTRUCTIONS = `feedr stores recipes, plans meals and portions cooked dishes for a household.

Model:
- A recipe has one or more versions. Each version is a complete, cookable recipe: its own ingredients, steps and WHOLE-BATCH nutrition. The original version is the recipe as published.
- Scaling is your job, not the server's. To cook a different amount, create a new version with sensible amounts: round whole items (eggs, tins) to whole numbers, don't scale spices, salt or aromatics linearly, adjust pan sizes and cook times in the steps, and record what you changed in notes. Reuse an existing version when it's close enough.
- Nutrition is for the whole batch the version makes, not per serving. Mark it from_source when taken from the source, agent_estimate when you calculated it.
- A service is one version cooked on a date. Its portions say who eats it, when (date + slot: breakfast, lunch, dinner, snack) and how much. The server splits the dish by calorie target: each portion's share = its target_kcal / the sum of all portion targets. Leftovers are extra portions, e.g. tomorrow's lunch.

Importing: call fetch_recipe_source with the URL, then create_recipe. Published nutrition is usually per serving; multiply by the yield for the whole batch.

Writing a version for the app:
- Tag every recipe with its meal type: breakfast, lunch, dinner or treat (more than one is fine). The app's cookbook filters on these tags. A treat is something sweet that's nice rather than good for you, such as a cake, brownies or a weekend bake.
- Link ingredients to steps. Each step takes ingredients: [{ line, quantity?, unit? }], where line is the index of the ingredient in this version's ingredients array, starting at 0. The app's cook mode lists a step's ingredients beside it. Give quantity and unit only when a step uses part of a line, e.g. 4 of the 6 garlic cloves now and 2 in a later step.
- Refer to each ingredient in the step text by its name or the main word of its name, so the app can mark it.
- Set timer_seconds on steps with a wait, and prep_minutes and cook_minutes on the version.

Planning a meal:
1. get_slot_targets for the slot and people to see the calories (and protein) the meal should provide.
2. Pick a version near the total, or create one with create_recipe_version.
3. plan_service with the version and one portion per person per meal. The result includes each portion's nutrition and a dish-up guide.
4. get_plan to check each person's day totals against their targets.

Planning a treat: plan it in the snack slot. A bake that lasts several days is one service with a portion for each person on each day they'll have some, since the whole batch is split across its portions.

Shopping: get_shopping_list combines the ingredients of every service cooked in a date range (or of given versions) by ingredient and aisle. It is read-only.

Ingredients: call list_ingredients first and reuse existing names exactly (spelling variants like yogurt/yoghurt create duplicates and split the shopping list). Give an aisle for every new ingredient, reusing existing aisle names (e.g. Produce, Meat & fish, Dairy, Spices, Tins & jars, Rice & pasta). Use metric units.`;

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };

async function run(fn: () => Promise<unknown>): Promise<Result> {
  try {
    const value = await fn();
    return { content: [{ type: 'text', text: JSON.stringify(value === undefined ? { ok: true } : value) }] };
  } catch (error) {
    const message =
      error instanceof svc.NotFoundError || error instanceof svc.InvalidError || error instanceof z.ZodError
        ? error.message
        : 'Internal error';
    if (message === 'Internal error') console.error(error);
    return { content: [{ type: 'text', text: message }], isError: true };
  }
}

const id = z.uuid();

export function buildMcpServer(user: AuthUser): McpServer {
  const u = user.id;
  const server = new McpServer({ name: 'feedr', version: '0.1.0' }, { instructions: INSTRUCTIONS });
  const readOnly = { readOnlyHint: true };

  // People
  server.registerTool(
    'list_people',
    {
      description:
        'People in the household with weight, daily calorie/protein targets and how calories split across meal slots.',
      inputSchema: {},
      annotations: readOnly,
    },
    () => run(() => svc.listPeople(u)),
  );
  server.registerTool(
    'create_person',
    {
      description:
        'Add a person to cook for. slot_split defaults to breakfast 0.25, lunch 0.3, dinner 0.35, snack 0.1.',
      inputSchema: PersonInput.shape,
    },
    (input) => run(() => svc.createPerson(u, input)),
  );
  server.registerTool(
    'update_person',
    {
      description: "Update a person's weight, targets or slot split.",
      inputSchema: { person_id: id, ...PersonUpdate.shape },
    },
    ({ person_id, ...input }) => run(() => svc.updatePerson(u, person_id, input)),
  );
  server.registerTool(
    'get_slot_targets',
    {
      description:
        'Calorie and protein targets for a meal slot, per person and in total. Use before choosing or creating a version.',
      inputSchema: { slot: Slot, person_ids: z.array(id).optional().describe('Defaults to everyone') },
      annotations: readOnly,
    },
    ({ slot, person_ids }) => run(() => svc.slotTargets(u, slot, person_ids)),
  );

  // Recipes
  server.registerTool(
    'list_ingredients',
    {
      description: 'Known canonical ingredient names and aisles. Reuse these names in recipes.',
      inputSchema: { q: z.string().optional() },
      annotations: readOnly,
    },
    ({ q }) => run(() => svc.listIngredients(u, q)),
  );
  server.registerTool(
    'search_recipes',
    {
      description:
        'Find recipes by text or tag. Returns summaries with each version id, label, servings, prep and cook minutes and whole-batch kcal.',
      inputSchema: { q: z.string().optional(), tag: z.string().optional() },
      annotations: readOnly,
    },
    (opts) => run(() => svc.searchRecipes(u, opts)),
  );
  server.registerTool(
    'get_recipe',
    {
      description: 'A recipe with every version in full: ingredients, steps and whole-batch nutrition.',
      inputSchema: { recipe_id: id },
      annotations: readOnly,
    },
    ({ recipe_id }) => run(() => svc.getRecipe(u, recipe_id)),
  );
  server.registerTool(
    'fetch_recipe_source',
    {
      description:
        "Fetch a recipe web page and return its structured recipe data (name, yield, times, ingredient lines, steps, published nutrition per serving) from the page's schema.org markup. Falls back to the page's plain text. Use this to import from a URL instead of reading raw HTML.",
      inputSchema: { url: z.url() },
      annotations: readOnly,
    },
    ({ url }) =>
      run(async () => {
        try {
          return await fetchRecipeSource(url);
        } catch (error) {
          throw new svc.InvalidError(error instanceof Error ? error.message : String(error));
        }
      }),
  );
  server.registerTool(
    'create_recipe',
    {
      description:
        'Create a recipe and its original version (as published) in one call. Keep the source_url. Nutrition is for the whole batch. Tag the meal type and link each step to the ingredients it uses.',
      inputSchema: RecipeCreate.shape,
    },
    (input) => run(() => svc.createRecipe(u, input)),
  );
  server.registerTool(
    'update_recipe',
    {
      description: 'Update recipe details (title, description, source, tags, image). Versions are edited separately.',
      inputSchema: { recipe_id: id, ...RecipeUpdate.shape },
    },
    ({ recipe_id, ...input }) => run(() => svc.updateRecipe(u, recipe_id, input)),
  );
  server.registerTool(
    'archive_recipe',
    { description: 'Hide a recipe from lists. Planned services keep working.', inputSchema: { recipe_id: id } },
    ({ recipe_id }) => run(() => svc.archiveRecipe(u, recipe_id)),
  );
  server.registerTool(
    'create_recipe_version',
    {
      description:
        'Add a scaled or adapted version: complete ingredients, steps (each linked to the ingredients it uses) and whole-batch nutrition, scaled with judgement (whole eggs, non-linear spices, adjusted times). Say what changed in notes and set based_on_version_id.',
      inputSchema: { recipe_id: id, ...VersionInput.shape },
    },
    ({ recipe_id, ...input }) => run(() => svc.createVersion(u, recipe_id, input)),
  );
  server.registerTool(
    'update_recipe_version',
    {
      description:
        'Edit a version. Any of ingredients, steps or nutrition given replaces that part entirely. Step ingredient links point at ingredient lines, so when you replace ingredients, send steps too to keep the links.',
      inputSchema: { version_id: id, ...VersionInput.partial().shape },
    },
    ({ version_id, ...input }) => run(() => svc.updateVersion(u, version_id, input)),
  );
  server.registerTool(
    'delete_recipe_version',
    {
      description: 'Delete a version that no service uses. A recipe keeps at least one version.',
      inputSchema: { version_id: id },
    },
    ({ version_id }) => run(() => svc.deleteVersion(u, version_id)),
  );

  // Planning
  server.registerTool(
    'plan_service',
    {
      description:
        'Plan cooking a version on cook_date and who eats it. One portion per person per meal; extra portions can be later meals (leftovers). Each portion gets target_kcal from the person and slot unless given. Returns portions with nutrition and a dish-up guide.',
      inputSchema: ServiceCreate.shape,
    },
    (input) => run(() => svc.planService(u, input)),
  );
  server.registerTool(
    'plan_services',
    {
      description:
        'Plan several services in one atomic call, e.g. breakfast and a snack for each day of the week. Same fields as plan_service. Returns a compact summary of each.',
      inputSchema: { services: z.array(ServiceCreate).min(1).max(40) },
    },
    ({ services }) =>
      run(async () =>
        (await svc.planServices(u, services)).map((s) => ({
          id: s.id,
          recipe: s.recipe_title,
          version: s.version_label,
          cook_date: s.cook_date,
          portions: s.portions.map((p) => ({
            id: p.id,
            person: p.person_name,
            date: p.date,
            slot: p.slot,
            kcal: p.nutrition.kcal == null ? null : Math.round(p.nutrition.kcal),
            protein_g: p.nutrition.protein_g == null ? null : Math.round(p.nutrition.protein_g),
          })),
        })),
      ),
  );
  server.registerTool(
    'get_service',
    {
      description: 'A service with its portions, per-portion nutrition and dish-up guide.',
      inputSchema: { service_id: id },
      annotations: readOnly,
    },
    ({ service_id }) => run(() => svc.getService(u, service_id)),
  );
  server.registerTool(
    'update_service',
    {
      description: 'Change the cook date, notes or cooked weight of a service.',
      inputSchema: { service_id: id, ...ServiceUpdate.shape },
    },
    ({ service_id, ...input }) => run(() => svc.updateService(u, service_id, input)),
  );
  server.registerTool(
    'add_portions',
    {
      description: 'Add portions to a service, e.g. lunch leftovers. Shares are recalculated.',
      inputSchema: { service_id: id, portions: z.array(PortionInput).min(1) },
    },
    ({ service_id, portions }) => run(() => svc.addPortions(u, service_id, portions)),
  );
  server.registerTool(
    'update_portion',
    {
      description:
        "Move a portion to another person, date or slot, or change its target_kcal. The target isn't recalculated when moving.",
      inputSchema: { portion_id: id, ...PortionUpdate.shape },
    },
    ({ portion_id, ...input }) => run(() => svc.updatePortion(u, portion_id, input)),
  );
  server.registerTool(
    'remove_portion',
    { description: 'Remove a portion. Removing the last one removes the service.', inputSchema: { portion_id: id } },
    ({ portion_id }) => run(() => svc.removePortion(u, portion_id)),
  );
  server.registerTool(
    'delete_service',
    { description: 'Remove a planned service and all its portions.', inputSchema: { service_id: id } },
    ({ service_id }) => run(() => svc.deleteService(u, service_id)),
  );
  server.registerTool(
    'get_plan',
    {
      description:
        "Each day in the range, each person's meals and nutrition totals against their daily targets, plus unassigned leftover portions. Max 62 days.",
      inputSchema: DateRange.shape,
      annotations: readOnly,
    },
    ({ start, end }) => run(() => svc.getPlan(u, start, end)),
  );

  // Shopping
  server.registerTool(
    'get_shopping_list',
    {
      description:
        'Combined ingredients, grouped by aisle, for every service cooked between start and end, or for the given version ids (repeat an id to count it twice).',
      inputSchema: { start: IsoDate.optional(), end: IsoDate.optional(), version_ids: z.array(id).optional() },
      annotations: readOnly,
    },
    ({ start, end, version_ids }) =>
      run(async () => {
        if (version_ids?.length) return svc.shoppingList(u, { version_ids });
        if (!start || !end) throw new svc.InvalidError('Give start and end, or version_ids');
        return svc.shoppingList(u, { start, end });
      }),
  );

  return server;
}

/** Stateless Streamable HTTP: a fresh server per request, bound to the authenticated user. */
export async function handleMcp(c: Context, user: AuthUser) {
  const server = buildMcpServer(user);
  const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(c);
}
