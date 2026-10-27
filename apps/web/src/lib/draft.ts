import { nutritionForGrams } from "@deit/domain"
import { per100 } from "./format"
import type { Analysis, DraftItem, Food, Meal, MealDraft, MealItem } from "./types"

const KEY = "deit.draft"

export function newKey(): string {
  return crypto.randomUUID()
}

export function readDraft(): MealDraft | null {
  const raw = sessionStorage.getItem(KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as MealDraft
  } catch {
    return null
  }
}

export function writeDraft(draft: MealDraft): void {
  sessionStorage.setItem(KEY, JSON.stringify(draft))
}

export function clearDraft(): void {
  sessionStorage.removeItem(KEY)
}

export function emptyDraft(partial: Partial<MealDraft> = {}): MealDraft {
  return {
    editingId: null,
    analysisId: null,
    inputType: "search",
    slot: "dinner",
    eatenAt: new Date().toISOString(),
    note: "",
    photoKey: null,
    photoPreview: null,
    question: null,
    questionAnswered: false,
    latencyMs: null,
    split: false,
    items: [],
    ...partial,
  }
}

export function itemFromAnalysis(item: Analysis["items"][number]): DraftItem {
  const base = per100(item)
  return {
    key: newKey(),
    foodId: item.foodId,
    name: item.name,
    grams: item.grams,
    baseGrams: item.grams,
    ...base,
    source: item.source,
    confidence: item.confidence,
    userEdited: false,
    lowConfidence: item.lowConfidence || item.confidence < 0.5,
  }
}

export function itemFromMeal(item: MealItem): DraftItem {
  const base = per100(item)
  return {
    key: item.id,
    foodId: item.foodId,
    name: item.name,
    grams: item.grams,
    baseGrams: item.grams,
    ...base,
    source: item.source,
    confidence: item.confidence,
    userEdited: item.userEdited,
    lowConfidence: (item.confidence ?? 1) < 0.5,
  }
}

export function itemFromFood(food: Food, grams: number): DraftItem {
  return {
    key: newKey(),
    foodId: food.id,
    name: food.name,
    grams,
    baseGrams: grams,
    kcal100g: food.kcal100g,
    protein100g: food.protein100g,
    carbs100g: food.carbs100g,
    fat100g: food.fat100g,
    source: food.source,
    confidence: null,
    userEdited: false,
    lowConfidence: false,
  }
}

export function draftFromMeal(meal: Meal): MealDraft {
  return emptyDraft({
    editingId: meal.id,
    inputType: meal.inputType,
    slot: meal.slot,
    eatenAt: meal.eatenAt,
    note: meal.note ?? "",
    photoKey: meal.photoKey,
    photoPreview: meal.photoUrl,
    items: meal.items.map(itemFromMeal),
  })
}

export function draftFromAnalysis(
  analysis: Analysis,
  extra: Partial<MealDraft>,
): MealDraft {
  return emptyDraft({
    ...extra,
    analysisId: analysis.id,
    question: analysis.question,
    latencyMs: analysis.latencyMs,
    items: analysis.items.map(itemFromAnalysis),
  })
}

export function withGrams(item: DraftItem, grams: number): DraftItem {
  return { ...item, grams: Math.max(0, grams), userEdited: true }
}

export function applySplit(draft: MealDraft, split: boolean): MealDraft {
  return {
    ...draft,
    split,
    items: draft.items.map((item) => {
      const grams = split ? item.baseGrams / 2 : item.baseGrams
      return { ...item, grams, userEdited: split || item.userEdited }
    }),
  }
}

export function nutritionOf(item: DraftItem) {
  return nutritionForGrams(item, item.grams)
}
