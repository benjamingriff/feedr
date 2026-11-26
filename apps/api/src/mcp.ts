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
import { checkRecipe, checkVersion, saveChecked, storedVersion } from './recipe-check.ts';

const INSTRUCTIONS = `feedr stores recipes, plans meals and portions cooked dishes for a household.

Model:
- A recipe has one or more versions. Each version is a complete, cookable recipe: its own ingredients, steps and WHOLE-BATCH nutrition.
- The original version is the recipe as this household cooks it: the source's recipe with the changes the user always makes (their own method, equipment they don't have). Each real alternative is a version of its own: a different main ingredient (a veggie and a meat version), a different batch size, or a version built to meet calorie or protein targets.
- Scaling is your job, not the server's. To cook a different amount, create a new version with sensible amounts: round whole items (eggs, tins) to whole numbers, don't scale spices, salt or aromatics linearly, and adjust pan sizes and cook times in the steps. Reuse an existing version when it's close enough.
- Nutrition is for the whole batch the version makes, not per serving. You estimate each ingredient line; the server adds them up.
- A service is one version cooked on a date. Its portions say who eats it, when (date + slot: breakfast, lunch, dinner, snack) and how much. The server splits the dish by calorie target: each portion's share = its target_kcal / the sum of all portion targets. Leftovers are extra portions, e.g. tomorrow's lunch.

Writing a recipe: read create_recipe's description before you write one. Everything in a recipe is read by the cook in the app; your reasoning and notes belong in your reply to the user. When you write a version for people's targets, size it to their total and tell the user how it compares. After saving, read each recipe back with get_recipe and reply with each version as "Label: N ingredients, M steps", how it compares with any targets, and the substitutions and assumptions you made.

Planning a meal:
1. get_slot_targets for the slot and people to see the calories (and protein) the meal should provide.
2. Pick a version near the total, or create one with create_recipe_version.
3. plan_service with the version and one portion per person per meal. The result includes each portion's nutrition and a dish-up guide.
4. get_plan to check each person's day totals against their targets.

Treats live in the cookbook and aren't part of the meal plan yet: don't plan a recipe tagged treat unless the user asks you to.

Shopping: get_shopping_list combines the ingredients of every service cooked in a date range (or of given versions) by ingredient and aisle. It is read-only.

Ingredients: call list_ingredients first and reuse existing names exactly (spelling variants like yogurt/yoghurt create duplicates and split the shopping list). Give every new ingredient you buy an aisle: an existing one, or one of Produce, Meat & fish, Dairy, Bakery, Baking, Spices, Tins & jars, Rice & pasta, Oils & sauces, Frozen. An ingredient's name and aisle are fixed when it's first created, so get them right first time; water needs no aisle. Use metric units everywhere, step text included.`;

/**
 * How to write a recipe for the app. It is create_recipe's description, because every client shows
 * tool descriptions but some drop the server instructions. The version tools point back to it.
 */
const RECIPE_GUIDE = `Create a recipe and its original version in one call. Add each alternative afterwards with create_recipe_version.

Write it like a page in a good recipe app. The cook reads every field in the app while cooking, so write only what helps them cook. Your reasoning, what you changed from the source and why, caveats about your figures, portion splits, storage, allergens and tips nobody asked for go in your reply to the user, never in the recipe. Never mention agents, notes, sources' footnotes or "this version" in the text.

The server checks each version (links, sections, timers, nutrition, lengths). It refuses one that breaks a rule, listing what to fix by step number and opening words: fix every item without dropping any cooking instruction, and send it again. Keep going until it saves. Likely problems come back as warnings with the saved recipe: fix any that are real with update_recipe_version.

The recipe (every version shares these):
- title: the dish's name, true of every version: "Katsu curry" when there's a chicken and a pumpkin version. No options or brackets.
- description: one or two sentences on what the dish is and what it's like to eat, true of every version. No method, history or links.
- source_url and source_name: the page it came from and the site's name, e.g. "Wagamama". The app shows "Adapted from <source_name>".
- tags: the meal type, one or more of breakfast, lunch, dinner or treat (sweet things that are nice rather than good for you, like cakes and weekend bakes). Add other tags only when true of every version.

Versions:
- The original is the source's recipe, at the source's yield, with the changes the user always makes (their method, equipment they don't have, substitutions). Otherwise keep the source's ingredients and amounts. When equipment changes, adapt the technique to the tool: say which vessel to use and any prep it needs (e.g. chop dried chillies by hand, then blend in a tall jug).
- One version per alternative: another main, another batch size, a version for targets. Never put two mains in one version as optional ingredients or "or" steps. Label each version by what makes it different, e.g. "Pumpkin", "Chicken", "For three", "High protein". The original is "Original" or its main (e.g. "Beef"), never a method or piece of equipment.
- servings: how many even portions the batch makes. Don't write who eats how much: plan_service splits the dish by each person's calorie target.
- When the user says who eats it (e.g. dinner for two plus a lunch) or asks for calorie or protein targets, call get_slot_targets for those people and meals. First size it: scale every line together so the batch's kcal is within about 10% of their total, set servings to the portions it's for, keep sides at normal portions (about 75g dry rice a person) and keep tins and eggs whole. Then, for protein targets, move some of that budget to the main: more of the main, a little less of the sides and fat, keeping the dish recognisable, until it gives at least the targets' total protein. Don't swap the main or its cut unless the user asks. Tell the user how each version compares, and where calories and protein can't both be met.
- If a version changes the main or its cut, recheck the method, time and doneness cue for it, label it by the main (e.g. "Chicken"), and update the title and description with update_recipe if they no longer fit every version.

Ingredients. The app shows each line as its amount, its name, then its preparation underneath; raw_text appears only when there's no quantity.
- One line per thing the cook buys or measures, in the order the steps first use them. Sides served with it (rice, salad) are lines too, with amounts. Reserved liquid or the rest of a line aren't new lines: link the original line again. Water to cover, top up or loosen, with no measure, needs no line.
- ingredient: the plain name, e.g. "chicken breast".
- quantity and unit as a cook measures it: g or ml for most things, tsp or tbsp for spices and small amounts, a count for whole items (2 eggs, 1 onion). Give a quantity whenever there's a number. Pieces measured by length, like ginger, go in g.
- preparation: the prep the cook must do, in a few words, e.g. "cut into 4cm cubes". It must agree with raw_text and the steps.
- raw_text: the line as it reads in this version, e.g. "1 onion, finely chopped". With no quantity it fills the amount column, so keep it to the amount, e.g. "To taste".
- optional: true for garnishes and extras. Don't write "optional" in the text.
- nutrition: your estimate for the line's amount, as bought (rice and pasta dry): kcal, protein_g, carbs_g, fat_g, with kcal close to 4 x protein + 4 x carbs + 9 x fat. 0 for water and salt. The server adds the lines up for the batch, so leave the version's nutrition out. Send version nutrition only to copy a source's published figures for its unchanged recipe (source from_source, per-serving figures times its yield).
- No notes, brands, conversions or alternatives in any of these.
- section: only when the recipe has separate parts, e.g. a sauce and a coating. Then give every line one, keep each section's lines together, and order sections by when they're first cooked. Short headings like "Sauce", "Coating", "To serve". An ingredient measured separately for two parts gets a line in each.

Steps:
- One step per stage of cooking, in the order the cook works: what goes in the pan or on the board at that point, and with what (pan, oven, air fryer, steamer). Usually one to three short sentences. Start sides like rice in the step where the cook would put them on, so everything is ready together. Say what to do, about how long, and how to tell it's done. No tips, explanations or warnings beyond what's needed to cook it right, and never why a step differs from the source (no "since" or "because").
- ingredients: link every line the step adds or handles, including the main whenever the step cooks it, and nothing else. Once lines are combined into a paste or sauce, later steps name the paste or sauce and don't link its lines again. Format: [{ line }], where line is the index into this version's ingredients, starting at 0. When a step uses part of a line, add its quantity: { line: 3, quantity: 4 } for "Add 4 garlic cloves" when the line has 6.
- Name each linked ingredient in the text as it's named on its line, so the app can mark it ("beef chuck", not just "beef", when there's also beef stock). You needn't repeat amounts or prep.
- timer_seconds: only on a step with one wait the cook times (simmering, baking, resting, air-frying), set to the time until the cook's next action. A step's text gives one time; when another wait follows, start a new step. For "air-fry 14 minutes, turning halfway", make two steps of 7 minutes, the second starting with the turn. For a range, time the shortest. No timer on hands-on work like chopping, coating, browning or toasting, or when the packet sets the time.
- Set prep_minutes and cook_minutes on the version.

notes: usually empty. Only one short line the cook must know before starting when the version is out of the ordinary, e.g. "High protein: twice the usual chicken." Never a tip, a comparison with another version, or what you changed or why (not "Chicken replaces the beef").

When you've finished, read each recipe back with get_recipe after your last change, and check every version on its own: its steps name only its own ingredients; the main, method and timers are right throughout; and the shared title and description are true of it. Fix anything wrong. Then reply to the user, for each version: "Label: N ingredients, M steps" from the read-back; how it compares with any targets; and the substitutions, assumptions and amounts you chose. Don't explain these rules to them.`;

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
      description:
        'A recipe with every version in full: ingredients, steps and whole-batch nutrition. After writing a recipe, report each version to the user as "Label: N ingredients, M steps" from this result.',
      inputSchema: { recipe_id: id },
      annotations: readOnly,
    },
    ({ recipe_id }) => run(() => svc.getRecipe(u, recipe_id)),
  );
  server.registerTool(
    'create_recipe',
    {
      description: RECIPE_GUIDE,
      inputSchema: RecipeCreate.shape,
    },
    (input) =>
      run(() => saveChecked([checkRecipe(input), checkVersion(input.original)], () => svc.createRecipe(u, input))),
  );
  server.registerTool(
    'update_recipe',
    {
      description: 'Update recipe details (title, description, source, tags, image). Versions are edited separately.',
      inputSchema: { recipe_id: id, ...RecipeUpdate.shape },
    },
    ({ recipe_id, ...input }) =>
      run(() => saveChecked([checkRecipe(input)], () => svc.updateRecipe(u, recipe_id, input))),
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
        'Add an alternative version, written by the same rules as create_recipe (read its description first). Send the version fields at the top level, not inside "original": recipe_id from the recipe, based_on_version_id from its versions[].id, and complete ingredients (each with its nutrition estimate, unless you send published figures) and steps. When you start from another version, rewrite every mention of what changed: the main, stock, method, steps and timers. Scale with judgement: whole eggs, spices that do not scale linearly, adjusted times.',
      inputSchema: { recipe_id: id, ...VersionInput.shape },
    },
    ({ recipe_id, ...input }) =>
      run(async () => {
        const base = input.based_on_version_id
          ? await svc.getVersion(u, input.based_on_version_id).catch(() => undefined)
          : undefined;
        const baseNames = base?.ingredients.map((l) => l.ingredient);
        return saveChecked([checkVersion(input, { baseNames })], () => svc.createVersion(u, recipe_id, input));
      }),
  );
  server.registerTool(
    'update_recipe_version',
    {
      description:
        'Edit the version with this version_id, by the same rules as create_recipe. Any of ingredients, steps or nutrition given replaces that part entirely. Step ingredient links point at ingredient lines, so when you replace ingredients, send steps too to keep the links. Replaced ingredients need their nutrition estimates again, which the server adds up, unless you resend published figures as nutrition (source from_source).',
      inputSchema: { version_id: id, ...VersionInput.partial().shape },
    },
    ({ version_id, ...input }) =>
      run(async () => {
        const version = await svc.getVersion(u, version_id);
        const stored = storedVersion(version);
        if (input.ingredients && !input.steps && stored.steps?.length) {
          throw new svc.InvalidError("Replacing ingredients drops the steps' links to them. Send the steps too.");
        }
        // Checks only what the edit changes. Ingredients and steps are checked together, as they'll be stored.
        const changed = {
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
        });
        return saveChecked([check], () => svc.updateVersion(u, version_id, input));
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
