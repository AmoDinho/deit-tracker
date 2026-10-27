import { relations } from "drizzle-orm"
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  ...timestamps,
})

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
)

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true, mode: "date" }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true, mode: "date" }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
)

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
})

export const profile = pgTable("profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  sex: text("sex"),
  birthDate: text("birth_date"),
  heightCm: doublePrecision("height_cm"),
  weightKg: doublePrecision("weight_kg"),
  activityLevel: text("activity_level"),
  goalType: text("goal_type"),
  goalPace: doublePrecision("goal_pace"),
  energyUnit: text("energy_unit").notNull().default("kcal"),
  timezone: text("timezone").notNull().default("Africa/Johannesburg"),
  onboarded: boolean("onboarded").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
})

export const goal = pgTable(
  "goal",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: "date" }).notNull(),
    calories: integer("calories").notNull(),
    proteinG: integer("protein_g").notNull(),
    carbsG: integer("carbs_g").notNull(),
    fatG: integer("fat_g").notNull(),
    source: text("source").notNull(),
  },
  (table) => [index("goal_user_effective_idx").on(table.userId, table.effectiveFrom)],
)

export const food = pgTable(
  "food",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    sourceRef: text("source_ref"),
    name: text("name").notNull(),
    brand: text("brand"),
    kcal100g: doublePrecision("kcal_100g").notNull(),
    protein100g: doublePrecision("protein_100g").notNull(),
    carbs100g: doublePrecision("carbs_100g").notNull(),
    fat100g: doublePrecision("fat_100g").notNull(),
    fibre100g: doublePrecision("fibre_100g"),
    labelPhotoKey: text("label_photo_key"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("food_name_idx").on(table.name),
    uniqueIndex("food_source_ref_idx").on(table.source, table.sourceRef),
  ],
)

export const foodServing = pgTable("food_serving", {
  id: text("id").primaryKey(),
  foodId: text("food_id")
    .notNull()
    .references(() => food.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  grams: doublePrecision("grams").notNull(),
})

export const meal = pgTable(
  "meal",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    eatenAt: timestamp("eaten_at", { withTimezone: true, mode: "date" }).notNull(),
    slot: text("slot").notNull(),
    note: text("note"),
    photoKey: text("photo_key"),
    inputType: text("input_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("meal_user_eaten_idx").on(table.userId, table.eatenAt)],
)

export const mealItem = pgTable("meal_item", {
  id: text("id").primaryKey(),
  mealId: text("meal_id")
    .notNull()
    .references(() => meal.id, { onDelete: "cascade" }),
  foodId: text("food_id").references(() => food.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  grams: doublePrecision("grams").notNull(),
  kcal: doublePrecision("kcal").notNull(),
  proteinG: doublePrecision("protein_g").notNull(),
  carbsG: doublePrecision("carbs_g").notNull(),
  fatG: doublePrecision("fat_g").notNull(),
  source: text("source"),
  aiConfidence: doublePrecision("ai_confidence"),
  userEdited: boolean("user_edited").notNull().default(false),
})

export const aiAnalysis = pgTable("ai_analysis", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  mealId: text("meal_id").references(() => meal.id, { onDelete: "set null" }),
  task: text("task").notNull(),
  status: text("status").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  rawRequest: text("raw_request"),
  rawResponse: text("raw_response"),
  latencyMs: integer("latency_ms"),
  tokens: integer("tokens"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
})

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  profile: one(profile, { fields: [user.id], references: [profile.userId] }),
  meals: many(meal),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}))

export const mealRelations = relations(meal, ({ many, one }) => ({
  items: many(mealItem),
  user: one(user, { fields: [meal.userId], references: [user.id] }),
}))

export const mealItemRelations = relations(mealItem, ({ one }) => ({
  meal: one(meal, { fields: [mealItem.mealId], references: [meal.id] }),
  food: one(food, { fields: [mealItem.foodId], references: [food.id] }),
}))

export const foodRelations = relations(food, ({ many }) => ({
  servings: many(foodServing),
}))

export const foodServingRelations = relations(foodServing, ({ one }) => ({
  food: one(food, { fields: [foodServing.foodId], references: [food.id] }),
}))

export const schema = {
  user,
  session,
  account,
  verification,
  profile,
  goal,
  food,
  foodServing,
  meal,
  mealItem,
  aiAnalysis,
  userRelations,
  sessionRelations,
  accountRelations,
  mealRelations,
  mealItemRelations,
  foodRelations,
  foodServingRelations,
}
