import type {
  Analysis,
  DailySummary,
  Food,
  Goal,
  LabelRead,
  Me,
  Meal,
  Profile,
  WeekSummary,
} from "./types"

export const API_BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? ""

export class ApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ApiError"
  }
}

export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith("http") || url.startsWith("blob:")) return url
  return `${API_BASE}${url}`
}

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE}/api/graphql`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  })
  const payload = (await response.json().catch(() => null)) as {
    data?: T
    errors?: Array<{ message: string }>
  } | null
  if (!response.ok || payload?.errors?.length) {
    throw new ApiError(payload?.errors?.[0]?.message || "Request failed.")
  }
  if (!payload?.data) throw new ApiError("Empty response from the API.")
  return payload.data
}

const MEAL_FIELDS = `
  id eatenAt slot note photoKey photoUrl inputType kcal proteinG carbsG fatG
  items { id foodId name grams kcal proteinG carbsG fatG source confidence userEdited }
`

export const ME_QUERY = /* GraphQL */ `
  query Me {
    googleEnabled
    me {
      user { id name email image }
      googleEnabled
      profile {
        sex birthDate age heightCm weightKg activityLevel goalType goalPace goalOption
        energyUnit timezone onboarded
      }
      goal {
        calories proteinG carbsG fatG source effectiveFrom
        bmr tdee adjustment activityMultiplier warnings
      }
    }
  }
`

export async function fetchDay(date: string) {
  return gql<{ dailySummary: DailySummary; recentMeals: Meal[] }>(
    `query Daily($date: String!) {
      dailySummary(date: $date) {
        date calories proteinG carbsG fatG
        target { calories proteinG carbsG fatG source effectiveFrom bmr tdee adjustment activityMultiplier warnings }
        meals { ${MEAL_FIELDS} }
      }
      recentMeals(limit: 12) { ${MEAL_FIELDS} }
    }`,
    { date },
  )
}

export async function fetchWeek(start: string) {
  return gql<{ weekSummary: WeekSummary }>(
    `query Week($start: String!) {
      weekSummary(start: $start) {
        start end avgCalories avgProtein avgCarbs avgFat daysLogged daysInWeek
        days { date calories proteinG carbsG fatG logged }
      }
    }`,
    { start },
  )
}

export async function fetchMeal(id: string) {
  const data = await gql<{ meal: Meal | null }>(`query Meal($id: ID!) { meal(id: $id) { ${MEAL_FIELDS} } }`, { id })
  return data.meal
}

export async function searchFoods(q: string, source?: string | null) {
  const data = await gql<{ searchFoods: Food[] }>(
    `query Search($q: String!, $source: String) {
      searchFoods(q: $q, source: $source) {
        id source name brand kcal100g protein100g carbs100g fat100g fibre100g
        servings { id label grams }
      }
    }`,
    { q, source: source || null },
  )
  return data.searchFoods
}

export async function completeOnboarding(input: Record<string, unknown>) {
  const data = await gql<{ completeOnboarding: Me }>(
    `mutation Onboard($input: OnboardingInput!) {
      completeOnboarding(input: $input) {
        user { id name email image }
        googleEnabled
        profile { sex birthDate age heightCm weightKg activityLevel goalType goalPace goalOption energyUnit timezone onboarded }
        goal { calories proteinG carbsG fatG source effectiveFrom bmr tdee adjustment activityMultiplier warnings }
      }
    }`,
    { input },
  )
  return data.completeOnboarding
}

export async function setGoals(input: { calories: number; proteinG: number; carbsG: number; fatG: number }) {
  const data = await gql<{ setGoals: Goal }>(
    `mutation Goals($input: GoalInput!) {
      setGoals(input: $input) { calories proteinG carbsG fatG source effectiveFrom bmr tdee adjustment activityMultiplier warnings }
    }`,
    { input },
  )
  return data.setGoals
}

export async function updatePreferences(energyUnit: string, timezone?: string) {
  const data = await gql<{ updatePreferences: Profile }>(
    `mutation Prefs($energyUnit: String, $timezone: String) {
      updatePreferences(energyUnit: $energyUnit, timezone: $timezone) {
        sex birthDate age heightCm weightKg activityLevel goalType goalPace goalOption energyUnit timezone onboarded
      }
    }`,
    { energyUnit, timezone },
  )
  return data.updatePreferences
}

export async function analyzeMealPhoto(key: string) {
  const data = await gql<{ analyzeMealPhoto: Analysis }>(
    `mutation Photo($key: String!) {
      analyzeMealPhoto(key: $key) {
        id question latencyMs provider model
        items { name grams confidence foodId source kcal proteinG carbsG fatG lowConfidence }
      }
    }`,
    { key },
  )
  return data.analyzeMealPhoto
}

export async function parseMealText(text: string) {
  const data = await gql<{ parseMealText: Analysis }>(
    `mutation Text($text: String!) {
      parseMealText(text: $text) {
        id question latencyMs provider model
        items { name grams confidence foodId source kcal proteinG carbsG fatG lowConfidence }
      }
    }`,
    { text },
  )
  return data.parseMealText
}

export async function readNutritionLabel(key: string) {
  const data = await gql<{ readNutritionLabel: LabelRead }>(
    `mutation Label($key: String!) {
      readNutritionLabel(key: $key) {
        name brand energyKj kcal100g protein100g carbs100g fat100g fibre100g provider needsManualEntry
      }
    }`,
    { key },
  )
  return data.readNutritionLabel
}

export async function saveFood(input: Record<string, unknown>) {
  const data = await gql<{ saveFood: Food }>(
    `mutation SaveFood($input: FoodInput!) {
      saveFood(input: $input) {
        id source name brand kcal100g protein100g carbs100g fat100g fibre100g
        servings { id label grams }
      }
    }`,
    { input },
  )
  return data.saveFood
}

export async function saveMeal(input: Record<string, unknown>) {
  const data = await gql<{ saveMeal: Meal }>(
    `mutation SaveMeal($input: MealInput!) { saveMeal(input: $input) { ${MEAL_FIELDS} } }`,
    { input },
  )
  return data.saveMeal
}

export async function updateMeal(id: string, input: Record<string, unknown>) {
  const data = await gql<{ updateMeal: Meal }>(
    `mutation UpdateMeal($id: ID!, $input: MealInput!) { updateMeal(id: $id, input: $input) { ${MEAL_FIELDS} } }`,
    { id, input },
  )
  return data.updateMeal
}

export async function deleteMeal(id: string) {
  await gql(`mutation Delete($id: ID!) { deleteMeal(id: $id) }`, { id })
}

export async function logAgain(mealId: string, eatenAt?: string, slot?: string) {
  const data = await gql<{ logAgain: Meal }>(
    `mutation Again($mealId: ID!, $eatenAt: String, $slot: String) {
      logAgain(mealId: $mealId, eatenAt: $eatenAt, slot: $slot) { ${MEAL_FIELDS} }
    }`,
    { mealId, eatenAt, slot },
  )
  return data.logAgain
}

export async function deleteAccount() {
  await gql(`mutation { deleteAccount }`)
}
