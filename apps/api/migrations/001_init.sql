CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  clerk_user_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hash text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- People you cook for. They don't log in.
CREATE TABLE people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  weight_kg numeric,
  daily_kcal integer NOT NULL CHECK (daily_kcal > 0),
  daily_protein_g numeric,
  slot_split jsonb NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  aisle text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ingredients_user_name ON ingredients (user_id, lower(name));

CREATE TABLE recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  source_url text,
  source_name text,
  kind text NOT NULL DEFAULT 'full' CHECK (kind IN ('full', 'simple')),
  tags text[] NOT NULL DEFAULT '{}',
  image_url text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recipes_user ON recipes (user_id) WHERE archived_at IS NULL;

-- What you actually cook: the original as published, or a version scaled or adapted by an agent.
CREATE TABLE recipe_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  label text NOT NULL,
  servings numeric NOT NULL CHECK (servings > 0),
  notes text,
  is_original boolean NOT NULL DEFAULT false,
  based_on_version_id uuid REFERENCES recipe_versions(id) ON DELETE SET NULL,
  prep_minutes integer,
  cook_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recipe_versions_recipe ON recipe_versions (recipe_id);

CREATE TABLE recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  position integer NOT NULL,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity numeric,
  unit text,
  raw_text text NOT NULL,
  preparation text,
  section text,
  optional boolean NOT NULL DEFAULT false
);
CREATE INDEX recipe_ingredients_version ON recipe_ingredients (version_id, position);

CREATE TABLE recipe_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  position integer NOT NULL,
  text text NOT NULL,
  section text,
  timer_seconds integer
);
CREATE INDEX recipe_steps_version ON recipe_steps (version_id, position);

-- Whole-batch nutrition for a version.
CREATE TABLE nutrition (
  version_id uuid PRIMARY KEY REFERENCES recipe_versions(id) ON DELETE CASCADE,
  kcal numeric NOT NULL,
  protein_g numeric NOT NULL,
  carbs_g numeric NOT NULL,
  fat_g numeric NOT NULL,
  saturated_fat_g numeric,
  fibre_g numeric,
  sugar_g numeric,
  salt_g numeric,
  extra jsonb NOT NULL DEFAULT '{}',
  source text NOT NULL CHECK (source IN ('from_source', 'agent_estimate')),
  notes text
);

-- One version cooked on a date.
CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  cook_date date NOT NULL,
  cooked_weight_g numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX services_user_date ON services (user_id, cook_date);

-- A share of a service for a person at a meal. Share = target_kcal / sum of the service's targets.
CREATE TABLE portions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  date date,
  slot text CHECK (slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
  target_kcal numeric NOT NULL CHECK (target_kcal > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portions_service ON portions (service_id);
CREATE INDEX portions_date ON portions (date);
