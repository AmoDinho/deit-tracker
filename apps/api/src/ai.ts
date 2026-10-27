import { kjToKcal, nutritionForGrams, type Per100g } from "@deit/domain"
import { z } from "zod"

export const PROMPT_VERSION = "2026-10-27"

const mealSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      grams: z.number().positive(),
      confidence: z.number().min(0).max(1).optional(),
      cooking_method: z.string().optional(),
    }),
  ),
  question: z.string().nullable().optional(),
})

const labelSchema = z.object({
  name: z.string(),
  brand: z.string().nullable().optional(),
  energy_kj: z.number().nullable().optional(),
  energy_kcal: z.number().nullable().optional(),
  protein_100g: z.number(),
  carbs_100g: z.number(),
  fat_100g: z.number(),
  fibre_100g: z.number().nullable().optional(),
})

export type CatalogFood = Per100g & {
  id: string
  name: string
  source: string
  brand?: string | null
}

export type ParsedItem = {
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

export type MealParse = {
  items: ParsedItem[]
  question: string | null
  provider: string
  model: string
  raw: string
}

const MEAL_PROMPT = `You identify food on a plate or in a description. Reply with JSON only:
{"items":[{"name":"","grams":0,"confidence":0.0,"cooking_method":""}],"question":null}
Rules:
- Name foods a nutrition database would have (generic, cooked state).
- Estimate edible grams. Ask about hidden fats: oils, butter, sauces, frying.
- If confidence is below 0.6, set question to one short follow-up, otherwise null.
- Do not invent calorie numbers. Grams and names only.`

const LABEL_PROMPT = `Read the nutrition label. Reply with JSON only:
{"name":"","brand":null,"energy_kj":null,"energy_kcal":null,"protein_100g":0,"carbs_100g":0,"fat_100g":0,"fibre_100g":null}
Use the per 100 g column. South African labels lead with kilojoules — put that in energy_kj. Do not convert.`

function configured() {
  return Boolean(process.env.AI_API_KEY)
}

function baseUrl() {
  return (process.env.AI_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "")
}

function visionModel() {
  return process.env.AI_VISION_MODEL || "deepseek-flash"
}

function textModel() {
  return process.env.AI_TEXT_MODEL || process.env.AI_VISION_MODEL || "deepseek-flash"
}

async function complete(model: string, content: unknown): Promise<{ text: string; tokens: number }> {
  const response = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [{ role: "user", content }],
    }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`AI provider returned ${response.status}: ${body.slice(0, 180)}`)
  }
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { total_tokens?: number }
  }
  const text = json.choices?.[0]?.message?.content ?? ""
  return { text, tokens: json.usage?.total_tokens ?? 0 }
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced?.[1] ?? text
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end < start) throw new Error("The model did not return JSON.")
  return JSON.parse(raw.slice(start, end + 1))
}

export function matchFood(name: string, foods: CatalogFood[]): CatalogFood | null {
  const query = name.toLowerCase().replace(/[^a-z0-9\s]/g, " ")
  const tokens = query.split(/\s+/).filter((token) => token.length > 2 && !["cooked", "with", "and"].includes(token))
  let best: { food: CatalogFood; score: number } | null = null
  for (const food of foods) {
    const candidate = food.name.toLowerCase()
    let score = 0
    if (candidate === query) score = 1
    else if (candidate.includes(query) || query.includes(candidate)) score = 0.86
    else {
      const hits = tokens.filter((token) => candidate.includes(token)).length
      score = tokens.length ? hits / tokens.length : 0
    }
    if (!best || score > best.score) best = { food, score }
  }
  if (!best || best.score < 0.45) return null
  return best.food
}

function toItem(name: string, grams: number, confidence: number, foods: CatalogFood[], fallback?: Per100g): ParsedItem {
  const food = matchFood(name, foods)
  if (food) {
    const nutrition = nutritionForGrams(food, grams)
    return {
      name: food.name,
      grams,
      confidence,
      foodId: food.id,
      source: food.source,
      ...nutrition,
      lowConfidence: confidence < 0.6,
    }
  }
  const basis = fallback ?? { kcal100g: 150, protein100g: 8, carbs100g: 12, fat100g: 7 }
  const nutrition = nutritionForGrams(basis, grams)
  return {
    name,
    grams,
    confidence,
    foodId: null,
    source: "ai",
    ...nutrition,
    lowConfidence: true,
  }
}

const COUNTS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 }

function clauseGrams(clause: string): number {
  const explicit = clause.match(/(\d+(?:\.\d+)?)\s*g\b/i)
  if (explicit) return Number(explicit[1])
  const countMatch = clause.match(/\b(\d+(?:\.\d+)?|a|an|one|two|three|four)\b/i)
  const count = countMatch ? (COUNTS[countMatch[1].toLowerCase()] ?? Number(countMatch[1])) : 1
  if (/tablespoon|tbsp/i.test(clause)) return 16 * count
  if (/teaspoon|tsp/i.test(clause)) return 5 * count
  if (/slice/i.test(clause)) return 38 * count
  if (/cup/i.test(clause)) return 240 * count
  if (/bowl/i.test(clause)) return 300 * count
  if (/egg/i.test(clause)) return 50 * count
  if (/piece|fillet|breast/i.test(clause)) return 120 * count
  return 100 * (Number.isFinite(count) ? count : 1)
}

export function parseLocalText(text: string, foods: CatalogFood[]): MealParse {
  const clauses = text
    .split(/\s*(?:,| and | with | plus |\+)\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 1)
  const items = (clauses.length ? clauses : [text]).map((clause) =>
    toItem(clause, clauseGrams(clause), 0.55, foods),
  )
  const oily = /fried|curry|stir-?fry|braai|roast|sauce/i.test(text)
  const hasOil = items.some((item) => /oil|butter|ghee/i.test(item.name))
  if (oily && !hasOil) {
    items.push(toItem("Sunflower oil", 8, 0.35, foods))
  }
  return {
    items,
    question: oily && !/oil|butter/i.test(text) ? "Was this cooked in oil?" : null,
    provider: "local",
    model: "keyword-match",
    raw: JSON.stringify({ text }),
  }
}

export async function parseMealText(text: string, foods: CatalogFood[]): Promise<MealParse & { tokens: number }> {
  if (!configured()) return { ...parseLocalText(text, foods), tokens: 0 }
  const started = Date.now()
  const { text: raw, tokens } = await complete(textModel(), `${MEAL_PROMPT}\n\nDescription: ${text}`)
  const parsed = mealSchema.parse(extractJson(raw))
  return {
    items: parsed.items.map((item) => toItem(item.name, item.grams, item.confidence ?? 0.7, foods)),
    question: parsed.question ?? null,
    provider: "openai-compatible",
    model: textModel(),
    raw,
    tokens,
    latencyMs: Date.now() - started,
  } as MealParse & { tokens: number; latencyMs: number }
}

export async function analyzeMealPhoto(
  image: { mime: string; base64: string } | { url: string },
  foods: CatalogFood[],
): Promise<MealParse & { tokens: number; latencyMs: number }> {
  if (!configured()) {
    return {
      items: [toItem("Mixed meal", 350, 0.3, foods)],
      question: "What was the main food? You can edit every item before saving.",
      provider: "local",
      model: "keyword-match",
      raw: "no-api-key",
      tokens: 0,
      latencyMs: 0,
    }
  }
  const imagePart =
    "url" in image
      ? { type: "image_url", image_url: { url: image.url } }
      : { type: "image_url", image_url: { url: `data:${image.mime};base64,${image.base64}` } }
  const started = Date.now()
  const { text: raw, tokens } = await complete(visionModel(), [
    { type: "text", text: MEAL_PROMPT },
    imagePart,
  ])
  const parsed = mealSchema.parse(extractJson(raw))
  return {
    items: parsed.items.map((item) => toItem(item.name, item.grams, item.confidence ?? 0.7, foods)),
    question: parsed.question ?? null,
    provider: "openai-compatible",
    model: visionModel(),
    raw,
    tokens,
    latencyMs: Date.now() - started,
  }
}

export async function readLabel(
  image: { mime: string; base64: string } | { url: string } | null,
): Promise<{
  name: string
  brand: string | null
  energyKj: number | null
  kcal100g: number
  protein100g: number
  carbs100g: number
  fat100g: number
  fibre100g: number | null
  provider: string
  model: string
  raw: string
  tokens: number
  latencyMs: number
}> {
  if (!configured() || !image) {
    return {
      name: "",
      brand: null,
      energyKj: null,
      kcal100g: 0,
      protein100g: 0,
      carbs100g: 0,
      fat100g: 0,
      fibre100g: null,
      provider: "local",
      model: "manual",
      raw: "no-api-key",
      tokens: 0,
      latencyMs: 0,
    }
  }
  const imagePart =
    "url" in image
      ? { type: "image_url", image_url: { url: image.url } }
      : { type: "image_url", image_url: { url: `data:${image.mime};base64,${image.base64}` } }
  const started = Date.now()
  const { text: raw, tokens } = await complete(visionModel(), [
    { type: "text", text: LABEL_PROMPT },
    imagePart,
  ])
  const parsed = labelSchema.parse(extractJson(raw))
  const kcal100g =
    parsed.energy_kj != null
      ? Math.round(kjToKcal(parsed.energy_kj))
      : Math.round(parsed.energy_kcal ?? 0)
  return {
    name: parsed.name,
    brand: parsed.brand ?? null,
    energyKj: parsed.energy_kj ?? null,
    kcal100g,
    protein100g: parsed.protein_100g,
    carbs100g: parsed.carbs_100g,
    fat100g: parsed.fat_100g,
    fibre100g: parsed.fibre_100g ?? null,
    provider: "openai-compatible",
    model: visionModel(),
    raw,
    tokens,
    latencyMs: Date.now() - started,
  }
}
