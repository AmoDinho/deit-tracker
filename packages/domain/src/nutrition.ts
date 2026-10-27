export type Nutrition = {
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  fibreG?: number
}

export type Per100g = {
  kcal100g: number
  protein100g: number
  carbs100g: number
  fat100g: number
  fibre100g?: number | null
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function nutritionForGrams(food: Per100g, grams: number): Nutrition {
  const factor = grams / 100
  return {
    kcal: round1(food.kcal100g * factor),
    proteinG: round1(food.protein100g * factor),
    carbsG: round1(food.carbs100g * factor),
    fatG: round1(food.fat100g * factor),
    fibreG: food.fibre100g == null ? undefined : round1(food.fibre100g * factor),
  }
}

export function sumNutrition(items: Nutrition[]): Nutrition {
  return items.reduce(
    (total, item) => ({
      kcal: round1(total.kcal + item.kcal),
      proteinG: round1(total.proteinG + item.proteinG),
      carbsG: round1(total.carbsG + item.carbsG),
      fatG: round1(total.fatG + item.fatG),
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  )
}

export function displayEnergy(kcal: number, unit: "kcal" | "kJ"): number {
  if (unit === "kJ") return Math.round(kcal * 4.184)
  return Math.round(kcal)
}
