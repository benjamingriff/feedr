import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Kysely, PostgresDialect, type ColumnType, type Generated } from 'kysely';
import type { Slot, SlotSplit } from '@feedr/core';

// numeric → number, date → 'YYYY-MM-DD' string
pg.types.setTypeParser(1700, (v) => Number(v));
pg.types.setTypeParser(1082, (v) => v);

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface DB {
  users: { id: Generated<string>; name: string; clerk_user_id: string | null; created_at: Timestamp };
  access_tokens: {
    id: Generated<string>;
    user_id: string;
    hash: string;
    name: string;
    created_at: Timestamp;
    last_used_at: Date | null;
  };
  people: {
    id: Generated<string>;
    user_id: string;
    name: string;
    weight_kg: number | null;
    daily_kcal: number;
    daily_protein_g: number | null;
    slot_split: ColumnType<SlotSplit, string, string>;
    archived_at: Date | null;
    created_at: Timestamp;
  };
  ingredients: { id: Generated<string>; user_id: string; name: string; aisle: string | null; created_at: Timestamp };
  recipes: {
    id: Generated<string>;
    user_id: string;
    title: string;
    description: string | null;
    source_url: string | null;
    source_name: string | null;
    kind: Generated<'full' | 'simple'>;
    tags: Generated<string[]>;
    image_url: string | null;
    archived_at: Date | null;
    created_at: Timestamp;
    updated_at: Timestamp;
  };
  recipe_versions: {
    id: Generated<string>;
    recipe_id: string;
    label: string;
    servings: number;
    notes: string | null;
    is_original: Generated<boolean>;
    based_on_version_id: string | null;
    prep_minutes: number | null;
    cook_minutes: number | null;
    created_at: Timestamp;
  };
  recipe_ingredients: {
    id: Generated<string>;
    version_id: string;
    position: number;
    ingredient_id: string;
    quantity: number | null;
    unit: string | null;
    raw_text: string;
    preparation: string | null;
    section: string | null;
    optional: Generated<boolean>;
  };
  recipe_steps: {
    id: Generated<string>;
    version_id: string;
    position: number;
    text: string;
    section: string | null;
    timer_seconds: number | null;
  };
  step_ingredients: { step_id: string; ingredient_line_id: string; quantity: number | null; unit: string | null };
  nutrition: {
    version_id: string;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    saturated_fat_g: number | null;
    fibre_g: number | null;
    sugar_g: number | null;
    salt_g: number | null;
    extra: ColumnType<Record<string, number>, string, string>;
    source: 'from_source' | 'agent_estimate';
    notes: string | null;
  };
  services: {
    id: Generated<string>;
    user_id: string;
    version_id: string;
    cook_date: string;
    cooked_weight_g: number | null;
    notes: string | null;
    created_at: Timestamp;
  };
  portions: {
    id: Generated<string>;
    service_id: string;
    person_id: string | null;
    date: string | null;
    slot: Slot | null;
    target_kcal: number;
    created_at: Timestamp;
  };
  schema_migrations: { name: string; applied_at: Timestamp };
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');

export const pool = new pg.Pool({ connectionString });
export const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));

/** Applies migrations/*.sql in name order, each once, inside a transaction. */
export async function migrate(): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
    const applied: string[] = [];
    for (const file of files) {
      if (done.has(file)) continue;
      await client.query('BEGIN');
      try {
        await client.query(await readFile(migrationsDir + file, 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return applied;
  } finally {
    client.release();
  }
}
