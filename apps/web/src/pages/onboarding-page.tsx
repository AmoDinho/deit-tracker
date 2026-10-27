import { useMemo, useState } from "react"
import { Navigate, useNavigate } from "react-router"
import { toast } from "sonner"
import { ACTIVITY_LEVELS, GOAL_OPTIONS, calculateTargets, type GoalOptionId, type Sex } from "@deit/domain"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { completeOnboarding, setGoals } from "@/lib/api"
import { formatNumber } from "@/lib/format"
import { useSession } from "@/lib/session"
import { cn } from "@/lib/utils"

const steps = ["About you", "Activity", "Goal", "Targets"]

export function OnboardingPage() {
  const { status, me, refresh } = useSession()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [sex, setSex] = useState<Sex>(me?.profile?.sex === "female" ? "female" : "male")
  const [age, setAge] = useState(String(me?.profile?.age ?? 30))
  const [heightCm, setHeightCm] = useState(String(me?.profile?.heightCm ?? 178))
  const [weightKg, setWeightKg] = useState(String(me?.profile?.weightKg ?? 78))
  const [activity, setActivity] = useState<(typeof ACTIVITY_LEVELS)[number]["id"]>("moderate")
  const [goal, setGoal] = useState<GoalOptionId>("lose_fast")
  const [unit, setUnit] = useState<"kcal" | "kJ">(me?.profile?.energyUnit === "kJ" ? "kJ" : "kcal")
  const [adjusting, setAdjusting] = useState(false)
  const [manual, setManual] = useState({ calories: "", proteinG: "", carbsG: "", fatG: "" })
  const [busy, setBusy] = useState(false)

  const stats = useMemo(
    () => ({
      sex,
      age: Number(age),
      heightCm: Number(heightCm),
      weightKg: Number(weightKg),
      activity,
      goal,
    }),
    [sex, age, heightCm, weightKg, activity, goal],
  )
  const targets = useMemo(() => {
    if (![stats.age, stats.heightCm, stats.weightKg].every((value) => Number.isFinite(value) && value > 0)) return null
    return calculateTargets(stats)
  }, [stats])
  const goalOption = GOAL_OPTIONS.find((item) => item.id === goal) ?? GOAL_OPTIONS[0]
  const activityOption = ACTIVITY_LEVELS.find((item) => item.id === activity) ?? ACTIVITY_LEVELS[2]

  if (status === "anon") return <Navigate to="/login" replace />
  if (status === "ready" && me?.profile?.onboarded && step === 0 && !adjusting) {
    // Allow revisiting from Goals via ?edit=1. Otherwise send onboarded users home
    // only when they land here without intending to edit.
  }

  function next() {
    if (step === 0 && (!Number(age) || !Number(heightCm) || !Number(weightKg))) {
      toast.error("Add age, height and weight to calculate a target.")
      return
    }
    setStep((current) => Math.min(3, current + 1))
  }

  async function start() {
    if (!targets) return
    setBusy(true)
    try {
      await completeOnboarding({
        sex,
        age: Number(age),
        heightCm: Number(heightCm),
        weightKg: Number(weightKg),
        activityLevel: activity,
        goal,
        energyUnit: unit,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Johannesburg",
      })
      if (adjusting && manual.calories) {
        await setGoals({
          calories: Number(manual.calories),
          proteinG: Number(manual.proteinG || targets.proteinG),
          carbsG: Number(manual.carbsG || targets.carbsG),
          fatG: Number(manual.fatG || targets.fatG),
        })
      }
      await refresh()
      navigate("/", { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your targets.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 py-6">
      <div className="mb-8 flex items-center justify-between">
        <Button variant="secondary" size="icon" className="size-11 rounded-full" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>
          ←
        </Button>
        <p className="eyebrow">Step {String(step + 1).padStart(2, "0")} / 04</p>
      </div>

      {step === 0 && (
        <section className="space-y-6">
          <Header title="About you" body="Targets are calculated from your body, not typed in blind." />
          <div className="grid grid-cols-2 gap-2">
            {(["male", "female"] as const).map((item) => (
              <Button key={item} type="button" variant={sex === item ? "default" : "secondary"} className="h-12 rounded-2xl capitalize" onClick={() => setSex(item)}>
                {item}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Age" value={age} onChange={setAge} suffix="yrs" />
            <NumberField label="Height" value={heightCm} onChange={setHeightCm} suffix="cm" />
            <NumberField label="Weight" value={weightKg} onChange={setWeightKg} suffix="kg" />
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4">
          <Header title="How active is a normal week?" body="This sets the multiplier between resting burn and what you actually spend." />
          {ACTIVITY_LEVELS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActivity(item.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-2xl border bg-card px-4 py-3 text-left",
                activity === item.id ? "border-primary" : "border-border",
              )}
            >
              <span>
                <span className="block font-medium">{item.label}</span>
                <span className="text-sm text-muted-foreground">{item.detail}</span>
              </span>
              <span className="text-sm tabular-nums text-muted-foreground">× {item.multiplier}</span>
            </button>
          ))}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <Header title="What are you aiming for?" body="Pace is capped at 1% of body weight a week. You can override the numbers next." />
          {GOAL_OPTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setGoal(item.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-2xl border bg-card px-4 py-4 text-left",
                goal === item.id ? "border-primary" : "border-border",
              )}
            >
              <span className="font-medium">{item.label}</span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {item.adjustment > 0 ? "+" : ""}
                {item.adjustment} kcal
              </span>
            </button>
          ))}
        </section>
      )}

      {step === 3 && targets && (
        <section className="space-y-5">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Your day runs on</h1>
            <p className="mt-2 text-4xl font-semibold tracking-tight">
              <span className="rounded-lg bg-primary px-2 py-0.5 text-primary-foreground">
                {formatNumber(unit === "kJ" ? targets.calories * 4.184 : targets.calories)}
              </span>{" "}
              <span className="text-2xl">{unit}</span>
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Calculated from your body stats and goal. Change any number whenever you like.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[`${heightCm} cm`, `${weightKg} kg`, `${age} · ${sex}`, activityOption.label.toLowerCase(), goalOption.label.replace("Lose ", "").replace("Gain, ", "")].map((chip) => (
              <span key={chip} className="rounded-full border border-border px-3 py-1.5 text-sm">
                {chip}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MacroCard label="Protein" color="text-protein" value={`${targets.proteinG}g`} detail={`${targets.proteinPerKg} g/kg`} />
            <MacroCard label="Carbs" color="text-carbs" value={`${targets.carbsG}g`} detail="the rest" />
            <MacroCard label="Fat" color="text-fat" value={`${targets.fatG}g`} detail={`${Math.round(targets.fatPercent * 100)}% kcal`} />
          </div>
          <div>
            <p className="eyebrow mb-2">How we got this</p>
            <Row index="01" label="Resting burn (BMR)" value={formatNumber(targets.bmr)} />
            <Row index="02" label={`× ${targets.activityMultiplier} activity`} value={formatNumber(targets.tdee)} />
            <Row index="03" label={`Goal: ${goalOption.label.toLowerCase()}`} value={`${targets.adjustment > 0 ? "+" : ""}${formatNumber(targets.adjustment)}`} />
          </div>
          <div className="flex w-fit rounded-full bg-secondary p-1">
            {(["kcal", "kJ"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setUnit(item)}
                className={cn("rounded-full px-4 py-1.5 text-sm", unit === item ? "bg-background text-foreground" : "text-muted-foreground")}
              >
                {item}
              </button>
            ))}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{targets.warnings.at(-1)}</p>
          {adjusting && (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Calories" value={manual.calories || String(targets.calories)} onChange={(value) => setManual((current) => ({ ...current, calories: value }))} />
              <NumberField label="Protein g" value={manual.proteinG || String(targets.proteinG)} onChange={(value) => setManual((current) => ({ ...current, proteinG: value }))} />
              <NumberField label="Carbs g" value={manual.carbsG || String(targets.carbsG)} onChange={(value) => setManual((current) => ({ ...current, carbsG: value }))} />
              <NumberField label="Fat g" value={manual.fatG || String(targets.fatG)} onChange={(value) => setManual((current) => ({ ...current, fatG: value }))} />
            </div>
          )}
        </section>
      )}

      <div className="mt-auto flex gap-3 pt-8">
        {step < 3 ? (
          <Button className="h-12 flex-1 rounded-full text-base" onClick={next}>
            Continue
          </Button>
        ) : (
          <>
            <Button variant="outline" className="h-12 rounded-full px-6" onClick={() => setAdjusting((current) => !current)}>
              Adjust
            </Button>
            <Button className="h-12 flex-1 rounded-full text-base" disabled={busy || !targets} onClick={() => void start()}>
              {busy ? "Saving…" : "Start logging →"}
            </Button>
          </>
        )}
      </div>
      <p className="sr-only">{steps[step]}</p>
    </main>
  )
}

function Header({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  suffix?: string
}) {
  return (
    <label className="block rounded-2xl border border-border bg-card px-3 py-2">
      <span className="eyebrow">{label}</span>
      <span className="mt-1 flex items-baseline gap-1">
        <Input
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 border-0 bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </span>
    </label>
  )
}

function MacroCard({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  return (
    <div className="rounded-2xl bg-card p-3">
      <p className={cn("text-[10px] font-semibold tracking-[0.16em] uppercase", color)}>{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function Row({ index, label, value }: { index: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-3 text-sm">
      <span className="w-6 text-xs text-muted-foreground">{index}</span>
      <span className="flex-1">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
