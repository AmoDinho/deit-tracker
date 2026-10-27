import { useEffect, useState, type ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { addDays, startOfWeek, todayIso } from "@deit/domain"
import { Button } from "@/components/ui/button"
import { Energy, Eyebrow } from "@/components/visuals"
import { deleteMeal, fetchDay, fetchWeek } from "@/lib/api"
import { formatTime, longDay, shortWeekday, weekRangeLabel } from "@/lib/format"
import { useSession } from "@/lib/session"
import type { DayTotal, EnergyUnit, Meal, WeekSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

export function HistoryPage({ onEdit }: { onEdit: (meal: Meal) => void }) {
  const { me, revision, invalidate } = useSession()
  const navigate = useNavigate()
  const zone = me?.profile?.timezone || "Africa/Johannesburg"
  const unit: EnergyUnit = me?.profile?.energyUnit === "kJ" ? "kJ" : "kcal"
  const today = todayIso(zone)
  const [start, setStart] = useState(() => startOfWeek(today))
  const [selected, setSelected] = useState(addDays(today, -1))
  const [week, setWeek] = useState<WeekSummary | null>(null)
  const [meals, setMeals] = useState<Meal[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchWeek(start)
      .then((data) => {
        if (!cancelled) setWeek(data.weekSummary)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load the week.")
      })
    return () => {
      cancelled = true
    }
  }, [start, revision])

  useEffect(() => {
    let cancelled = false
    fetchDay(selected)
      .then((data) => {
        if (!cancelled) setMeals(data.dailySummary.meals)
      })
      .catch(() => {
        if (!cancelled) setMeals([])
      })
    return () => {
      cancelled = true
    }
  }, [selected, revision])

  const target = me?.goal?.calories ?? 0
  const max = Math.max(target, ...(week?.days.map((day) => day.calories) ?? [1]), 1)
  const day = week?.days.find((item) => item.date === selected)
  const elapsed = week?.days.filter((item) => item.date < today && item.logged) ?? []

  async function remove(meal: Meal) {
    if (!confirm(`Delete ${meal.note || "this meal"}?`)) return
    try {
      await deleteMeal(meal.id)
      invalidate()
      toast.success("Meal deleted.")
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not delete that meal.")
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <Eyebrow>Week · {week ? weekRangeLabel(week.start, week.end) : "…"}</Eyebrow>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight lg:text-5xl">History</h1>
        </div>
        <div className="flex items-center rounded-full border border-border p-1">
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Previous week" onClick={() => setStart((current) => addDays(current, -7))}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" className="hidden rounded-full sm:inline-flex" onClick={() => setStart((current) => addDays(current, -7))}>
            Previous
          </Button>
          <Button variant="ghost" className="hidden rounded-full sm:inline-flex" onClick={() => setStart((current) => addDays(current, 7))}>
            Next
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Next week" onClick={() => setStart((current) => addDays(current, 7))}>
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Avg calories" value={<Energy kcal={week?.avgCalories ?? 0} unit={unit} />} detail={target ? `target ${Math.round(target).toLocaleString("en-US")}` : "no target"} />
        <Stat label="Avg protein" value={<>{Math.round(week?.avgProtein ?? 0)}<span className="text-lg text-muted-foreground">g</span></>} detail={`target ${me?.goal?.proteinG ?? 0} g`} />
        <Stat label="Avg carbs / fat" value={<>{Math.round(week?.avgCarbs ?? 0)}<span className="text-lg text-muted-foreground">/{Math.round(week?.avgFat ?? 0)}g</span></>} detail={`target ${me?.goal?.carbsG ?? 0} / ${me?.goal?.fatG ?? 0} g`} />
        <Stat label="Days logged" value={<>{elapsed.length}<span className="text-lg text-muted-foreground">/{week?.daysInWeek ?? 7}</span></>} detail="averages exclude today" />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <Eyebrow>Calories per day</Eyebrow>
            <p className="text-xs text-muted-foreground">— target {target ? Math.round(target).toLocaleString("en-US") : "—"}</p>
          </div>
          <div className="relative flex h-52 items-end gap-2 border-b border-border px-1">
            {target > 0 && (
              <div className="absolute inset-x-0 border-t border-dashed border-white/20" style={{ bottom: `${Math.min(100, (target / max) * 100)}%` }} />
            )}
            {(week?.days ?? []).map((item) => (
              <DayBar key={item.date} day={item} max={max} selected={item.date === selected} future={item.date > today} onSelect={() => setSelected(item.date)} />
            ))}
          </div>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </section>

        <section>
          <div className="mb-2 flex items-end justify-between">
            <h2 className="text-2xl font-semibold tracking-tight">{longDay(selected)}</h2>
            <p className="text-sm text-muted-foreground">
              {day ? <Energy kcal={day.calories} unit={unit} /> : "—"} kcal · {Math.round(day?.proteinG ?? 0)} g P
            </p>
          </div>
          {meals.length === 0 && <p className="py-8 text-sm text-muted-foreground">Nothing logged this day.</p>}
          {meals.map((meal) => (
            <div key={meal.id} className="flex items-center gap-3 border-b border-border py-3">
              <span className="w-12 shrink-0 text-sm text-muted-foreground">{formatTime(meal.eatenAt, zone)}</span>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onEdit(meal)}>
                <span className="block truncate font-medium">{meal.note || meal.items.map((item) => item.name).join(", ")}</span>
              </button>
              <Energy kcal={meal.kcal} unit={unit} className="tabular-nums" />
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => onEdit(meal)}>
                Edit
              </Button>
              <Button variant="destructive" size="sm" className="rounded-full" onClick={() => void remove(meal)}>
                Delete
              </Button>
            </div>
          ))}
          <Button variant="ghost" className="mt-3" onClick={() => navigate(`/?date=${selected}`)}>
            Open this day
          </Button>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, detail }: { label: string; value: ReactNode; detail: string }) {
  return (
    <div className="bg-background px-4 py-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function DayBar({
  day,
  max,
  selected,
  future,
  onSelect,
}: {
  day: DayTotal
  max: number
  selected: boolean
  future: boolean
  onSelect: () => void
}) {
  const height = day.logged ? Math.max(12, (day.calories / max) * 100) : 18
  return (
    <button type="button" onClick={onSelect} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
      <span
        className={cn(
          "w-full max-w-10 rounded-full",
          selected ? "bg-primary" : "bg-secondary",
          !day.logged && "border border-dashed border-white/20 bg-transparent",
          future && "opacity-60",
        )}
        style={{ height: `${height}%` }}
      />
      <span className={cn("text-[11px] text-muted-foreground", selected && "text-foreground")}>{shortWeekday(day.date)}</span>
    </button>
  )
}
