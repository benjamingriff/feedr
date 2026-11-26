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
  type Recipe,
} from '@feedr/core';
import type { AuthUser } from './auth.ts';
import * as svc from './service.ts';
import { checkRecipe, checkVersion, saveChecked, storedVersion } from './recipe-check.ts';

const INSTRUCTIONS = `feedr stores recipes, plans meals and portions cooked dishes for a household.

Adding recipes. Do steps 1 to 5 for each dish the user asked for, finishing one before starting the next:
1. list_ingredients.
2. create_recipe with the original version: the source's recipe with the changes the user always makes. Its description says how to write a recipe.
3. create_recipe_version once for each alternative the user asked for: another main, another batch size, a version for targets. When a version is sized for particular meals (the user says who eats it, or asks for targets), pass for_meals at the top level, beside original on create_recipe, e.g. dinner for everyone plus Ben's lunch: the server checks it against those meals' targets. Leave it out only for the source's own batch or a batch size the user fixed. A version for targets always passes it: if refused, change the amounts, never remove for_meals.
4. After each save, read its result and fix the warnings that are real with update_recipe_version.
5. Once the dish has every version the user asked for, get_recipe and cook it through in your head, version by version: does each step have the prepped ingredients, reserved liquid and time it assumes, does each side finish with the main, and is there a doneness cue for the main itself? Check the title and description still fit every version (update_recipe if not). Then go back to step 1 for the next dish.
6. Only when every dish is done, reply: each version's report line from the save results, how it compares with any targets, the batch size you used and whether it differs from the source, and your substitutions and assumptions, from the final read-back. Leave out server warnings and retries unless they changed the recipe. Your reasoning belongs in the reply, never in the recipe.

Model:
- A recipe has one or more versions. Each version is a complete, cookable recipe: its own ingredients, steps and whole-batch nutrition, which the server adds up from your estimate on each ingredient line.
- Scaling is your job, not the server's: round whole items (eggs, tins), don't scale spices, salt or aromatics linearly, and adjust pans and times in the steps. Reuse an existing version when it's close enough.
- A service is one version cooked on a date. Its portions say who eats it, when (date + slot: breakfast, lunch, dinner, snack) and how much. The server splits the dish by calorie target: each portion's share = its target_kcal / the sum of all portion targets. Leftovers are extra portions, e.g. tomorrow's lunch.

Planning a meal:
1. get_slot_targets for the slot and people to see the calories (and protein) the meal should provide.
2. Pick a version near the total, or create one with create_recipe_version.
3. plan_service with the version and one portion per person per meal. The result includes each portion's nutrition and a dish-up guide.
4. get_plan to check each person's day totals against their targets.

Treats live in the cookbook and aren't part of the meal plan yet: don't plan a recipe tagged treat unless the user asks you to.

Shopping: get_shopping_list combines the ingredients of every service cooked in a date range (or of given versions) by ingredient and aisle. It is read-only.

Ingredients: reuse names from list_ingredients exactly (yogurt/yoghurt variants split the shopping list). Give every new ingredient you buy an aisle: an existing one, or one of Produce, Meat & fish, Dairy, Bakery, Baking, Spices, Tins & jars, Rice & pasta, Oils & sauces, Frozen. A new ingredient's name and aisle are fixed once created; water needs no aisle. Use metric units everywhere, step text included.`;

/**
 * How to write a recipe for the app. It is create_recipe's description, because every client shows
 * tool descriptions but some drop the server instructions. The version tools point back to it.
 */
const RECIPE_GUIDE = `Create a recipe and its original version. Add each alternative afterwards with create_recipe_version.

Write it like a page in a good recipe app: the cook reads every field while cooking. Only what helps them cook goes in the recipe. Your reasoning, changes from the source, caveats, portion splits, storage, allergens and tips go in your reply. Never mention agents or "this version".

The server checks every write. It refuses one that breaks a rule, listing each problem by step: fix them all, keep every cooking instruction, and send it again until it saves. Warnings come back with a saved recipe: fix the ones that are real with update_recipe_version.

The recipe:
- title: the dish's name, true of every version ("Katsu curry" for a chicken and a pumpkin version). No brackets.
- description: one or two full sentences that name the dish and say what it's like to eat, true of every version ("Crisp panko katsu comes with rice and a mild, smooth curry sauce."). No method, history or links.
- source_url and source_name (the site's name, e.g. "Wagamama"). The app shows "Adapted from <source_name>".
- tags: the meal type, one or more of breakfast, lunch, dinner or treat (sweet things like cakes and weekend bakes).

Versions:
- The original keeps the source's ingredients, amounts and from-scratch parts (no shop-bought swaps), with the user's standing changes: their method, equipment they lack, substitutions. Make only the changes they asked for, at the size they asked for. Use their usual batch size if they give one, otherwise the source's yield. For equipment they lack, adapt the technique to their tool: which vessel, and what prep it needs.
- One version per alternative, labelled by what's different ("Pumpkin", "Chicken", "High protein"). The original is "Original" or its main. Never two mains in one version.
- When you copy a version, rewrite every mention of what changed, section names included: every amount and volume in the step text, the method, time and doneness cue for a new main, and a paste scaled with the fat and liquid that cook it. Change only what the user asked for: a veggie main keeps the rest of the recipe as it is, unless they ask for a vegetarian dish.
- For a version sized for particular meals, pass for_meals (not for the source's batch or a size the user fixed). First scale every line together so the batch's kcal is within about 10% of those meals' total, with servings = the portions it's for, sides at normal portions (about 75g dry rice a person, never under 50g) and amounts a cook measures: whole tins and eggs, 5 g or ml steps, quarter teaspoons. After rounding, re-estimate each line's nutrition from the same per-gram figures. A version that isn't for protein scales every line together, sides at normal portions. A high-protein version then has more of the main per serving than the original, paid for from the same calories: trim the sides first (to the 50g floor), then use the lighter form of the sauce's rich ingredient (light coconut milk, half-fat crème fraîche) and less frying oil, before cutting the sauce's volume. Don't swap the main or its cut unless the user asks, and never leave out for_meals to get a version saved. Say in your reply where calories or protein fall short.

Ingredients, in the order first used: one line per thing bought or measured, with the prep done before cooking in preparation ("diced", "cut into 4 cm cubes"), not in the steps. Fractions of a tablespoon go in teaspoons. Sides served with it (rice, salad) go last, with amounts, under "To serve" when there are sections. Reserved liquid or the rest of a line links the original line again; water to cover or loosen needs no line, but measured water (4 tbsp for a paste) does. Sections only for separate parts (e.g. "Sauce", "Coating"), ordered by when they're cooked. Each line carries its own nutrition estimate, unless you copy a source's published figures for its unchanged recipe as the version's nutrition (source from_source, the whole batch).

Steps: one stage of cooking each, in the order the cook works: what to do, with what (pan, air fryer, tall jug), about how long, and how to tell it's done, in one to three short sentences. Most recipes need 5 to 10 steps: merge tiny prep-only steps. No separate side step: start the rice in the step from which the rest of the cooking takes about as long as the rice (around 12 minutes), e.g. "While the curry simmers, cook the rice". Introduce any parallel work in the step where the wait begins. Keep the source's times where its method still applies. No tips or reasons. Link every line the step adds or handles and name it as on its line, in a natural sentence ("Heat the olive oil", "Add the onion") (two lines with one name: tell them apart the way a cook would, "a little of the oil", "the flour for coating", never by line number); once a paste or sauce is made, later steps name it and don't relink its lines; a step that only tastes, adjusts or discards a line doesn't link it. A timer is for one wait, until the cook's next action: "air-fry 14 minutes, turning halfway" is two steps of 7 minutes. For a range, time the shortest; no timer on hands-on work or packet times.

notes: usually empty. Only one short line the cook must know before starting when the version is unusual, e.g. "High protein: twice the usual chicken". Never a tip, a comparison or a reason.`;

/**
 * What a recipe write returns: ids and counts instead of the whole recipe, so the next call is easy
 * to make and the reminder of what's left is hard to miss. get_recipe has the full recipe.
 */
function written(recipe: Recipe, next: string) {
  return {
    recipe_id: recipe.id,
    title: recipe.title,
    versions: recipe.versions.map((v) => ({
      version_id: v.id,
      label: v.label,
      servings: v.servings,
      ingredients: v.ingredients.length,
      steps: v.steps.length,
      kcal: v.nutrition?.kcal ?? null,
      protein_g: v.nutrition?.protein_g ?? null,
      report: `${v.label}: ${v.ingredients.length} ingredients, ${v.steps.length} steps`,
    })),
    next,
  };
}
const NEXT_AFTER_WRITE =
  'Saved. Next: add each other version the user asked for with create_recipe_version (recipe_id, and based_on_version_id from versions above), and fix any warnings that are real. Once this dish has every version, get_recipe, then start the next dish. Reply only when every dish is done.';

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

/**
 * Drops raw_text from measured lines, so the service builds it from the fields. Agents' text there
 * is hidden in the app and drifts from the amounts; the checks have already read it for lost prep.
 */
function fromFields<T extends { ingredients?: { quantity?: number | null; raw_text?: string }[] }>(version: T): T {
  if (!version.ingredients) return version;
  return {
    ...version,
    ingredients: version.ingredients.map((l) => (l.quantity == null ? l : { ...l, raw_text: undefined })),
  };
}

/** The meals a version is cooked for, so the server can check it against their targets. */
const ForMeals = z
  .array(z.object({ slot: Slot, person_ids: z.array(id).optional().describe('Defaults to everyone') }))
  .min(1)
  .optional()
  .describe(
    'The meals this version is cooked for, e.g. [{"slot":"dinner"},{"slot":"lunch","person_ids":["<id>"]}] for dinner for everyone plus one lunch. The server checks its kcal and protein against their targets. Leave out for the source\'s own batch or a batch size the user fixed.',
  );

export function buildMcpServer(user: AuthUser): McpServer {
  const u = user.id;
  const server = new McpServer({ name: 'feedr', version: '0.1.0' }, { instructions: INSTRUCTIONS });
  const readOnly = { readOnlyHint: true };

  /** What the checks need from the account: known ingredient names, and the targets of the given meals. */
  async function checkContext(meals?: z.infer<typeof ForMeals>) {
    const knownNames = (await svc.listIngredients(u)).map((i) => i.name);
    if (!meals) return { knownNames };
    const targets = await Promise.all(meals.map((m) => svc.slotTargets(u, m.slot, m.person_ids)));
    const portions = targets.flatMap((t) =>
      t.people.map((p) => ({ name: `${p.name} (${t.slot})`, kcal: p.kcal, protein_g: p.protein_g })),
    );
    return {
      knownNames,
      mealTargets: { kcal: Math.round(portions.reduce((sum, p) => sum + p.kcal, 0)), portions },
    };
  }

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
      description:
        'A recipe with every version in full: ingredients, steps and whole-batch nutrition. Use it to check a dish once all its versions are saved, then go on to the next dish.',
      inputSchema: { recipe_id: id },
      annotations: readOnly,
    },
    ({ recipe_id }) => run(() => svc.getRecipe(u, recipe_id)),
  );
  server.registerTool(
    'create_recipe',
    {
      description: RECIPE_GUIDE,
      inputSchema: {
        ...RecipeCreate.shape,
        original: RecipeCreate.shape.original.extend({ for_meals: ForMeals }),
        for_meals: ForMeals,
      },
    },
    ({ for_meals: topMeals, ...input }) =>
      run(async () => {
        // Small models also put it inside original; take it from either place.
        const { for_meals: nestedMeals, ...original } = input.original as typeof input.original & {
          for_meals?: z.infer<typeof ForMeals>;
        };
        if (topMeals && nestedMeals) {
          throw new svc.InvalidError('for_meals is given twice. Send it once, beside original.');
        }
        const for_meals = topMeals ?? nestedMeals;
        input = { ...input, original };
        const check = checkVersion(input.original, { isNew: true, ...(await checkContext(for_meals)) });
        return saveChecked([checkRecipe(input), check], async () =>
          written(await svc.createRecipe(u, { ...input, original: fromFields(input.original) }), NEXT_AFTER_WRITE),
        );
      }),
  );
  server.registerTool(
    'update_recipe',
    {
      description: 'Update recipe details (title, description, source, tags, image). Versions are edited separately.',
      inputSchema: { recipe_id: id, ...RecipeUpdate.shape },
    },
    ({ recipe_id, ...input }) =>
      run(() =>
        saveChecked([checkRecipe(input)], async () =>
          written(await svc.updateRecipe(u, recipe_id, input), NEXT_AFTER_WRITE),
        ),
      ),
  );
  server.registerTool(
    'archive_recipe',
    { description: 'Hide a recipe from lists. Planned services keep working.', inputSchema: { recipe_id: id } },
    ({ recipe_id }) => run(() => svc.archiveRecipe(u, recipe_id)),
  );
  server.registerTool(
    'delete_recipe',
    {
      description:
        'Delete a recipe and all its versions for good. Refused while a planned service uses it; archive_recipe hides a recipe instead.',
      inputSchema: { recipe_id: id },
    },
    ({ recipe_id }) => run(() => svc.deleteRecipe(u, recipe_id)),
  );
  server.registerTool(
    'create_recipe_version',
    {
      description:
        'Add an alternative version, written by create_recipe\'s rules. Fields go at the top level, with no "original" wrapper: recipe_id, based_on_version_id (one of the recipe\'s versions[].id), and complete ingredients, each with its nutrition estimate (or published figures as nutrition, source from_source), and steps. Rewrite every mention of what changed, including amounts in step text.',
      inputSchema: { recipe_id: id, ...VersionInput.shape, for_meals: ForMeals },
    },
    ({ recipe_id, for_meals, ...input }) =>
      run(async () => {
        const base = input.based_on_version_id
          ? await svc.getVersion(u, input.based_on_version_id).catch(() => undefined)
          : undefined;
        const baseNames = base?.ingredients.map((l) => l.ingredient);
        const check = checkVersion(input, {
          isNew: true,
          baseNames,
          baseLabel: base?.label,
          ...(await checkContext(for_meals)),
        });
        return saveChecked([check], async () => {
          const created = await svc.createVersion(u, recipe_id, fromFields(input));
          return { version_id: created.id, ...written(await svc.getRecipe(u, recipe_id), NEXT_AFTER_WRITE) };
        });
      }),
  );
  server.registerTool(
    'update_recipe_version',
    {
      description:
        "Edit a version by version_id, by create_recipe's rules. Ingredients, steps or nutrition given replace that part entirely. Send steps with replaced ingredients (links point at lines), and give replaced ingredients their nutrition estimates again, or published figures as nutrition (source from_source).",
      inputSchema: { version_id: id, ...VersionInput.partial().shape, for_meals: ForMeals },
    },
    ({ version_id, for_meals, ...input }) =>
      run(async () => {
        const version = await svc.getVersion(u, version_id);
        const stored = storedVersion(version);
        if (input.ingredients && !input.steps && stored.steps?.length) {
          throw new svc.InvalidError("Replacing ingredients drops the steps' links to them. Send the steps too.");
        }
        // Checks only what the edit changes. Ingredients and steps are checked together, as they'll be stored.
        const changed = {
          label: input.label ?? version.label,
          ...(input.notes !== undefined && { notes: input.notes }),
          ...((input.ingredients || input.steps) && {
            ingredients: input.ingredients ?? stored.ingredients,
            steps: input.steps ?? stored.steps,
          }),
          ...(input.nutrition && { nutrition: input.nutrition }),
        };
        const base = version.based_on_version_id
          ? await svc.getVersion(u, version.based_on_version_id).catch(() => undefined)
          : undefined;
        const check = checkVersion(changed, {
          newIngredients: !!input.ingredients,
          baseNames: base?.ingredients.map((l) => l.ingredient),
          baseLabel: base?.label,
          // Targets are checked when the batch nutrition changes: new lines, or new published figures.
          ...((input.ingredients || input.nutrition) && (await checkContext(for_meals))),
        });
        return saveChecked([check], async () => {
          await svc.updateVersion(u, version_id, fromFields(input));
          return { version_id, ...written(await svc.getRecipe(u, version.recipe_id), NEXT_AFTER_WRITE) };
        });
      }),
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
