import { addDays, todayIso, zonedTimeToUtc } from "@deit/domain"
import { eq } from "drizzle-orm"
import type { Auth } from "./auth.ts"
import type { Database } from "./db.ts"
import { seedFoods } from "./foods.ts"
import { food, foodServing, goal, meal, mealItem, profile, user } from "./schema.ts"

const DEMO_EMAIL = "demo@deit.app"
const DEMO_PASSWORD = "demopass"
const TIMEZONE = "Africa/Johannesburg"

export async function seedReferenceFoods(db: Database) {
  for (const item of seedFoods) {
    await db
      .insert(food)
      .values({
        id: item.id,
        source: item.source,
        sourceRef: item.sourceRef ?? null,
        name: item.name,
        brand: item.brand ?? null,
        kcal100g: item.kcal100g,
        protein100g: item.protein100g,
        carbs100g: item.carbs100g,
        fat100g: item.fat100g,
        fibre100g: item.fibre100g ?? null,
      })
      .onConflictDoNothing()
    for (const [index, serving] of (item.servings ?? []).entries()) {
      await db
        .insert(foodServing)
        .values({
          id: `${item.id}-serving-${index}`,
          foodId: item.id,
          label: serving.label,
          grams: serving.grams,
        })
        .onConflictDoNothing()
    }
  }
}

type ItemSeed = {
  foodId: string
  name: string
  grams: number
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  source: string
}

async function insertMeal(
  db: Database,
  userId: string,
  input: { at: Date; slot: string; note: string; inputType: string; items: ItemSeed[] },
) {
  const id = crypto.randomUUID()
  await db.insert(meal).values({
    id,
    userId,
    eatenAt: input.at,
    slot: input.slot,
    note: input.note,
    inputType: input.inputType,
  })
  await db.insert(mealItem).values(
    input.items.map((item) => ({
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
      userEdited: false,
    })),
  )
}

function at(date: string, time: string) {
  return zonedTimeToUtc(`${date}T${time}:00`, TIMEZONE)
}

export async function seedDemo(db: Database, auth: Auth) {
  if (process.env.SEED_DEMO === "false") return
  const existing = await db.select().from(user).where(eq(user.email, DEMO_EMAIL)).limit(1)
  let userId = existing[0]?.id
  if (!userId) {
    try {
      const signed = await auth.api.signUpEmail({
        body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Alex Demo" },
      })
      userId = signed.user.id
    } catch (error) {
      const again = await db.select().from(user).where(eq(user.email, DEMO_EMAIL)).limit(1)
      userId = again[0]?.id
      if (!userId) throw error
    }
  }

  const already = await db.select().from(meal).where(eq(meal.userId, userId)).limit(1)
  if (already.length) return

  await db
    .insert(profile)
    .values({
      userId,
      sex: "male",
      birthDate: "1996-10-27",
      heightCm: 178,
      weightKg: 78,
      activityLevel: "moderate",
      goalType: "lose",
      goalPace: 0.5,
      energyUnit: "kcal",
      timezone: TIMEZONE,
      onboarded: true,
    })
    .onConflictDoUpdate({
      target: profile.userId,
      set: { onboarded: true, timezone: TIMEZONE, heightCm: 178, weightKg: 78 },
    })

  await db.insert(goal).values({
    id: crypto.randomUUID(),
    userId,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    calories: 2210,
    proteinG: 140,
    carbsG: 263,
    fatG: 66,
    source: "calculated",
  })

  const today = todayIso(TIMEZONE)
  const yesterday = addDays(today, -1)

  await insertMeal(db, userId, {
    at: at(today, "07:40"),
    slot: "breakfast",
    note: "2 eggs, toast with butter",
    inputType: "photo",
    items: [
      { foodId: "food_egg", name: "Egg, whole, cooked", grams: 100, kcal: 170, proteinG: 13, carbsG: 2, fatG: 11, source: "usda" },
      { foodId: "food_bread", name: "Bread, white", grams: 60, kcal: 160, proteinG: 6, carbsG: 32, fatG: 3, source: "usda" },
      { foodId: "food_butter", name: "Butter", grams: 12, kcal: 90, proteinG: 1, carbsG: 6, fatG: 6, source: "usda" },
    ],
  })
  await insertMeal(db, userId, {
    at: at(today, "13:05"),
    slot: "lunch",
    note: "Chicken curry with rice",
    inputType: "text",
    items: [
      { foodId: "food_curry", name: "Chicken curry", grams: 270, kcal: 380, proteinG: 38, carbsG: 16, fatG: 11, source: "user" },
      { foodId: "food_rice", name: "White rice, cooked", grams: 145, kcal: 189, proteinG: 4, carbsG: 59, fatG: 0, source: "usda" },
      { foodId: "food_oil", name: "Sunflower oil", grams: 8, kcal: 71, proteinG: 0, carbsG: 0, fatG: 8, source: "usda" },
    ],
  })
  await insertMeal(db, userId, {
    at: at(today, "10:30"),
    slot: "snack",
    note: "Crunchy peanut butter, 32 g",
    inputType: "label",
    items: [
      { foodId: "food_pb", name: "Crunchy peanut butter", grams: 32, kcal: 190, proteinG: 8, carbsG: 5, fatG: 16, source: "label" },
    ],
  })

  await insertMeal(db, userId, {
    at: at(yesterday, "07:30"),
    slot: "breakfast",
    note: "Oats with banana & whey",
    inputType: "search",
    items: [
      { foodId: "food_oats", name: "Oats, dry", grams: 40, kcal: 250, proteinG: 8, carbsG: 40, fatG: 5, source: "usda" },
      { foodId: "food_banana", name: "Banana", grams: 118, kcal: 105, proteinG: 1, carbsG: 27, fatG: 0, source: "usda" },
      { foodId: "food_whey", name: "Whey protein", grams: 30, kcal: 125, proteinG: 24, carbsG: 2, fatG: 2, source: "usda" },
    ],
  })
  await insertMeal(db, userId, {
    at: at(yesterday, "12:50"),
    slot: "lunch",
    note: "Chicken wrap",
    inputType: "search",
    items: [{ foodId: "food_wrap", name: "Chicken wrap", grams: 300, kcal: 560, proteinG: 36, carbsG: 54, fatG: 21, source: "user" }],
  })
  await insertMeal(db, userId, {
    at: at(yesterday, "19:15"),
    slot: "dinner",
    note: "Bobotie & yellow rice",
    inputType: "search",
    items: [
      { foodId: "food_bobotie", name: "Bobotie", grams: 250, kcal: 438, proteinG: 30, carbsG: 20, fatG: 25, source: "user" },
      { foodId: "food_yellow_rice", name: "Yellow rice", grams: 120, kcal: 172, proteinG: 4, carbsG: 34, fatG: 3, source: "user" },
    ],
  })
  await insertMeal(db, userId, {
    at: at(yesterday, "16:10"),
    slot: "snack",
    note: "Beef biltong, apple",
    inputType: "search",
    items: [
      { foodId: "food_biltong", name: "Beef biltong", grams: 40, kcal: 100, proteinG: 18, carbsG: 2, fatG: 2, source: "user" },
      { foodId: "food_apple", name: "Apple", grams: 180, kcal: 400, proteinG: 15, carbsG: 70, fatG: 4, source: "usda" },
    ],
  })

  const fillers: Array<{ offset: number; note: string; kcal: number; protein: number }> = [
    { offset: -2, note: "Boerewors and pap", kcal: 2180, protein: 120 },
    { offset: -3, note: "Bunny chow, chicken", kcal: 2320, protein: 132 },
    { offset: -4, note: "Yogurt, fruit and toast", kcal: 1980, protein: 118 },
    { offset: -5, note: "Chicken curry with rice", kcal: 2400, protein: 140 },
    { offset: -6, note: "Pap & chakalaka", kcal: 2230, protein: 126 },
  ]
  for (const filler of fillers) {
    const date = addDays(today, filler.offset)
    const parts = [0.28, 0.4, 0.32]
    const slots = ["breakfast", "lunch", "dinner"] as const
    const times = ["08:00", "13:00", "19:30"]
    for (const [index, slot] of slots.entries()) {
      const kcal = Math.round(filler.kcal * parts[index])
      const protein = Math.round(filler.protein * parts[index])
      await insertMeal(db, userId, {
        at: at(date, times[index]),
        slot,
        note: filler.note,
        inputType: "search",
        items: [
          {
            foodId: "food_pap_stiff",
            name: filler.note,
            grams: 300,
            kcal,
            proteinG: protein,
            carbsG: Math.round((kcal * 0.45) / 4),
            fatG: Math.round((kcal * 0.3) / 9),
            source: "user",
          },
        ],
      })
    }
  }
}
