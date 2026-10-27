import { useEffect, useState } from "react"
import { Calendar, Camera, FileText, Plus, Search } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router"
import { todayIso } from "@deit/domain"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CalorieRing, Energy, Eyebrow, IndexMark, MacroRow } from "@/components/visuals"
import { eyebrowDate, formatTime, inputTypeLabel, slotLabel } from "@/lib/format"
import { fetchDay } from "@/lib/api"
import { useSession } from "@/lib/session"
import type { DailySummary, EnergyUnit, Meal, Slot } from "@/lib/types"
import { cn } from "@/lib/utils"

const slotOrder: Slot[] = ["breakfast", "lunch", "dinner", "snack"]

export function TodayPage({
  onLog,
  onDescribe,
  onPhoto,
  onLabel,
  onLogAgain,
  busy,
}: {
  onLog: (date: string, slot?: Slot) => void
  onDescribe: (text: string, date: string) => void
  onPhoto: (file: File, date: string) => void
  onLabel: (file: File, date: string) => void
  onLogAgain: (meal: Meal, date: string) => void
  busy: boolean
}) {
  const { me, revision } = useSession()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const zone = me?.profile?.timezone || "Africa/Johannesburg"
  const unit: EnergyUnit = me?.profile?.energyUnit === "kJ" ? "kJ" : "kcal"
  const date = params.get("date") || todayIso(zone)
  const [summary, setSummary] = useState<DailySummary | null>(null)
  const [recents, setRecents] = useState<Meal[]>([])
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pickingDate, setPickingDate] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchDay(date)
      .then((data) => {
        if (cancelled) return
        setSummary(data.dailySummary)
        setRecents(data.recentMeals)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load today.")
      })
    return () => {
      cancelled = true
    }
  }, [date, revision])

  const target = summary?.target?.calories ?? me?.goal?.calories ?? 0
  const eaten = summary?.calories ?? 0
  const left = Math.max(0, target - eaten)
  const percent = target ? Math.round((eaten / target) * 100) : 0
  const loggedSlots = slotOrder.filter((slot) => summary?.meals.some((meal) => meal.slot === slot)).length

  return (
    <div className="mx-auto w-full max-w-md lg:max-w-none">
      <div className="mb-6 flex items-start justify-between lg:hidden">
        <div>
          <Eyebrow>{eyebrowDate(date)}</Eyebrow>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight">Today</h1>
        </div>
        <Button variant="secondary" size="icon" className="size-11 rounded-full" onClick={() => setPickingDate((current) => !current)} aria-label="Choose date">
          <Calendar />
        </Button>
      </div>
      {pickingDate && (
        <Input
          type="date"
          value={date}
          onChange={(event) => {
            setParams(event.target.value ? { date: event.target.value } : {})
            setPickingDate(false)
          }}
          className="mb-4 h-11 rounded-xl lg:hidden"
        />
      )}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-16">
        <section>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Eyebrow className="hidden lg:block">{eyebrowDate(date)} · left today</Eyebrow>
              <Eyebrow className="lg:hidden">Left today</Eyebrow>
              <p className="mt-2 flex items-end gap-2">
                <Energy kcal={left} unit={unit} className="text-7xl leading-none font-semibold tracking-tight" />
                <span className="mb-2 text-lg text-muted-foreground">{unit}</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                <Energy kcal={eaten} unit={unit} /> eaten / <Energy kcal={target} unit={unit} /> target
              </p>
            </div>
            <CalorieRing percent={percent} />
          </div>
          <div className="mt-6">
            <MacroRow label="Protein" value={summary?.proteinG ?? 0} target={summary?.target?.proteinG ?? me?.goal?.proteinG ?? 0} color="var(--protein)" />
            <MacroRow label="Carbs" value={summary?.carbsG ?? 0} target={summary?.target?.carbsG ?? me?.goal?.carbsG ?? 0} color="var(--carbs)" />
            <MacroRow label="Fat" value={summary?.fatG ?? 0} target={summary?.target?.fatG ?? me?.goal?.fatG ?? 0} color="var(--fat)" />
          </div>

          <form
            className="mt-6 hidden rounded-[28px] border border-border bg-card/70 p-4 lg:block"
            onSubmit={(event) => {
              event.preventDefault()
              if (!text.trim()) return
              onDescribe(text.trim(), date)
              setText("")
            }}
          >
            <Eyebrow>Describe a meal</Eyebrow>
            <div className="mt-3 flex gap-2">
              <Input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="two eggs and a slice of toast with butter"
                className="h-12 rounded-full bg-background px-4"
              />
              <Button className="h-12 rounded-full px-5" disabled={busy}>
                Analyse
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <FileButton icon={Camera} label="Upload meal photo" disabled={busy} onFile={(file) => onPhoto(file, date)} capture />
              <FileButton icon={FileText} label="Label photo" disabled={busy} onFile={(file) => onLabel(file, date)} capture />
              <Button type="button" variant="secondary" className="h-10 rounded-full" onClick={() => navigate(`/search?date=${date}`)}>
                <Search /> Search
              </Button>
            </div>
          </form>
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <Eyebrow>Meals</Eyebrow>
            <p className="text-xs text-muted-foreground">{loggedSlots} of 4 logged</p>
          </div>
          {slotOrder.map((slot, index) => {
            const meals = summary?.meals.filter((meal) => meal.slot === slot) ?? []
            const recent = recents.find((meal) => meal.slot === slot && !meals.some((item) => item.id === meal.id))
            const kcal = meals.reduce((sum, meal) => sum + meal.kcal, 0)
            return (
              <div key={slot} className="flex gap-3 border-b border-border py-4">
                <IndexMark index={index + 1} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-2xl font-semibold tracking-tight">{slotLabel(slot)}</h2>
                    {meals.length > 0 && (
                      <Energy kcal={kcal} unit={unit} className="pt-1 text-lg tabular-nums" />
                    )}
                  </div>
                  {meals.length === 0 ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="text-sm text-muted-foreground">
                        {recent ? `${recent.note || recent.items[0]?.name} · ${Math.round(recent.kcal)}` : "Not logged yet"}
                      </p>
                      {recent && (
                        <Button variant="outline" className="h-8 rounded-full" onClick={() => onLogAgain(recent, date)}>
                          Log again
                        </Button>
                      )}
                      <Button variant="outline" size="icon" className="size-8 rounded-full" onClick={() => onLog(date, slot)} aria-label={`Log ${slot}`}>
                        <Plus />
                      </Button>
                    </div>
                  ) : (
                    meals.map((meal) => (
                      <button key={meal.id} type="button" className="mt-1 block w-full text-left" onClick={() => navigate(`/log/confirm?meal=${meal.id}`)}>
                        <p className="text-sm text-muted-foreground">{meal.note || meal.items.map((item) => item.name).join(", ")}</p>
                        <p className="mt-1 hidden text-xs text-muted-foreground lg:block">
                          {formatTime(meal.eatenAt, zone)} · {inputTypeLabel(meal.inputType)} · {Math.round(meal.proteinG)} P · {Math.round(meal.carbsG)} C · {Math.round(meal.fatG)} F
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </section>
      </div>
    </div>
  )
}

function FileButton({
  icon: Icon,
  label,
  onFile,
  disabled,
  capture,
}: {
  icon: typeof Camera
  label: string
  onFile: (file: File) => void
  disabled?: boolean
  capture?: boolean
}) {
  return (
    <label className={cn("inline-flex", disabled && "pointer-events-none opacity-50")}>
      <input
        type="file"
        accept="image/*"
        capture={capture ? "environment" : undefined}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file)
          event.target.value = ""
        }}
      />
      <span className="inline-flex h-10 items-center gap-1.5 rounded-full bg-secondary px-3 text-sm">
        <Icon className="size-4" />
        {label}
      </span>
    </label>
  )
}
