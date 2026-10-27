export type EnergyUnit = "kcal" | "kJ"
export type Slot = "breakfast" | "lunch" | "dinner" | "snack"

export type User = {
  id: string
  name: string
  email: string
  image: string | null
}

export type Profile = {
  sex: string | null
  birthDate: string | null
  age: number | null
  heightCm: number | null
  weightKg: number | null
  activityLevel: string | null
  goalType: string | null
  goalPace: number | null
  goalOption: string | null
  energyUnit: EnergyUnit
  timezone: string
  onboarded: boolean
}

export type Goal = {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  source: string
  effectiveFrom: string
  bmr: number | null
  tdee: number | null
  adjustment: number | null
  activityMultiplier: number | null
  warnings: string[]
}

export type Me = {
  user: User
  profile: Profile | null
  goal: Goal | null
  googleEnabled: boolean
}

export type Serving = {
  id: string
  label: string
  grams: number
}

export type Food = {
  id: string
  source: string
  name: string
  brand: string | null
  kcal100g: number
  protein100g: number
  carbs100g: number
  fat100g: number
  fibre100g: number | null
  servings: Serving[]
}

export type MealItem = {
  id: string
  foodId: string | null
  name: string
  grams: number
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  source: string | null
  confidence: number | null
  userEdited: boolean
}

export type Meal = {
  id: string
  eatenAt: string
  slot: string
  note: string | null
  photoKey: string | null
  photoUrl: string | null
  inputType: string
  items: MealItem[]
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

export type DailySummary = {
  date: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  target: Goal | null
  meals: Meal[]
}

export type DayTotal = {
  date: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  logged: boolean
}

export type WeekSummary = {
  start: string
  end: string
  days: DayTotal[]
  avgCalories: number
  avgProtein: number
  avgCarbs: number
  avgFat: number
  daysLogged: number
  daysInWeek: number
}

export type AnalysisItem = {
  name: string
  grams: number
  confidence: number
  foodId: string | null
  source: string | null
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  lowConfidence: boolean
}

export type Analysis = {
  id: string
  items: AnalysisItem[]
  question: string | null
  latencyMs: number
  provider: string
  model: string
}

export type LabelRead = {
  name: string
  brand: string | null
  energyKj: number | null
  kcal100g: number
  protein100g: number
  carbs100g: number
  fat100g: number
  fibre100g: number | null
  provider: string
  needsManualEntry: boolean
}

export type DraftItem = {
  key: string
  foodId: string | null
  name: string
  grams: number
  baseGrams: number
  kcal100g: number
  protein100g: number
  carbs100g: number
  fat100g: number
  source: string | null
  confidence: number | null
  userEdited: boolean
  lowConfidence: boolean
}

export type MealDraft = {
  editingId: string | null
  analysisId: string | null
  inputType: string
  slot: string
  eatenAt: string
  note: string
  photoKey: string | null
  photoPreview: string | null
  question: string | null
  questionAnswered: boolean
  latencyMs: number | null
  split: boolean
  items: DraftItem[]
}
