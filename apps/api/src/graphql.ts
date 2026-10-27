import {
  addDays,
  ageFromBirthDate,
  birthDateFromAge,
  calculateTargets,
  displayEnergy,
  GOAL_OPTIONS,
  goalOptionFromProfile,
  nutritionForGrams,
  startOfWeek,
  sumNutrition,
  todayIso,
  zonedDayRange,
  type EnergyUnit,
} from "@deit/domain"
import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm"
import { GraphQLError } from "graphql"
import { createSchema, createYoga } from "graphql-yoga"
import { analyzeMealPhoto, matchFood, parseMealText, PROMPT_VERSION, readLabel, type CatalogFood } from "./ai.ts"
import type { Auth } from "./auth.ts"
import type { Database } from "./db.ts"
import { aiAnalysis, food, foodServing, goal, meal, mealItem, profile, user } from "./schema.ts"
import { assertOwnKey, createUploadTicket, displayUrl, readBytes, safeKey } from "./storage.ts"

type Context = {
  db: Database
  auth: Auth
  userId: string | null
  user: { id: string; name: string; email: string; image: string | null } | null
}

const typeDefs = /* GraphQL */ `
  type User {
    id: ID!
    name: String!
    email: String!
    image: String
  }
  type Profile {
    sex: String
    birthDate: String
    age: Int
    heightCm: Float
    weightKg: Float
    activityLevel: String
    goalType: String
    goalPace: Float
    goalOption: String
    energyUnit: String!
    timezone: String!
    onboarded: Boolean!
  }
  type Goal {
    calories: Int!
    proteinG: Int!
    carbsG: Int!
    fatG: Int!
    source: String!
    effectiveFrom: String!
    bmr: Int
    tdee: Int
    adjustment: Int
    activityMultiplier: Float
    warnings: [String!]!
  }
  type Me {
    user: User!
    profile: Profile
    goal: Goal
    googleEnabled: Boolean!
  }
  type Serving {
    id: ID!
    label: String!
    grams: Float!
  }
  type Food {
    id: ID!
    source: String!
    name: String!
    brand: String
    kcal100g: Float!
    protein100g: Float!
    carbs100g: Float!
    fat100g: Float!
    fibre100g: Float
    servings: [Serving!]!
  }
  type MealItem {
    id: ID!
    foodId: ID
    name: String!
    grams: Float!
    kcal: Float!
    proteinG: Float!
    carbsG: Float!
    fatG: Float!
    source: String
    confidence: Float
    userEdited: Boolean!
  }
  type Meal {
    id: ID!
    eatenAt: String!
    slot: String!
    note: String
    photoKey: String
    photoUrl: String
    inputType: String!
    items: [MealItem!]!
    kcal: Float!
    proteinG: Float!
    carbsG: Float!
    fatG: Float!
  }
  type DailySummary {
    date: String!
    calories: Float!
    proteinG: Float!
    carbsG: Float!
    fatG: Float!
    target: Goal
    meals: [Meal!]!
  }
  type DayTotal {
    date: String!
    calories: Float!
    proteinG: Float!
    carbsG: Float!
    fatG: Float!
    logged: Boolean!
  }
  type WeekSummary {
    start: String!
    end: String!
    days: [DayTotal!]!
    avgCalories: Float!
    avgProtein: Float!
    avgCarbs: Float!
    avgFat: Float!
    daysLogged: Int!
    daysInWeek: Int!
  }
  type AnalysisItem {
    name: String!
    grams: Float!
    confidence: Float!
    foodId: ID
    source: String
    kcal: Float!
    proteinG: Float!
    carbsG: Float!
    fatG: Float!
    lowConfidence: Boolean!
  }
  type Analysis {
    id: ID!
    items: [AnalysisItem!]!
    question: String
    latencyMs: Int!
    provider: String!
    model: String!
  }
  type LabelRead {
    name: String!
    brand: String
    energyKj: Float
    kcal100g: Float!
    protein100g: Float!
    carbs100g: Float!
    fat100g: Float!
    fibre100g: Float
    provider: String!
    needsManualEntry: Boolean!
  }
  type UploadTicket {
    key: String!
    uploadUrl: String!
    method: String!
    contentType: String!
  }
  type Query {
    googleEnabled: Boolean!
    me: Me
    dailySummary(date: String!): DailySummary!
    weekSummary(start: String!): WeekSummary!
    searchFoods(q: String!, source: String): [Food!]!
    recentMeals(limit: Int): [Meal!]!
    meal(id: ID!): Meal
  }
  input OnboardingInput {
    sex: String!
    age: Int!
    heightCm: Float!
    weightKg: Float!
    activityLevel: String!
    goal: String!
    energyUnit: String!
    timezone: String!
  }
  input GoalInput {
    calories: Int!
    proteinG: Int!
    carbsG: Int!
    fatG: Int!
  }
  input FoodInput {
    name: String!
    brand: String
    kcal100g: Float!
    protein100g: Float!
    carbs100g: Float!
    fat100g: Float!
    fibre100g: Float
    labelPhotoKey: String
    servingLabel: String
    servingGrams: Float
  }
  input MealItemInput {
    foodId: ID
    name: String!
    grams: Float!
    kcal: Float
    proteinG: Float
    carbsG: Float
    fatG: Float
    source: String
    confidence: Float
    userEdited: Boolean
  }
  input MealInput {
    eatenAt: String!
    slot: String!
    note: String
    photoKey: String
    inputType: String!
    analysisId: ID
    items: [MealItemInput!]!
  }
  type Mutation {
    completeOnboarding(input: OnboardingInput!): Me!
    setGoals(input: GoalInput!): Goal!
    updatePreferences(energyUnit: String, timezone: String): Profile!
    createUploadUrl(contentType: String!, kind: String!): UploadTicket!
    analyzeMealPhoto(key: String!): Analysis!
    parseMealText(text: String!): Analysis!
    readNutritionLabel(key: String!): LabelRead!
    saveFood(input: FoodInput!): Food!
    saveMeal(input: MealInput!): Meal!
    updateMeal(id: ID!, input: MealInput!): Meal!
    deleteMeal(id: ID!): Boolean!
    logAgain(mealId: ID!, eatenAt: String, slot: String): Meal!
    deleteAccount: Boolean!
  }
`

function requireUser(ctx: Context) {
  if (!ctx.userId || !ctx.user) throw new GraphQLError("Sign in to continue.")
  return { userId: ctx.userId, user: ctx.user }
}

async function currentGoal(db: Database, userId: string) {
  const rows = await db
    .select()
    .from(goal)
    .where(and(eq(goal.userId, userId), lt(goal.effectiveFrom, new Date(Date.now() + 1000))))
    .orderBy(desc(goal.effectiveFrom))
    .limit(1)
  return rows[0] ?? null
}

async function currentProfile(db: Database, userId: string) {
  const rows = await db.select().from(profile).where(eq(profile.userId, userId)).limit(1)
  return rows[0] ?? null
}

function shapeProfile(row: NonNullable<Awaited<ReturnType<typeof currentProfile>>>) {
  const age = row.birthDate ? ageFromBirthDate(row.birthDate) : null
  return {
    sex: row.sex,
    birthDate: row.birthDate,
    age,
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    activityLevel: row.activityLevel,
    goalType: row.goalType,
    goalPace: row.goalPace,
    goalOption:
      row.goalType && row.goalPace != null ? goalOptionFromProfile(row.goalType, row.goalPace) : null,
    energyUnit: row.energyUnit,
    timezone: row.timezone,
    onboarded: row.onboarded,
  }
}

function shapeGoal(
  row: NonNullable<Awaited<ReturnType<typeof currentGoal>>>,
  profileRow: Awaited<ReturnType<typeof currentProfile>>,
) {
  let breakdown: ReturnType<typeof calculateTargets> | null = null
  if (profileRow?.sex && profileRow.birthDate && profileRow.heightCm && profileRow.weightKg && profileRow.activityLevel && profileRow.goalType) {
    breakdown = calculateTargets({
      sex: profileRow.sex as "male" | "female",
      age: ageFromBirthDate(profileRow.birthDate),
      heightCm: profileRow.heightCm,
      weightKg: profileRow.weightKg,
      activity: profileRow.activityLevel as "moderate",
      goal: goalOptionFromProfile(profileRow.goalType, profileRow.goalPace ?? 0.5),
    })
  }
  return {
    calories: row.calories,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    source: row.source,
    effectiveFrom: row.effectiveFrom.toISOString(),
    bmr: breakdown?.bmr ?? null,
    tdee: breakdown?.tdee ?? null,
    adjustment: breakdown?.adjustment ?? null,
    activityMultiplier: breakdown?.activityMultiplier ?? null,
    warnings: breakdown?.warnings ?? [],
  }
}

async function shapeMeal(db: Database, row: typeof meal.$inferSelect) {
  const items = await db.select().from(mealItem).where(eq(mealItem.mealId, row.id))
  const totals = sumNutrition(
    items.map((item) => ({
      kcal: item.kcal,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
    })),
  )
  return {
    id: row.id,
    eatenAt: row.eatenAt.toISOString(),
    slot: row.slot,
    note: row.note,
    photoKey: row.photoKey,
    photoUrl: row.photoKey ? await displayUrl(row.photoKey) : null,
    inputType: row.inputType,
    kcal: totals.kcal,
    proteinG: totals.proteinG,
    carbsG: totals.carbsG,
    fatG: totals.fatG,
    items: items.map((item) => ({
      id: item.id,
      foodId: item.foodId,
      name: item.name,
      grams: item.grams,
      kcal: item.kcal,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      source: item.source,
      confidence: item.aiConfidence,
      userEdited: item.userEdited,
    })),
  }
}

async function catalog(db: Database): Promise<CatalogFood[]> {
  const rows = await db.select().from(food)
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    source: row.source,
    brand: row.brand,
    kcal100g: row.kcal100g,
    protein100g: row.protein100g,
    carbs100g: row.carbs100g,
    fat100g: row.fat100g,
    fibre100g: row.fibre100g,
  }))
}

async function withServings(db: Database, rows: Array<typeof food.$inferSelect>) {
  if (!rows.length) return []
  const servings = await db.select().from(foodServing).where(inArray(foodServing.foodId, rows.map((row) => row.id)))
  return rows.map((row) => ({
    ...row,
    fibre100g: row.fibre100g,
    servings: servings.filter((serving) => serving.foodId === row.id),
  }))
}

async function resolveItems(db: Database, inputs: Array<Record<string, unknown>>) {
  const ids = inputs.map((item) => item.foodId).filter((id): id is string => typeof id === "string")
  const known = ids.length ? await db.select().from(food).where(inArray(food.id, ids)) : []
  const byId = new Map(known.map((row) => [row.id, row]))
  return inputs.map((input) => {
    const grams = Number(input.grams)
    const match = typeof input.foodId === "string" ? byId.get(input.foodId) : undefined
    if (match) {
      const nutrition = nutritionForGrams(match, grams)
      return {
        name: match.name,
        foodId: match.id,
        grams,
        source: match.source,
        confidence: input.confidence == null ? null : Number(input.confidence),
        userEdited: Boolean(input.userEdited),
        ...nutrition,
      }
    }
    return {
      name: String(input.name),
      foodId: null,
      grams,
      source: (input.source as string) || "ai",
      confidence: input.confidence == null ? null : Number(input.confidence),
      userEdited: Boolean(input.userEdited),
      kcal: Number(input.kcal ?? 0),
      proteinG: Number(input.proteinG ?? 0),
      carbsG: Number(input.carbsG ?? 0),
      fatG: Number(input.fatG ?? 0),
    }
  })
}

async function insertMeal(db: Database, userId: string, input: Record<string, unknown>) {
  const items = await resolveItems(db, (input.items as Array<Record<string, unknown>>) ?? [])
  if (!items.length) throw new GraphQLError("Add at least one food before saving.")
  const id = crypto.randomUUID()
  const eatenAt = new Date(String(input.eatenAt))
  if (Number.isNaN(eatenAt.getTime())) throw new GraphQLError("That time is not valid.")
  await db.insert(meal).values({
    id,
    userId,
    eatenAt,
    slot: String(input.slot || "snack"),
    note: (input.note as string) || items.map((item) => item.name).join(", "),
    photoKey: (input.photoKey as string) || null,
    inputType: String(input.inputType || "search"),
  })
  await db.insert(mealItem).values(
    items.map((item) => ({
      id: crypto.randomUUID(),
      mealId: id,
      foodId: item.foodId,
      name: item.name,
      grams: item.grams,
      kcal: item.kcal,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      source: item.source,
      aiConfidence: item.confidence,
      userEdited: item.userEdited,
    })),
  )
  if (typeof input.analysisId === "string") {
    await db
      .update(aiAnalysis)
      .set({ mealId: id })
      .where(and(eq(aiAnalysis.id, input.analysisId), eq(aiAnalysis.userId, userId)))
  }
  const saved = await db.select().from(meal).where(eq(meal.id, id)).limit(1)
  return shapeMeal(db, saved[0])
}

async function enforceAiLimit(db: Database, userId: string, timeZone: string) {
  const limit = Number(process.env.DAILY_AI_LIMIT || 40)
  const range = zonedDayRange(todayIso(timeZone), timeZone)
  const rows = await db
    .select({ id: aiAnalysis.id })
    .from(aiAnalysis)
    .where(and(eq(aiAnalysis.userId, userId), gte(aiAnalysis.createdAt, range.start)))
  if (rows.length >= limit) {
    throw new GraphQLError("Daily AI limit reached. Search and manual entry still work.")
  }
}

async function recordAnalysis(
  db: Database,
  userId: string,
  task: string,
  result: { provider: string; model: string; raw: string; tokens?: number; latencyMs?: number },
) {
  const id = crypto.randomUUID()
  await db.insert(aiAnalysis).values({
    id,
    userId,
    task,
    status: "done",
    provider: result.provider,
    model: result.model,
    promptVersion: PROMPT_VERSION,
    rawResponse: result.raw.slice(0, 8000),
    latencyMs: result.latencyMs ?? null,
    tokens: result.tokens ?? null,
  })
  return id
}

async function cacheUsda(db: Database, query: string) {
  const apiKey = process.env.FDC_API_KEY
  if (!apiKey || query.trim().length < 2) return
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search")
  url.searchParams.set("api_key", apiKey)
  url.searchParams.set("query", query)
  url.searchParams.set("pageSize", "8")
  const response = await fetch(url)
  if (!response.ok) return
  const json = (await response.json()) as {
    foods?: Array<{ fdcId: number; description: string; foodNutrients?: Array<{ nutrientId: number; value?: number }> }>
  }
  for (const item of json.foods ?? []) {
    const find = (id: number) => item.foodNutrients?.find((nutrient) => nutrient.nutrientId === id)?.value ?? 0
    const kcal = find(1008)
    if (!kcal) continue
    await db
      .insert(food)
      .values({
        id: `fdc-${item.fdcId}`,
        source: "usda",
        sourceRef: String(item.fdcId),
        name: item.description,
        kcal100g: kcal,
        protein100g: find(1003),
        carbs100g: find(1005),
        fat100g: find(1004),
        fibre100g: find(1079) || null,
      })
      .onConflictDoNothing()
  }
}

export function createGraphql(db: Database, auth: Auth) {
  const yoga = createYoga({
    schema: createSchema<Context>({
      typeDefs,
      resolvers: {
        Query: {
          googleEnabled: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
          me: async (_root, _args, ctx) => {
            if (!ctx.userId || !ctx.user) return null
            const profileRow = await currentProfile(ctx.db, ctx.userId)
            const goalRow = await currentGoal(ctx.db, ctx.userId)
            return {
              user: ctx.user,
              profile: profileRow ? shapeProfile(profileRow) : null,
              goal: goalRow ? shapeGoal(goalRow, profileRow) : null,
              googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID),
            }
          },
          dailySummary: async (_root, args: { date: string }, ctx) => {
            const { userId } = requireUser(ctx)
            const profileRow = await currentProfile(ctx.db, userId)
            const timeZone = profileRow?.timezone || "Africa/Johannesburg"
            const range = zonedDayRange(args.date, timeZone)
            const rows = await ctx.db
              .select()
              .from(meal)
              .where(and(eq(meal.userId, userId), gte(meal.eatenAt, range.start), lt(meal.eatenAt, range.end)))
              .orderBy(meal.eatenAt)
            const meals = await Promise.all(rows.map((row) => shapeMeal(ctx.db, row)))
            const totals = sumNutrition(meals)
            const goalRow = await currentGoal(ctx.db, userId)
            return {
              date: args.date,
              calories: totals.kcal,
              proteinG: totals.proteinG,
              carbsG: totals.carbsG,
              fatG: totals.fatG,
              target: goalRow ? shapeGoal(goalRow, profileRow) : null,
              meals,
            }
          },
          weekSummary: async (_root, args: { start: string }, ctx) => {
            const { userId } = requireUser(ctx)
            const profileRow = await currentProfile(ctx.db, userId)
            const timeZone = profileRow?.timezone || "Africa/Johannesburg"
            const start = startOfWeek(args.start)
            const end = addDays(start, 7)
            const range = { start: zonedDayRange(start, timeZone).start, end: zonedDayRange(end, timeZone).start }
            const rows = await ctx.db
              .select()
              .from(meal)
              .where(and(eq(meal.userId, userId), gte(meal.eatenAt, range.start), lt(meal.eatenAt, range.end)))
            const meals = await Promise.all(rows.map((row) => shapeMeal(ctx.db, row)))
            const today = todayIso(timeZone)
            const days = Array.from({ length: 7 }, (_, index) => {
              const date = addDays(start, index)
              const dayMeals = meals.filter((item) => inDay(item.eatenAt, date, timeZone))
              const totals = sumNutrition(dayMeals)
              return {
                date,
                calories: totals.kcal,
                proteinG: totals.proteinG,
                carbsG: totals.carbsG,
                fatG: totals.fatG,
                logged: dayMeals.length > 0,
              }
            })
            const elapsed = days.filter((day) => day.date < today && day.logged)
            const basis = elapsed.length ? elapsed : days.filter((day) => day.logged && day.date !== today)
            const avg = (key: "kcal" | "proteinG" | "carbsG" | "fatG") =>
              basis.length ? Math.round(basis.reduce((sum, day) => sum + day[key], 0) / basis.length) : 0
            return {
              start,
              end: addDays(start, 6),
              days,
              avgCalories: avg("kcal"),
              avgProtein: avg("proteinG"),
              avgCarbs: avg("carbsG"),
              avgFat: avg("fatG"),
              daysLogged: days.filter((day) => day.logged).length,
              daysInWeek: 7,
            }
          },
          searchFoods: async (_root, args: { q: string; source?: string | null }, ctx) => {
            requireUser(ctx)
            const query = args.q.trim()
            if (args.source !== "group") await cacheUsda(ctx.db, query)
            const sourceFilter =
              args.source === "usda"
                ? eq(food.source, "usda")
                : args.source === "group"
                  ? or(eq(food.source, "user"), eq(food.source, "label"))
                  : undefined
            const nameFilter = query
              ? or(ilike(food.name, `%${query.replace(/[%_]/g, "")}%`), ilike(food.brand, `%${query.replace(/[%_]/g, "")}%`))
              : undefined
            const filters = [sourceFilter, nameFilter].filter(Boolean)
            const rows = await ctx.db
              .select()
              .from(food)
              .where(filters.length ? and(...(filters as [typeof sourceFilter])) : undefined)
              .orderBy(sql`CASE WHEN lower(${food.name}) = lower(${query}) THEN 0 WHEN lower(${food.name}) LIKE lower(${query}) || '%' THEN 1 ELSE 2 END`, food.name)
              .limit(query ? 20 : 12)
            return withServings(ctx.db, rows)
          },
          recentMeals: async (_root, args: { limit?: number | null }, ctx) => {
            const { userId } = requireUser(ctx)
            const rows = await ctx.db
              .select()
              .from(meal)
              .where(eq(meal.userId, userId))
              .orderBy(desc(meal.eatenAt))
              .limit(args.limit ?? 8)
            return Promise.all(rows.map((row) => shapeMeal(ctx.db, row)))
          },
          meal: async (_root, args: { id: string }, ctx) => {
            const { userId } = requireUser(ctx)
            const rows = await ctx.db.select().from(meal).where(and(eq(meal.id, args.id), eq(meal.userId, userId))).limit(1)
            return rows[0] ? shapeMeal(ctx.db, rows[0]) : null
          },
        },
        Mutation: {
          completeOnboarding: async (_root, args: { input: Record<string, unknown> }, ctx) => {
            const { userId, user: current } = requireUser(ctx)
            const input = args.input
            const sex = input.sex === "female" ? "female" : "male"
            const goalId = String(input.goal)
            const option = GOAL_OPTIONS.find((item) => item.id === goalId) ?? GOAL_OPTIONS[0]
            const targets = calculateTargets({
              sex,
              age: Number(input.age),
              heightCm: Number(input.heightCm),
              weightKg: Number(input.weightKg),
              activity: String(input.activityLevel) as "moderate",
              goal: option.id,
            })
            const birthDate = birthDateFromAge(Number(input.age))
            await ctx.db
              .insert(profile)
              .values({
                userId,
                sex,
                birthDate,
                heightCm: Number(input.heightCm),
                weightKg: Number(input.weightKg),
                activityLevel: String(input.activityLevel),
                goalType: option.goalType,
                goalPace: option.paceKg,
                energyUnit: input.energyUnit === "kJ" ? "kJ" : "kcal",
                timezone: String(input.timezone || "Africa/Johannesburg"),
                onboarded: true,
                updatedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: profile.userId,
                set: {
                  sex,
                  birthDate,
                  heightCm: Number(input.heightCm),
                  weightKg: Number(input.weightKg),
                  activityLevel: String(input.activityLevel),
                  goalType: option.goalType,
                  goalPace: option.paceKg,
                  energyUnit: input.energyUnit === "kJ" ? "kJ" : "kcal",
                  timezone: String(input.timezone || "Africa/Johannesburg"),
                  onboarded: true,
                  updatedAt: new Date(),
                },
              })
            await ctx.db.insert(goal).values({
              id: crypto.randomUUID(),
              userId,
              effectiveFrom: new Date(),
              calories: targets.calories,
              proteinG: targets.proteinG,
              carbsG: targets.carbsG,
              fatG: targets.fatG,
              source: "calculated",
            })
            const profileRow = await currentProfile(ctx.db, userId)
            const goalRow = await currentGoal(ctx.db, userId)
            return {
              user: current,
              profile: profileRow ? shapeProfile(profileRow) : null,
              goal: goalRow ? shapeGoal(goalRow, profileRow) : null,
              googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID),
            }
          },
          setGoals: async (_root, args: { input: { calories: number; proteinG: number; carbsG: number; fatG: number } }, ctx) => {
            const { userId } = requireUser(ctx)
            if (args.input.calories < 800) throw new GraphQLError("That calorie target is too low to save.")
            await ctx.db.insert(goal).values({
              id: crypto.randomUUID(),
              userId,
              effectiveFrom: new Date(),
              calories: Math.round(args.input.calories),
              proteinG: Math.round(args.input.proteinG),
              carbsG: Math.round(args.input.carbsG),
              fatG: Math.round(args.input.fatG),
              source: "manual",
            })
            const profileRow = await currentProfile(ctx.db, userId)
            const goalRow = await currentGoal(ctx.db, userId)
            return shapeGoal(goalRow!, profileRow)
          },
          updatePreferences: async (_root, args: { energyUnit?: string | null; timezone?: string | null }, ctx) => {
            const { userId } = requireUser(ctx)
            const existing = await currentProfile(ctx.db, userId)
            if (!existing) throw new GraphQLError("Finish onboarding first.")
            await ctx.db
              .update(profile)
              .set({
                energyUnit: args.energyUnit === "kJ" ? "kJ" : args.energyUnit === "kcal" ? "kcal" : existing.energyUnit,
                timezone: args.timezone || existing.timezone,
                updatedAt: new Date(),
              })
              .where(eq(profile.userId, userId))
            const next = await currentProfile(ctx.db, userId)
            return shapeProfile(next!)
          },
          createUploadUrl: async (_root, args: { contentType: string; kind: string }, ctx) => {
            const { userId } = requireUser(ctx)
            const extension = args.contentType.includes("png") ? "png" : args.contentType.includes("webp") ? "webp" : "jpg"
            const key = safeKey(userId, args.kind, extension)
            const ticket = await createUploadTicket(key, args.contentType || "image/jpeg")
            return { ...ticket, contentType: args.contentType || "image/jpeg" }
          },
          analyzeMealPhoto: async (_root, args: { key: string }, ctx) => {
            const { userId } = requireUser(ctx)
            assertOwnKey(userId, args.key)
            const profileRow = await currentProfile(ctx.db, userId)
            await enforceAiLimit(ctx.db, userId, profileRow?.timezone || "Africa/Johannesburg")
            const stored = await readBytes(args.key)
            if (!stored) throw new GraphQLError("Upload the photo first.")
            const foods = await catalog(ctx.db)
            const started = Date.now()
            const result = await analyzeMealPhoto(
              { mime: stored.mime, base64: stored.bytes.toString("base64") },
              foods,
            )
            const id = await recordAnalysis(ctx.db, userId, "meal_photo", {
              ...result,
              latencyMs: result.latencyMs ?? Date.now() - started,
            })
            return { id, ...result, latencyMs: result.latencyMs ?? Date.now() - started }
          },
          parseMealText: async (_root, args: { text: string }, ctx) => {
            const { userId } = requireUser(ctx)
            const text = args.text.trim()
            if (text.length < 2) throw new GraphQLError("Describe the meal in a few words.")
            const profileRow = await currentProfile(ctx.db, userId)
            await enforceAiLimit(ctx.db, userId, profileRow?.timezone || "Africa/Johannesburg")
            const foods = await catalog(ctx.db)
            const started = Date.now()
            const result = await parseMealText(text, foods)
            const latencyMs = "latencyMs" in result && typeof result.latencyMs === "number" ? result.latencyMs : Date.now() - started
            const id = await recordAnalysis(ctx.db, userId, "meal_text", { ...result, latencyMs })
            return { id, ...result, latencyMs }
          },
          readNutritionLabel: async (_root, args: { key: string }, ctx) => {
            const { userId } = requireUser(ctx)
            assertOwnKey(userId, args.key)
            const profileRow = await currentProfile(ctx.db, userId)
            await enforceAiLimit(ctx.db, userId, profileRow?.timezone || "Africa/Johannesburg")
            const stored = await readBytes(args.key)
            const result = await readLabel(stored ? { mime: stored.mime, base64: stored.bytes.toString("base64") } : null)
            await recordAnalysis(ctx.db, userId, "label", result)
            return { ...result, needsManualEntry: result.provider === "local" || result.kcal100g === 0 }
          },
          saveFood: async (_root, args: { input: Record<string, unknown> }, ctx) => {
            const { userId } = requireUser(ctx)
            const input = args.input
            const id = crypto.randomUUID()
            await ctx.db.insert(food).values({
              id,
              source: "label",
              name: String(input.name),
              brand: (input.brand as string) || null,
              kcal100g: Number(input.kcal100g),
              protein100g: Number(input.protein100g),
              carbs100g: Number(input.carbs100g),
              fat100g: Number(input.fat100g),
              fibre100g: input.fibre100g == null ? null : Number(input.fibre100g),
              labelPhotoKey: (input.labelPhotoKey as string) || null,
              createdBy: userId,
            })
            if (input.servingLabel && input.servingGrams) {
              await ctx.db.insert(foodServing).values({
                id: crypto.randomUUID(),
                foodId: id,
                label: String(input.servingLabel),
                grams: Number(input.servingGrams),
              })
            }
            const rows = await ctx.db.select().from(food).where(eq(food.id, id)).limit(1)
            const [shaped] = await withServings(ctx.db, rows)
            return shaped
          },
          saveMeal: async (_root, args: { input: Record<string, unknown> }, ctx) => {
            const { userId } = requireUser(ctx)
            if (typeof args.input.photoKey === "string") assertOwnKey(userId, args.input.photoKey)
            return insertMeal(ctx.db, userId, args.input)
          },
          updateMeal: async (_root, args: { id: string; input: Record<string, unknown> }, ctx) => {
            const { userId } = requireUser(ctx)
            const existing = await ctx.db
              .select()
              .from(meal)
              .where(and(eq(meal.id, args.id), eq(meal.userId, userId)))
              .limit(1)
            if (!existing[0]) throw new GraphQLError("Meal not found.")
            const items = await resolveItems(ctx.db, (args.input.items as Array<Record<string, unknown>>) ?? [])
            const eatenAt = new Date(String(args.input.eatenAt))
            await ctx.db
              .update(meal)
              .set({
                eatenAt,
                slot: String(args.input.slot || existing[0].slot),
                note: (args.input.note as string) || items.map((item) => item.name).join(", "),
                photoKey: (args.input.photoKey as string) || existing[0].photoKey,
                inputType: String(args.input.inputType || existing[0].inputType),
              })
              .where(eq(meal.id, args.id))
            await ctx.db.delete(mealItem).where(eq(mealItem.mealId, args.id))
            await ctx.db.insert(mealItem).values(
              items.map((item) => ({
                id: crypto.randomUUID(),
                mealId: args.id,
                foodId: item.foodId,
                name: item.name,
                grams: item.grams,
                kcal: item.kcal,
                proteinG: item.proteinG,
                carbsG: item.carbsG,
                fatG: item.fatG,
                source: item.source,
                aiConfidence: item.confidence,
                userEdited: true,
              })),
            )
            const saved = await ctx.db.select().from(meal).where(eq(meal.id, args.id)).limit(1)
            return shapeMeal(ctx.db, saved[0])
          },
          deleteMeal: async (_root, args: { id: string }, ctx) => {
            const { userId } = requireUser(ctx)
            await ctx.db.delete(meal).where(and(eq(meal.id, args.id), eq(meal.userId, userId)))
            return true
          },
          logAgain: async (_root, args: { mealId: string; eatenAt?: string | null; slot?: string | null }, ctx) => {
            const { userId } = requireUser(ctx)
            const existing = await ctx.db
              .select()
              .from(meal)
              .where(and(eq(meal.id, args.mealId), eq(meal.userId, userId)))
              .limit(1)
            if (!existing[0]) throw new GraphQLError("Meal not found.")
            const items = await ctx.db.select().from(mealItem).where(eq(mealItem.mealId, args.mealId))
            return insertMeal(ctx.db, userId, {
              eatenAt: args.eatenAt || new Date().toISOString(),
              slot: args.slot || existing[0].slot,
              note: existing[0].note,
              inputType: "search",
              items: items.map((item) => ({
                foodId: item.foodId,
                name: item.name,
                grams: item.grams,
                kcal: item.kcal,
                proteinG: item.proteinG,
                carbsG: item.carbsG,
                fatG: item.fatG,
                source: item.source,
                userEdited: false,
              })),
            })
          },
          deleteAccount: async (_root, _args, ctx) => {
            const { userId } = requireUser(ctx)
            await ctx.db.delete(user).where(eq(user.id, userId))
            return true
          },
        },
      },
    }),
    context: async ({ request }) => {
      const session = await auth.api.getSession({ headers: request.headers })
      return {
        db,
        auth,
        userId: session?.user.id ?? null,
        user: session?.user
          ? {
              id: session.user.id,
              name: session.user.name,
              email: session.user.email,
              image: session.user.image ?? null,
            }
          : null,
      }
    },
    graphqlEndpoint: "/api/graphql",
    landingPage: false,
    maskedErrors: false,
  })
  return yoga
}

function inDay(iso: string, date: string, timeZone: string): boolean {
  const range = zonedDayRange(date, timeZone)
  const time = new Date(iso).getTime()
  return time >= range.start.getTime() && time < range.end.getTime()
}

export function energyLabel(kcal: number, unit: EnergyUnit): number {
  return displayEnergy(kcal, unit)
}

export { matchFood }
