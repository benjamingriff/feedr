import { sql, type Selectable, type Transaction } from 'kysely';
import {
  DEFAULT_SLOT_SPLIT,
  NUTRIENT_KEYS,
  SLOTS,
  addNutrition,
  aggregateShopping,
  dishUpGuide,
  emptyTotals,
  scaleNutrition,
  sharesFromTargets,
  slotTarget,
  type IngredientLine,
  type NutritionInput,
  type NutritionTotals,
  type Person,
  type Plan,
  type PlanDay,
  type Portion,
  type PortionInput,
  type Recipe,
  type RecipeCreate,
  type RecipeSummary,
  type RecipeVersion,
  type Service,
  type ServiceCreate,
  type ShoppingList,
  type Slot,
  type VersionInput,
} from '@feedr/core';
import type { z } from 'zod';
import type { PersonInput, PersonUpdate, PortionUpdate, RecipeUpdate, ServiceUpdate } from '@feedr/core';
import { db, type DB } from './db.ts';

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
  }
}
export class InvalidError extends Error {}

type Db = typeof db | Transaction<DB>;

/* ---------------------------------- People --------------------------------- */

function toPerson(row: Selectable<DB['people']>): Person {
  return {
    id: row.id,
    name: row.name,
    weight_kg: row.weight_kg,
    daily_kcal: row.daily_kcal,
    daily_protein_g: row.daily_protein_g,
    slot_split: row.slot_split,
  };
}

export async function listPeople(userId: string): Promise<Person[]> {
  const rows = await db
    .selectFrom('people')
    .selectAll()
    .where('user_id', '=', userId)
    .where('archived_at', 'is', null)
    .orderBy('created_at')
    .execute();
  return rows.map(toPerson);
}

export async function createPerson(userId: string, input: z.infer<typeof PersonInput>): Promise<Person> {
  const row = await db
    .insertInto('people')
    .values({
      user_id: userId,
      name: input.name,
      weight_kg: input.weight_kg ?? null,
      daily_kcal: input.daily_kcal,
      daily_protein_g: input.daily_protein_g ?? null,
      slot_split: JSON.stringify(input.slot_split ?? DEFAULT_SLOT_SPLIT),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return toPerson(row);
}

export async function updatePerson(userId: string, id: string, input: z.infer<typeof PersonUpdate>): Promise<Person> {
  const row = await db
    .updateTable('people')
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.weight_kg !== undefined && { weight_kg: input.weight_kg }),
      ...(input.daily_kcal !== undefined && { daily_kcal: input.daily_kcal }),
      ...(input.daily_protein_g !== undefined && { daily_protein_g: input.daily_protein_g }),
      ...(input.slot_split !== undefined && { slot_split: JSON.stringify(input.slot_split) }),
    })
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .returningAll()
    .executeTakeFirst();
  if (!row) throw new NotFoundError('Person');
  return toPerson(row);
}

export async function archivePerson(userId: string, id: string): Promise<void> {
  const res = await db
    .updateTable('people')
    .set({ archived_at: new Date() })
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!res.numUpdatedRows) throw new NotFoundError('Person');
}

/** Each person's calorie and protein target for a meal slot. */
export async function slotTargets(userId: string, slot: Slot, personIds?: string[]) {
  const people = (await listPeople(userId)).filter((p) => !personIds?.length || personIds.includes(p.id));
  if (personIds?.length && people.length !== personIds.length) throw new NotFoundError('Person');
  const targets = people.map((p) => ({ person_id: p.id, name: p.name, ...slotTarget(p, slot) }));
  return {
    slot,
    people: targets,
    total_kcal: targets.reduce((s, t) => s + t.kcal, 0),
    total_protein_g: targets.every((t) => t.protein_g != null)
      ? targets.reduce((s, t) => s + (t.protein_g ?? 0), 0)
      : null,
  };
}

/* -------------------------------- Ingredients ------------------------------- */

export async function listIngredients(userId: string, q?: string) {
  let query = db
    .selectFrom('ingredients')
    .select(['id', 'name', 'aisle'])
    .where('user_id', '=', userId)
    .orderBy('name');
  if (q) query = query.where('name', 'ilike', `%${q}%`);
  return query.execute();
}

async function upsertIngredient(trx: Db, userId: string, name: string, aisle: string | null | undefined) {
  const { rows } = await sql<{ id: string }>`
    INSERT INTO ingredients (user_id, name, aisle) VALUES (${userId}, ${name.trim()}, ${aisle ?? null})
    ON CONFLICT (user_id, lower(name)) DO UPDATE SET aisle = COALESCE(ingredients.aisle, EXCLUDED.aisle)
    RETURNING id`.execute(trx);
  return rows[0]!.id;
}

/* ---------------------------------- Recipes --------------------------------- */

async function ownedRecipe(trx: Db, userId: string, recipeId: string) {
  const recipe = await trx
    .selectFrom('recipes')
    .selectAll()
    .where('id', '=', recipeId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!recipe) throw new NotFoundError('Recipe');
  return recipe;
}

async function ownedVersion(trx: Db, userId: string, versionId: string) {
  const version = await trx
    .selectFrom('recipe_versions as v')
    .innerJoin('recipes as r', 'r.id', 'v.recipe_id')
    .select(['v.id', 'v.recipe_id'])
    .where('v.id', '=', versionId)
    .where('r.user_id', '=', userId)
    .executeTakeFirst();
  if (!version) throw new NotFoundError('Version');
  return version;
}

async function loadVersions(trx: Db, versionIds: string[]): Promise<Map<string, RecipeVersion>> {
  const out = new Map<string, RecipeVersion>();
  if (!versionIds.length) return out;
  const [versions, ingredients, steps, stepIngredients, nutrition] = await Promise.all([
    trx.selectFrom('recipe_versions').selectAll().where('id', 'in', versionIds).execute(),
    trx
      .selectFrom('recipe_ingredients as ri')
      .innerJoin('ingredients as i', 'i.id', 'ri.ingredient_id')
      .selectAll('ri')
      .select(['i.name as ingredient', 'i.aisle'])
      .where('ri.version_id', 'in', versionIds)
      .orderBy('ri.position')
      .execute(),
    trx.selectFrom('recipe_steps').selectAll().where('version_id', 'in', versionIds).orderBy('position').execute(),
    trx
      .selectFrom('step_ingredients as si')
      .innerJoin('recipe_ingredients as ri', 'ri.id', 'si.ingredient_line_id')
      .select(['si.step_id', 'si.ingredient_line_id as line_id', 'si.quantity', 'si.unit'])
      .where('ri.version_id', 'in', versionIds)
      .orderBy('ri.position')
      .execute(),
    trx.selectFrom('nutrition').selectAll().where('version_id', 'in', versionIds).execute(),
  ]);
  for (const v of versions) {
    const n = nutrition.find((x) => x.version_id === v.id);
    out.set(v.id, {
      id: v.id,
      recipe_id: v.recipe_id,
      label: v.label,
      servings: v.servings,
      notes: v.notes,
      is_original: v.is_original,
      based_on_version_id: v.based_on_version_id,
      prep_minutes: v.prep_minutes,
      cook_minutes: v.cook_minutes,
      created_at: v.created_at.toISOString(),
      nutrition: n
        ? {
            kcal: n.kcal,
            protein_g: n.protein_g,
            carbs_g: n.carbs_g,
            fat_g: n.fat_g,
            saturated_fat_g: n.saturated_fat_g,
            fibre_g: n.fibre_g,
            sugar_g: n.sugar_g,
            salt_g: n.salt_g,
            extra: n.extra,
            source: n.source,
            notes: n.notes,
          }
        : null,
      ingredients: ingredients
        .filter((i) => i.version_id === v.id)
        .map((i): IngredientLine => ({
          id: i.id,
          ingredient_id: i.ingredient_id,
          ingredient: i.ingredient,
          aisle: i.aisle,
          quantity: i.quantity,
          unit: i.unit,
          raw_text: i.raw_text,
          preparation: i.preparation,
          section: i.section,
          optional: i.optional,
        })),
      steps: steps
        .filter((s) => s.version_id === v.id)
        .map((s) => ({
          id: s.id,
          position: s.position,
          text: s.text,
          section: s.section,
          timer_seconds: s.timer_seconds,
          ingredients: stepIngredients
            .filter((i) => i.step_id === s.id)
            .map(({ line_id, quantity, unit }) => ({ line_id, quantity, unit })),
        })),
    });
  }
  return out;
}

async function writeVersionContents(
  trx: Db,
  userId: string,
  versionId: string,
  input: Partial<Pick<VersionInput, 'ingredients' | 'steps' | 'nutrition'>>,
) {
  if (input.ingredients) {
    await trx.deleteFrom('recipe_ingredients').where('version_id', '=', versionId).execute();
    let position = 0;
    for (const line of input.ingredients) {
      const ingredientId = await upsertIngredient(trx, userId, line.ingredient, line.aisle);
      await trx
        .insertInto('recipe_ingredients')
        .values({
          version_id: versionId,
          position: position++,
          ingredient_id: ingredientId,
          quantity: line.quantity ?? null,
          unit: line.unit ?? null,
          raw_text: lineText(line),
          preparation: line.preparation ?? null,
          section: line.section ?? null,
          optional: line.optional ?? false,
        })
        .execute();
    }
  }
  if (input.steps) {
    await trx.deleteFrom('recipe_steps').where('version_id', '=', versionId).execute();
    if (input.steps.length) {
      const stepRows = await trx
        .insertInto('recipe_steps')
        .values(
          input.steps.map((s, i) => ({
            version_id: versionId,
            position: i,
            text: s.text,
            section: s.section ?? null,
            timer_seconds: s.timer_seconds ?? null,
          })),
        )
        .returning(['id', 'position'])
        .execute();
      await writeStepIngredients(trx, versionId, input.steps, stepRows);
    }
  }
  const nutrition = input.nutrition ?? (input.ingredients && lineTotals(input.ingredients));
  // New ingredients without figures would leave the old batch nutrition describing other amounts.
  if (input.ingredients && !nutrition) {
    throw new InvalidError('Give nutrition, or a nutrition estimate on every ingredient line');
  }
  if (nutrition) await writeNutrition(trx, versionId, nutrition);
}

/**
 * The line as text. The app shows it only when there's no quantity, so a measured line's text is
 * built from its fields and can't disagree with them.
 */
function lineText(line: VersionInput['ingredients'][number]): string {
  if (line.quantity == null) return line.raw_text ?? line.ingredient;
  const amount = `${line.quantity}${line.unit ? ` ${line.unit}` : ''}`;
  return `${amount} ${line.ingredient}${line.preparation ? `, ${line.preparation}` : ''}`;
}

/** The batch nutrition from per-line estimates, or undefined unless every line has one. */
function lineTotals(lines: VersionInput['ingredients']): NutritionInput | undefined {
  if (!lines.length || !lines.every((l) => l.nutrition)) return undefined;
  const sum = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g') =>
    Math.round(lines.reduce((total, l) => total + l.nutrition![k], 0) * 10) / 10;
  return {
    kcal: Math.round(sum('kcal')),
    protein_g: sum('protein_g'),
    carbs_g: sum('carbs_g'),
    fat_g: sum('fat_g'),
    source: 'agent_estimate',
  };
}

/** Links steps to the version's ingredient lines. `line` is an index into the lines as they are stored now. */
async function writeStepIngredients(
  trx: Db,
  versionId: string,
  steps: VersionInput['steps'],
  stepRows: { id: string; position: number }[],
) {
  if (!steps.some((s) => s.ingredients?.length)) return;
  const lines = await trx
    .selectFrom('recipe_ingredients')
    .select('id')
    .where('version_id', '=', versionId)
    .orderBy('position')
    .execute();
  const links = steps.flatMap((step, position) => {
    const stepId = stepRows.find((r) => r.position === position)!.id;
    // Keyed by line, so naming a line twice in one step keeps the last amount.
    const byLine = new Map<
      string,
      { step_id: string; ingredient_line_id: string; quantity: number | null; unit: string | null }
    >();
    for (const link of step.ingredients ?? []) {
      const line = lines[link.line];
      if (!line)
        throw new InvalidError(
          `Step ${position + 1} links ingredient ${link.line}, but there are ${lines.length} ingredients`,
        );
      byLine.set(line.id, {
        step_id: stepId,
        ingredient_line_id: line.id,
        quantity: link.quantity ?? null,
        unit: link.unit ?? null,
      });
    }
    return [...byLine.values()];
  });
  await trx.insertInto('step_ingredients').values(links).execute();
}

async function writeNutrition(trx: Db, versionId: string, n: NutritionInput) {
  const values = {
    kcal: n.kcal,
    protein_g: n.protein_g,
    carbs_g: n.carbs_g,
    fat_g: n.fat_g,
    saturated_fat_g: n.saturated_fat_g ?? null,
    fibre_g: n.fibre_g ?? null,
    sugar_g: n.sugar_g ?? null,
    salt_g: n.salt_g ?? null,
    extra: JSON.stringify(n.extra ?? {}),
    source: n.source,
    notes: n.notes ?? null,
  };
  await trx
    .insertInto('nutrition')
    .values({ version_id: versionId, ...values })
    .onConflict((oc) => oc.column('version_id').doUpdateSet(values))
    .execute();
}

async function insertVersion(
  trx: Db,
  userId: string,
  recipeId: string,
  input: VersionInput,
  isOriginal: boolean,
): Promise<string> {
  if (input.based_on_version_id) {
    const base = await trx
      .selectFrom('recipe_versions')
      .select('id')
      .where('id', '=', input.based_on_version_id)
      .where('recipe_id', '=', recipeId)
      .executeTakeFirst();
    if (!base) {
      const versions = await trx
        .selectFrom('recipe_versions')
        .select(['id', 'label'])
        .where('recipe_id', '=', recipeId)
        .execute();
      throw new InvalidError(
        versions.length
          ? `based_on_version_id isn't a version of this recipe. Use one of: ${versions.map((v) => `${v.id} (${v.label})`).join(', ')}`
          : 'Leave based_on_version_id out of the original version.',
      );
    }
  }
  const { id } = await trx
    .insertInto('recipe_versions')
    .values({
      recipe_id: recipeId,
      label: input.label,
      servings: input.servings,
      notes: input.notes ?? null,
      is_original: isOriginal,
      based_on_version_id: input.based_on_version_id ?? null,
      prep_minutes: input.prep_minutes ?? null,
      cook_minutes: input.cook_minutes ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await writeVersionContents(trx, userId, id, input);
  await trx.updateTable('recipes').set({ updated_at: new Date() }).where('id', '=', recipeId).execute();
  return id;
}

function recipeFields(r: Selectable<DB['recipes']>) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    kind: r.kind,
    tags: r.tags,
    image_url: r.image_url,
    source_url: r.source_url,
    source_name: r.source_name,
    updated_at: r.updated_at.toISOString(),
  };
}

export async function searchRecipes(
  userId: string,
  opts: { q?: string; tag?: string; include_archived?: boolean } = {},
): Promise<RecipeSummary[]> {
  let query = db.selectFrom('recipes').selectAll().where('user_id', '=', userId).orderBy('updated_at', 'desc');
  if (!opts.include_archived) query = query.where('archived_at', 'is', null);
  if (opts.q) {
    const q = `%${opts.q}%`;
    query = query.where((eb) =>
      eb.or([eb('title', 'ilike', q), eb('description', 'ilike', q), eb(sql`array_to_string(tags, ' ')`, 'ilike', q)]),
    );
  }
  if (opts.tag) query = query.where(sql<boolean>`${opts.tag} = ANY(tags)`);
  const recipes = await query.execute();
  if (!recipes.length) return [];
  const versions = await db
    .selectFrom('recipe_versions as v')
    .leftJoin('nutrition as n', 'n.version_id', 'v.id')
    .select([
      'v.id',
      'v.recipe_id',
      'v.label',
      'v.servings',
      'v.is_original',
      'v.prep_minutes',
      'v.cook_minutes',
      'n.kcal',
    ])
    .where(
      'v.recipe_id',
      'in',
      recipes.map((r) => r.id),
    )
    .orderBy('v.is_original', 'desc')
    .orderBy('v.created_at')
    .execute();
  return recipes.map((r) => ({
    ...recipeFields(r),
    versions: versions.filter((v) => v.recipe_id === r.id).map(({ recipe_id: _, ...v }) => v),
  }));
}

export async function getRecipe(userId: string, recipeId: string, trx: Db = db): Promise<Recipe> {
  const recipe = await ownedRecipe(trx, userId, recipeId);
  const ids = (
    await trx
      .selectFrom('recipe_versions')
      .select('id')
      .where('recipe_id', '=', recipeId)
      .orderBy('is_original', 'desc')
      .orderBy('created_at')
      .execute()
  ).map((v) => v.id);
  const versions = await loadVersions(trx, ids);
  return { ...recipeFields(recipe), versions: ids.map((id) => versions.get(id)!) };
}

export async function getVersion(userId: string, versionId: string): Promise<RecipeVersion> {
  await ownedVersion(db, userId, versionId);
  return (await loadVersions(db, [versionId])).get(versionId)!;
}

export async function createRecipe(userId: string, input: RecipeCreate): Promise<Recipe> {
  return db.transaction().execute(async (trx) => {
    const { id } = await trx
      .insertInto('recipes')
      .values({
        user_id: userId,
        title: input.title,
        description: input.description ?? null,
        source_url: input.source_url ?? null,
        source_name: input.source_name ?? null,
        kind: input.kind ?? 'full',
        tags: input.tags ?? [],
        image_url: input.image_url ?? null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await insertVersion(trx, userId, id, { ...input.original, label: input.original.label ?? 'Original' }, true);
    return getRecipe(userId, id, trx);
  });
}

export async function updateRecipe(
  userId: string,
  recipeId: string,
  input: z.infer<typeof RecipeUpdate>,
): Promise<Recipe> {
  await ownedRecipe(db, userId, recipeId);
  await db
    .updateTable('recipes')
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.source_url !== undefined && { source_url: input.source_url }),
      ...(input.source_name !== undefined && { source_name: input.source_name }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.image_url !== undefined && { image_url: input.image_url }),
      updated_at: new Date(),
    })
    .where('id', '=', recipeId)
    .execute();
  return getRecipe(userId, recipeId);
}

export async function archiveRecipe(userId: string, recipeId: string): Promise<void> {
  await ownedRecipe(db, userId, recipeId);
  await db.updateTable('recipes').set({ archived_at: new Date() }).where('id', '=', recipeId).execute();
}

/** Deletes a recipe and its versions. Refused while a service uses one of them, since deleting would cascade to it. */
export async function deleteRecipe(userId: string, recipeId: string): Promise<void> {
  await ownedRecipe(db, userId, recipeId);
  const used = await db
    .selectFrom('services')
    .innerJoin('recipe_versions as v', 'v.id', 'services.version_id')
    .select('services.id')
    .where('v.recipe_id', '=', recipeId)
    .executeTakeFirst();
  if (used)
    throw new InvalidError('A planned service uses this recipe. Remove the service first, or archive the recipe.');
  await db.deleteFrom('recipes').where('id', '=', recipeId).execute();
}

export async function createVersion(userId: string, recipeId: string, input: VersionInput): Promise<RecipeVersion> {
  return db.transaction().execute(async (trx) => {
    await ownedRecipe(trx, userId, recipeId);
    const id = await insertVersion(trx, userId, recipeId, input, false);
    return (await loadVersions(trx, [id])).get(id)!;
  });
}

/**
 * Replaces whichever parts are given. Ingredients and steps are replaced as whole lists.
 * Step links point at ingredient lines, so replacing ingredients without steps drops the links.
 */
export async function updateVersion(
  userId: string,
  versionId: string,
  input: Partial<VersionInput>,
): Promise<RecipeVersion> {
  return db.transaction().execute(async (trx) => {
    const { recipe_id } = await ownedVersion(trx, userId, versionId);
    const fields = {
      ...(input.label !== undefined && { label: input.label }),
      ...(input.servings !== undefined && { servings: input.servings }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.prep_minutes !== undefined && { prep_minutes: input.prep_minutes }),
      ...(input.cook_minutes !== undefined && { cook_minutes: input.cook_minutes }),
    };
    if (Object.keys(fields).length) {
      await trx.updateTable('recipe_versions').set(fields).where('id', '=', versionId).execute();
    }
    await writeVersionContents(trx, userId, versionId, input);
    await trx.updateTable('recipes').set({ updated_at: new Date() }).where('id', '=', recipe_id).execute();
    return (await loadVersions(trx, [versionId])).get(versionId)!;
  });
}

export async function deleteVersion(userId: string, versionId: string): Promise<void> {
  const { recipe_id } = await ownedVersion(db, userId, versionId);
  const used = await db.selectFrom('services').select('id').where('version_id', '=', versionId).executeTakeFirst();
  if (used) throw new InvalidError('This version is used by a planned service. Remove the service first.');
  const count = await db
    .selectFrom('recipe_versions')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('recipe_id', '=', recipe_id)
    .executeTakeFirstOrThrow();
  if (Number(count.n) <= 1) throw new InvalidError('A recipe needs at least one version');
  await db.deleteFrom('recipe_versions').where('id', '=', versionId).execute();
}

/* ------------------------------ Services & portions ------------------------- */

async function resolvePortionTargets(userId: string, portions: PortionInput[]) {
  const people = await listPeople(userId);
  return portions.map((p) => {
    const person = p.person_id ? people.find((x) => x.id === p.person_id) : undefined;
    if (p.person_id && !person) throw new NotFoundError('Person');
    const target = p.target_kcal ?? (person && p.slot ? slotTarget(person, p.slot).kcal : null);
    if (!target) throw new InvalidError('Each portion needs target_kcal, or a person and slot');
    return {
      person_id: p.person_id ?? null,
      date: p.date ?? null,
      slot: p.slot ?? null,
      target_kcal: target,
    };
  });
}

async function ownedService(trx: Db, userId: string, serviceId: string) {
  const service = await trx
    .selectFrom('services')
    .selectAll()
    .where('id', '=', serviceId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!service) throw new NotFoundError('Service');
  return service;
}

export async function planService(userId: string, input: ServiceCreate): Promise<Service> {
  await ownedVersion(db, userId, input.version_id);
  const portions = await resolvePortionTargets(userId, input.portions);
  const id = await db.transaction().execute(async (trx) => {
    const { id } = await trx
      .insertInto('services')
      .values({ user_id: userId, version_id: input.version_id, cook_date: input.cook_date, notes: input.notes ?? null })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('portions')
      .values(portions.map((p) => ({ ...p, service_id: id })))
      .execute();
    return id;
  });
  return getService(userId, id);
}

/** Plans several services atomically, e.g. a week of breakfasts. */
export async function planServices(userId: string, inputs: ServiceCreate[]): Promise<Service[]> {
  const prepared: { input: ServiceCreate; portions: Awaited<ReturnType<typeof resolvePortionTargets>> }[] = [];
  for (const input of inputs) {
    await ownedVersion(db, userId, input.version_id);
    prepared.push({ input, portions: await resolvePortionTargets(userId, input.portions) });
  }
  const ids = await db.transaction().execute(async (trx) => {
    const out: string[] = [];
    for (const { input, portions } of prepared) {
      const { id } = await trx
        .insertInto('services')
        .values({
          user_id: userId,
          version_id: input.version_id,
          cook_date: input.cook_date,
          notes: input.notes ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('portions')
        .values(portions.map((p) => ({ ...p, service_id: id })))
        .execute();
      out.push(id);
    }
    return out;
  });
  return Promise.all(ids.map((id) => getService(userId, id)));
}

export async function addPortions(userId: string, serviceId: string, portions: PortionInput[]): Promise<Service> {
  await ownedService(db, userId, serviceId);
  const rows = await resolvePortionTargets(userId, portions);
  await db
    .insertInto('portions')
    .values(rows.map((p) => ({ ...p, service_id: serviceId })))
    .execute();
  return getService(userId, serviceId);
}

export async function getService(userId: string, serviceId: string): Promise<Service> {
  const s = await db
    .selectFrom('services as s')
    .innerJoin('recipe_versions as v', 'v.id', 's.version_id')
    .innerJoin('recipes as r', 'r.id', 'v.recipe_id')
    .selectAll('s')
    .select([
      'r.id as recipe_id',
      'r.title as recipe_title',
      'v.label as version_label',
      'v.servings as version_servings',
    ])
    .where('s.id', '=', serviceId)
    .where('s.user_id', '=', userId)
    .executeTakeFirst();
  if (!s) throw new NotFoundError('Service');
  const [portionRows, nutrition] = await Promise.all([
    db
      .selectFrom('portions as p')
      .leftJoin('people as pe', 'pe.id', 'p.person_id')
      .selectAll('p')
      .select('pe.name as person_name')
      .where('p.service_id', '=', serviceId)
      .orderBy('p.date')
      .orderBy('p.created_at')
      .execute(),
    versionNutrition([s.version_id]),
  ]);
  const shares = sharesFromTargets(portionRows.map((p) => p.target_kcal));
  const batch = nutrition.get(s.version_id) ?? nullTotals();
  const portions: Portion[] = portionRows.map((p, i) => ({
    id: p.id,
    service_id: p.service_id,
    person_id: p.person_id,
    person_name: p.person_name,
    date: p.date,
    slot: p.slot,
    target_kcal: p.target_kcal,
    share: shares[i] ?? 0,
    nutrition: scaleNutrition(batch, shares[i] ?? 0),
  }));
  return {
    id: s.id,
    recipe_id: s.recipe_id,
    recipe_title: s.recipe_title,
    version_id: s.version_id,
    version_label: s.version_label,
    version_servings: s.version_servings,
    cook_date: s.cook_date,
    cooked_weight_g: s.cooked_weight_g,
    notes: s.notes,
    portions,
    dish_up: dishUpGuide(portions, s.cooked_weight_g),
  };
}

export async function updateService(
  userId: string,
  serviceId: string,
  input: z.infer<typeof ServiceUpdate>,
): Promise<Service> {
  await ownedService(db, userId, serviceId);
  const fields = {
    ...(input.cooked_weight_g !== undefined && { cooked_weight_g: input.cooked_weight_g }),
    ...(input.cook_date !== undefined && { cook_date: input.cook_date }),
    ...(input.notes !== undefined && { notes: input.notes }),
  };
  if (Object.keys(fields).length) await db.updateTable('services').set(fields).where('id', '=', serviceId).execute();
  return getService(userId, serviceId);
}

export async function deleteService(userId: string, serviceId: string): Promise<void> {
  await ownedService(db, userId, serviceId);
  await db.deleteFrom('services').where('id', '=', serviceId).execute();
}

async function ownedPortion(userId: string, portionId: string) {
  const p = await db
    .selectFrom('portions as p')
    .innerJoin('services as s', 's.id', 'p.service_id')
    .select(['p.id', 'p.service_id'])
    .where('p.id', '=', portionId)
    .where('s.user_id', '=', userId)
    .executeTakeFirst();
  if (!p) throw new NotFoundError('Portion');
  return p;
}

export async function updatePortion(
  userId: string,
  portionId: string,
  input: z.infer<typeof PortionUpdate>,
): Promise<Service> {
  const { service_id } = await ownedPortion(userId, portionId);
  if (input.person_id) {
    const person = await db
      .selectFrom('people')
      .select('id')
      .where('id', '=', input.person_id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!person) throw new NotFoundError('Person');
  }
  const fields = {
    ...(input.person_id !== undefined && { person_id: input.person_id }),
    ...(input.date !== undefined && { date: input.date }),
    ...(input.slot !== undefined && { slot: input.slot }),
    ...(input.target_kcal !== undefined && { target_kcal: input.target_kcal }),
  };
  if (Object.keys(fields).length) await db.updateTable('portions').set(fields).where('id', '=', portionId).execute();
  return getService(userId, service_id);
}

/** Removes a portion. Removing the last portion removes the service. */
export async function removePortion(userId: string, portionId: string): Promise<Service | null> {
  const { service_id } = await ownedPortion(userId, portionId);
  await db.deleteFrom('portions').where('id', '=', portionId).execute();
  const left = await db.selectFrom('portions').select('id').where('service_id', '=', service_id).executeTakeFirst();
  if (!left) {
    await db.deleteFrom('services').where('id', '=', service_id).execute();
    return null;
  }
  return getService(userId, service_id);
}

/* ----------------------------------- Plan ----------------------------------- */

function nullTotals(): NutritionTotals {
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, null])) as NutritionTotals;
}

async function versionNutrition(versionIds: string[]): Promise<Map<string, NutritionTotals>> {
  if (!versionIds.length) return new Map();
  const rows = await db.selectFrom('nutrition').selectAll().where('version_id', 'in', versionIds).execute();
  return new Map(
    rows.map((n) => [n.version_id, Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, n[k]])) as NutritionTotals]),
  );
}

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (d > last) throw new InvalidError('start must be on or before end');
  while (d <= last && out.length < 62) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function getPlan(userId: string, start: string, end: string): Promise<Plan> {
  const dates = datesBetween(start, end);
  const people = await listPeople(userId);

  // Every service with a portion in range or cooked in range, with all of its portions (shares need the whole service).
  const serviceIds = (
    await db
      .selectFrom('services as s')
      .leftJoin('portions as p', 'p.service_id', 's.id')
      .select('s.id')
      .distinct()
      .where('s.user_id', '=', userId)
      .where((eb) =>
        eb.or([
          eb.and([eb('p.date', '>=', start), eb('p.date', '<=', end)]),
          eb.and([eb('s.cook_date', '>=', start), eb('s.cook_date', '<=', end)]),
        ]),
      )
      .execute()
  ).map((r) => r.id);
  const services = await Promise.all(serviceIds.map((id) => getService(userId, id)));

  const days: PlanDay[] = dates.map((date) => ({
    date,
    people: people.map((person) => ({
      person_id: person.id,
      name: person.name,
      target_kcal: person.daily_kcal,
      target_protein_g: person.daily_protein_g,
      totals: emptyTotals(),
      meals: [],
    })),
  }));

  const unassigned: Portion[] = [];
  for (const service of services) {
    for (const portion of service.portions) {
      const day = days.find((d) => d.date === portion.date);
      const entry = day?.people.find((p) => p.person_id === portion.person_id);
      if (!portion.date || !portion.person_id || !portion.slot) {
        // A dated leftover belongs to its own date's range; an undated one to the cook date's.
        const when = portion.date ?? service.cook_date;
        if (when >= start && when <= end) unassigned.push(portion);
        continue;
      }
      if (!entry) continue;
      entry.meals.push({
        portion_id: portion.id,
        service_id: service.id,
        recipe_id: service.recipe_id,
        recipe_title: service.recipe_title,
        version_label: service.version_label,
        slot: portion.slot,
        share: portion.share,
        nutrition: portion.nutrition,
      });
      entry.totals = addNutrition(entry.totals, portion.nutrition);
    }
  }
  for (const day of days)
    for (const p of day.people) p.meals.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  return { start, end, days, unassigned };
}

/* --------------------------------- Shopping --------------------------------- */

export async function shoppingList(
  userId: string,
  opts: { start: string; end: string } | { version_ids: string[] },
): Promise<ShoppingList> {
  let versionIds: string[];
  if ('version_ids' in opts) {
    for (const id of new Set(opts.version_ids)) await ownedVersion(db, userId, id);
    versionIds = opts.version_ids;
  } else {
    versionIds = (
      await db
        .selectFrom('services')
        .select('version_id')
        .where('user_id', '=', userId)
        .where('cook_date', '>=', opts.start)
        .where('cook_date', '<=', opts.end)
        .orderBy('cook_date')
        .execute()
    ).map((s) => s.version_id);
  }
  const versions = await loadVersions(db, [...new Set(versionIds)]);
  const titles = new Map(
    (
      await db
        .selectFrom('recipes as r')
        .innerJoin('recipe_versions as v', 'v.recipe_id', 'r.id')
        .select(['v.id', 'r.title'])
        .where('v.id', 'in', versionIds.length ? [...new Set(versionIds)] : ['00000000-0000-0000-0000-000000000000'])
        .execute()
    ).map((r) => [r.id, r.title]),
  );
  const lines = versionIds.flatMap((id) =>
    (versions.get(id)?.ingredients ?? []).map((i) => ({
      ingredient_id: i.ingredient_id,
      ingredient: i.ingredient,
      aisle: i.aisle,
      quantity: i.quantity,
      unit: i.unit,
      raw_text: i.raw_text,
      optional: i.optional,
      recipe_title: titles.get(id) ?? '',
    })),
  );
  return {
    start: 'start' in opts ? opts.start : null,
    end: 'end' in opts ? opts.end : null,
    items: aggregateShopping(lines),
  };
}

/* ------------------------------ Account data ------------------------------ */

export interface AccountDataCounts {
  people: number;
  recipes: number;
  ingredients: number;
  services: number;
}

/** How much an account holds. The account scripts use it to describe and guard what they change. */
export async function accountDataCounts(userId: string): Promise<AccountDataCounts> {
  const { rows } = await sql<AccountDataCounts>`
    SELECT
      (SELECT count(*) FROM people WHERE user_id = ${userId})::int AS people,
      (SELECT count(*) FROM recipes WHERE user_id = ${userId})::int AS recipes,
      (SELECT count(*) FROM ingredients WHERE user_id = ${userId})::int AS ingredients,
      (SELECT count(*) FROM services WHERE user_id = ${userId})::int AS services
  `.execute(db);
  return rows[0]!;
}

/**
 * Deletes everything an account holds: people, recipes (with their versions), ingredients and the plan.
 * The account itself stays, so its Apple or Google sign-in and its agent tokens keep working.
 */
export async function clearAccountData(userId: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom('services').where('user_id', '=', userId).execute();
    await trx.deleteFrom('recipes').where('user_id', '=', userId).execute();
    await trx.deleteFrom('ingredients').where('user_id', '=', userId).execute();
    await trx.deleteFrom('people').where('user_id', '=', userId).execute();
  });
}
