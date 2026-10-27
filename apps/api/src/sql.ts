export const schemaSql = `
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "session" (
  id TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "account" (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "verification" (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "profile" (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  sex TEXT,
  birth_date TEXT,
  height_cm DOUBLE PRECISION,
  weight_kg DOUBLE PRECISION,
  activity_level TEXT,
  goal_type TEXT,
  goal_pace DOUBLE PRECISION,
  energy_unit TEXT NOT NULL DEFAULT 'kcal',
  timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
  onboarded BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "goal" (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  effective_from TIMESTAMPTZ NOT NULL,
  calories INTEGER NOT NULL,
  protein_g INTEGER NOT NULL,
  carbs_g INTEGER NOT NULL,
  fat_g INTEGER NOT NULL,
  source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "food" (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_ref TEXT,
  name TEXT NOT NULL,
  brand TEXT,
  kcal_100g DOUBLE PRECISION NOT NULL,
  protein_100g DOUBLE PRECISION NOT NULL,
  carbs_100g DOUBLE PRECISION NOT NULL,
  fat_100g DOUBLE PRECISION NOT NULL,
  fibre_100g DOUBLE PRECISION,
  label_photo_key TEXT,
  created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "food_serving" (
  id TEXT PRIMARY KEY,
  food_id TEXT NOT NULL REFERENCES "food"(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  grams DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS "meal" (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  eaten_at TIMESTAMPTZ NOT NULL,
  slot TEXT NOT NULL,
  note TEXT,
  photo_key TEXT,
  input_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "meal_item" (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL REFERENCES "meal"(id) ON DELETE CASCADE,
  food_id TEXT REFERENCES "food"(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  grams DOUBLE PRECISION NOT NULL,
  kcal DOUBLE PRECISION NOT NULL,
  protein_g DOUBLE PRECISION NOT NULL,
  carbs_g DOUBLE PRECISION NOT NULL,
  fat_g DOUBLE PRECISION NOT NULL,
  source TEXT,
  ai_confidence DOUBLE PRECISION,
  user_edited BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS "ai_analysis" (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  meal_id TEXT REFERENCES "meal"(id) ON DELETE SET NULL,
  task TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  raw_request TEXT,
  raw_response TEXT,
  latency_ms INTEGER,
  tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS session_user_id_idx ON "session" (user_id);
CREATE INDEX IF NOT EXISTS account_user_id_idx ON "account" (user_id);
CREATE INDEX IF NOT EXISTS goal_user_effective_idx ON "goal" (user_id, effective_from);
CREATE INDEX IF NOT EXISTS food_name_idx ON "food" (name);
CREATE UNIQUE INDEX IF NOT EXISTS food_source_ref_idx ON "food" (source, source_ref);
CREATE INDEX IF NOT EXISTS meal_user_eaten_idx ON "meal" (user_id, eaten_at);
`
