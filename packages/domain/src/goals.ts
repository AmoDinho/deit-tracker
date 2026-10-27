export const ACTIVITY_LEVELS = [
  { id: "sedentary", label: "Sedentary", detail: "Desk day, little exercise", multiplier: 1.2 },
  { id: "light", label: "Light", detail: "1–3 easy sessions a week", multiplier: 1.375 },
  { id: "moderate", label: "Moderate", detail: "3–5 sessions a week", multiplier: 1.55 },
  { id: "very", label: "Very active", detail: "Hard training, 6–7 days", multiplier: 1.725 },
  { id: "extra", label: "Extra active", detail: "Physical job plus training", multiplier: 1.9 },
] as const

export const GOAL_OPTIONS = [
  { id: "lose_fast", goalType: "lose", paceKg: 0.5, label: "Lose ~0.5 kg / week", adjustment: -500 },
  { id: "lose_slow", goalType: "lose", paceKg: 0.25, label: "Lose ~0.25 kg / week", adjustment: -250 },
  { id: "maintain", goalType: "maintain", paceKg: 0, label: "Maintain", adjustment: 0 },
  { id: "gain", goalType: "gain", paceKg: 0.25, label: "Gain, lean bulk", adjustment: 250 },
] as const

export type ActivityId = (typeof ACTIVITY_LEVELS)[number]["id"]
export type GoalOptionId = (typeof GOAL_OPTIONS)[number]["id"]
export type Sex = "male" | "female"
export type EnergyUnit = "kcal" | "kJ"

export type BodyStats = {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  activity: ActivityId
  goal: GoalOptionId
  proteinPerKg?: number
  fatPercent?: number
}

export type TargetBreakdown = {
  bmr: number
  activityMultiplier: number
  tdee: number
  adjustment: number
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  proteinPerKg: number
  fatPercent: number
  warnings: string[]
}

const KJ_PER_KCAL = 4.184

export function kjToKcal(kj: number): number {
  return kj / KJ_PER_KCAL
}

export function kcalToKj(kcal: number): number {
  return kcal * KJ_PER_KCAL
}

export function ageFromBirthDate(birthDate: string, today = new Date()): number {
  const born = new Date(birthDate)
  let age = today.getUTCFullYear() - born.getUTCFullYear()
  const month = today.getUTCMonth() - born.getUTCMonth()
  if (month < 0 || (month === 0 && today.getUTCDate() < born.getUTCDate())) age -= 1
  return age
}

export function birthDateFromAge(age: number, today = new Date()): string {
  const year = today.getUTCFullYear() - age
  const month = String(today.getUTCMonth() + 1).padStart(2, "0")
  const day = String(today.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function round(value: number): number {
  return Math.round(value)
}

export function calculateTargets(stats: BodyStats): TargetBreakdown {
  const activity = ACTIVITY_LEVELS.find((item) => item.id === stats.activity) ?? ACTIVITY_LEVELS[2]
  const goal = GOAL_OPTIONS.find((item) => item.id === stats.goal) ?? GOAL_OPTIONS[0]
  const sexOffset = stats.sex === "male" ? 5 : -161
  const bmrRaw = 10 * stats.weightKg + 6.25 * stats.heightCm - 5 * stats.age + sexOffset
  const bmr = round(bmrRaw)
  const tdee = round(bmr * activity.multiplier)
  let adjustment = goal.adjustment
  const warnings: string[] = []

  const maxLossPerDay = (stats.weightKg * 0.01 * 7700) / 7
  if (adjustment < 0 && Math.abs(adjustment) > maxLossPerDay) {
    adjustment = -round(maxLossPerDay)
    warnings.push("Loss pace was capped at 1% of body weight per week.")
  }

  let calories = tdee + adjustment
  const floor = stats.sex === "male" ? 1500 : 1200
  if (calories < floor) {
    warnings.push(
      `This target is under ${floor.toLocaleString("en-ZA")} kcal. It was raised to that floor. Talk to a dietitian before going lower.`,
    )
    calories = floor
  }

  const proteinPerKg = stats.proteinPerKg ?? 1.8
  const fatPercent = stats.fatPercent ?? 0.27
  const proteinG = round(stats.weightKg * proteinPerKg)
  const fatG = round((calories * fatPercent) / 9)
  const carbsG = Math.max(0, round((calories - proteinG * 4 - fatG * 9) / 4))

  warnings.push(
    "Have a medical condition or a history of disordered eating? Talk to a registered dietitian before following a calorie target.",
  )

  return {
    bmr,
    activityMultiplier: activity.multiplier,
    tdee,
    adjustment,
    calories,
    proteinG,
    carbsG,
    fatG,
    proteinPerKg,
    fatPercent,
    warnings,
  }
}

export function goalOptionFromProfile(goalType: string, paceKg: number): GoalOptionId {
  if (goalType === "gain") return "gain"
  if (goalType === "maintain" || paceKg === 0) return "maintain"
  if (paceKg <= 0.3) return "lose_slow"
  return "lose_fast"
}
