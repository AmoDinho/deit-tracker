export function formatIsoDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00"
  return `${get("year")}-${get("month")}-${get("day")}`
}

export function todayIso(timeZone: string, now = new Date()): string {
  return formatIsoDate(now, timeZone)
}

function timeZoneOffset(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  const hour = parts.find((part) => part.type === "hour")?.value === "24" ? 0 : get("hour")
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"))
  return asUtc - date.getTime()
}

export function zonedTimeToUtc(dateTime: string, timeZone: string): Date {
  const guess = new Date(`${dateTime}Z`)
  const first = new Date(guess.getTime() - timeZoneOffset(guess, timeZone))
  return new Date(guess.getTime() - timeZoneOffset(first, timeZone))
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + days))
  return next.toISOString().slice(0, 10)
}

export function zonedDayRange(isoDate: string, timeZone: string): { start: Date; end: Date } {
  return {
    start: zonedTimeToUtc(`${isoDate}T00:00:00`, timeZone),
    end: zonedTimeToUtc(`${addDays(isoDate, 1)}T00:00:00`, timeZone),
  }
}

export function startOfWeek(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  const weekday = utc.getUTCDay()
  const delta = weekday === 0 ? -6 : 1 - weekday
  return addDays(isoDate, delta)
}
