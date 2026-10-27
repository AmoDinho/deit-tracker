import { displayEnergy, nutritionForGrams, type EnergyUnit } from "@deit/domain"
import type { DraftItem, Meal } from "./types"

export const SLOTS = [
  { id: "breakfast", label: "Breakfast", short: "Breakfast" },
  { id: "lunch", label: "Lunch", short: "Lunch" },
  { id: "dinner", label: "Dinner", short: "Dinner" },
  { id: "snack", label: "Snacks", short: "Snack" },
] as const

export function slotLabel(slot: string, plural = true): string {
  const found = SLOTS.find((item) => item.id === slot)
  if (!found) return slot
  return plural ? found.label : found.short
}

export function defaultSlot(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 10) return "breakfast"
  if (hour < 15) return "lunch"
  if (hour < 21) return "dinner"
  return "snack"
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("en-US")
}

export const formatMacro = formatNumber
export const eyebrowDate = formatEyebrowDate
export const formatTime = formatClock
export const inputTypeLabel = inputLabel
export const weekRangeLabel = formatWeekRange
export const longDay = formatLongDay
export const shortWeekday = weekdayLetter

export function energyValue(kcal: number, unit: EnergyUnit): number {
  return displayEnergy(kcal, unit)
}

export function energySuffix(unit: EnergyUnit): string {
  return unit === "kJ" ? "kJ" : "kcal"
}

export function formatClock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso))
}

export function formatEyebrowDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`)
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ""
  return `${get("weekday")} · ${get("day")} ${get("month")}`.toUpperCase()
}

export function formatWeekRange(start: string, end: string): string {
  const startDate = new Date(`${start}T12:00:00Z`)
  const endDate = new Date(`${end}T12:00:00Z`)
  const day = (date: Date) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" })
      .format(date)
      .toUpperCase()
  return `${day(startDate)} – ${day(endDate)}`
}

export function formatLongDay(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
  }).format(new Date(`${isoDate}T12:00:00Z`))
}

export function weekdayLetter(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" })
    .format(new Date(`${isoDate}T12:00:00Z`))
    .slice(0, 3)
}

export function formatDateTimeInput(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00"
  const hour = get("hour") === "24" ? "00" : get("hour")
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`
}

export function localDateTimeValue(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromLocalDateTime(value: string): string {
  return new Date(value).toISOString()
}

export function per100(item: { grams: number; kcal: number; proteinG: number; carbsG: number; fatG: number }) {
  const factor = item.grams > 0 ? 100 / item.grams : 0
  return {
    kcal100g: item.kcal * factor,
    protein100g: item.proteinG * factor,
    carbs100g: item.carbsG * factor,
    fat100g: item.fatG * factor,
  }
}

export function itemNutrition(item: DraftItem) {
  return nutritionForGrams(item, item.grams)
}

export function draftTotals(items: DraftItem[]) {
  return items.reduce(
    (total, item) => {
      const nutrition = itemNutrition(item)
      return {
        kcal: total.kcal + nutrition.kcal,
        proteinG: total.proteinG + nutrition.proteinG,
        carbsG: total.carbsG + nutrition.carbsG,
        fatG: total.fatG + nutrition.fatG,
      }
    },
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  )
}

export function mealTitle(meal: Pick<Meal, "note" | "items">): string {
  if (meal.note?.trim()) return meal.note
  return meal.items.map((item) => item.name).join(", ") || "Meal"
}

export function sourceLabel(source: string | null | undefined): string {
  if (!source) return "estimate"
  if (source === "usda") return "USDA"
  if (source === "label" || source === "user") return "GROUP"
  if (source === "ai") return "AI"
  return source
}

export function inputLabel(inputType: string): string {
  if (inputType === "photo") return "photo"
  if (inputType === "text" || inputType === "voice") return "description"
  if (inputType === "label") return "label"
  if (inputType === "search") return "search"
  return inputType
}
