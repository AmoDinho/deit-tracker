import { useEffect, useMemo, useState } from "react"
import { Check, Minus, Plus } from "lucide-react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"
import { displayEnergy } from "@deit/domain"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PhotoFrame, SourceBadge } from "@/components/visuals"
import { fetchDay, fetchMeal, saveMeal, searchFoods, updateMeal } from "@/lib/api"
import { applySplit, draftFromMeal, nutritionOf, readDraft, withGrams, writeDraft } from "@/lib/draft"
import { draftTotals } from "@/lib/format"
import { formatClock, formatDateTimeInput, slotLabel, SLOTS } from "@/lib/format"
import { mediaUrl } from "@/lib/api"
import { useSession } from "@/lib/session"
import type { MealDraft } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ConfirmPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { me, invalidate } = useSession()
  const zone = me?.profile?.timezone || "Africa/Johannesburg"
  const unit = me?.profile?.energyUnit === "kJ" ? "kJ" : "kcal"
  const [draft, setDraft] = useState<MealDraft | null>(() => readDraft())
  const [eaten, setEaten] = useState(0)
  const [busy, setBusy] = useState(false)
  const mealId = params.get("meal")

  useEffect(() => {
    if (!mealId) return
    let cancelled = false
    fetchMeal(mealId)
      .then((meal) => {
        if (cancelled || !meal) return
        const next = draftFromMeal(meal)
        writeDraft(next)
        setDraft(next)
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not open that meal."))
    return () => {
      cancelled = true
    }
  }, [mealId])

  useEffect(() => {
    if (!draft) return
    const date = draft.eatenAt.slice(0, 10)
    fetchDay(date)
      .then((data) => {
        const current = draft.editingId ? data.dailySummary.meals.find((meal) => meal.id === draft.editingId)?.kcal ?? 0 : 0
        setEaten(data.dailySummary.calories - current)
      })
      .catch(() => setEaten(0))
  }, [draft])

  const totals = useMemo(() => (draft ? draftTotals(draft.items) : { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }), [draft])
  const target = me?.goal?.calories ?? 0
  const left = Math.max(0, target - eaten - totals.kcal)

  function update(next: MealDraft) {
    writeDraft(next)
    setDraft(next)
  }

  async function answer(yes: boolean) {
    if (!draft) return
    if (!yes || !/oil|fried/i.test(draft.question || "")) {
      update({ ...draft, question: null, questionAnswered: true })
      return
    }
    const foods = await searchFoods("sunflower oil", "usda").catch(() => [])
    const oil = foods[0]
    if (!oil) {
      update({ ...draft, question: null, questionAnswered: true })
      return
    }
    update({
      ...draft,
      question: null,
      questionAnswered: true,
      items: [
        ...draft.items,
        {
          key: crypto.randomUUID(),
          foodId: oil.id,
          name: oil.name,
          grams: 8,
          baseGrams: 8,
          kcal100g: oil.kcal100g,
          protein100g: oil.protein100g,
          carbs100g: oil.carbs100g,
          fat100g: oil.fat100g,
          source: oil.source,
          confidence: 0.4,
          userEdited: true,
          lowConfidence: true,
        },
      ],
    })
  }

  async function save() {
    if (!draft || !draft.items.length) {
      toast.error("Add at least one food before saving.")
      return
    }
    setBusy(true)
    try {
      const input = {
        eatenAt: draft.eatenAt,
        slot: draft.slot,
        note: draft.note || draft.items.map((item) => item.name).join(", "),
        photoKey: draft.photoKey,
        inputType: draft.inputType,
        analysisId: draft.analysisId,
        items: draft.items.map((item) => {
          const nutrition = nutritionOf(item)
          return {
            foodId: item.foodId,
            name: item.name,
            grams: item.grams,
            ...nutrition,
            source: item.source,
            confidence: item.confidence,
            userEdited: item.userEdited,
          }
        }),
      }
      if (draft.editingId) await updateMeal(draft.editingId, input)
      else await saveMeal(input)
      invalidate()
      toast.success("Meal saved.")
      navigate("/")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the meal.")
    } finally {
      setBusy(false)
    }
  }

  if (!draft) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">Nothing to confirm yet.</p>
        <Button className="mt-4 rounded-full" onClick={() => navigate("/")}>
          Back to today
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Button variant="secondary" className="rounded-full" asChild>
          <Link to="/">← Today</Link>
        </Button>
        <p className="eyebrow hidden lg:block">Log a meal</p>
        <div className="hidden gap-1 rounded-full bg-card p-1 lg:flex">
          {["Photo", "Describe", "Label", "Search"].map((item) => (
            <span key={item} className={cn("rounded-full px-3 py-1 text-sm", item === modeLabel(draft.inputType) ? "bg-secondary" : "text-muted-foreground")}>
              {item}
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <section>
          <PhotoFrame src={mediaUrl(draft.photoPreview)} className="aspect-square max-h-[420px]" />
          {draft.latencyMs != null && (
            <p className="mx-auto mt-4 w-fit rounded-full bg-black/70 px-3 py-1 text-sm">
              <span className="mr-2 inline-block size-2 rounded-full bg-primary" />
              {draft.items.length} items found · {(draft.latencyMs / 1000).toFixed(1)} s
            </p>
          )}
          <p className="mt-4 text-sm text-muted-foreground">Nothing is saved until you confirm.</p>
        </section>
        <section>
          <h1 className="text-4xl font-semibold tracking-tight">Check what we found</h1>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="eyebrow">Meal</span>
              <select
                value={draft.slot}
                onChange={(event) => update({ ...draft, slot: event.target.value })}
                className="mt-1 h-11 w-full rounded-full border border-border bg-card px-3"
              >
                {SLOTS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="eyebrow">Eaten at</span>
              <Input
                type="datetime-local"
                value={formatDateTimeInput(draft.eatenAt, zone)}
                onChange={(event) => update({ ...draft, eatenAt: new Date(event.target.value).toISOString() })}
                className="mt-1 h-11 rounded-full px-3"
              />
            </label>
          </div>
          {draft.question && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-carbs/40 bg-carbs/10 px-3 py-3">
              <span className="rounded-md bg-carbs px-1.5 py-0.5 text-[10px] font-semibold text-black">ASK</span>
              <p className="mr-auto text-sm font-medium">{draft.question}</p>
              <Button className="rounded-full bg-carbs text-black hover:bg-carbs/80" onClick={() => void answer(true)}>
                Yes
              </Button>
              <Button variant="secondary" className="rounded-full" onClick={() => void answer(false)}>
                No
              </Button>
              <Button variant="secondary" className="rounded-full" onClick={() => void answer(false)}>
                Not sure
              </Button>
            </div>
          )}
          <div className="mt-4 hidden grid-cols-[2rem_1fr_5rem_5rem_4rem_5rem] gap-2 px-1 text-[11px] tracking-widest text-muted-foreground uppercase lg:grid">
            <span>#</span><span>Item</span><span>Source</span><span>Grams</span><span>Kcal</span><span>Protein</span>
          </div>
          {draft.items.map((item, index) => {
            const nutrition = nutritionOf(item)
            return (
              <div key={item.key} className="grid items-center gap-3 border-b border-border py-3 lg:grid-cols-[2rem_1fr_5rem_5rem_4rem_5rem]">
                <span className="text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground lg:hidden">
                    <SourceBadge source={item.source} />
                    {Math.round(nutrition.kcal)} kcal · {Math.round(nutrition.proteinG)} g P
                    {item.lowConfidence && <span className="text-carbs">low confidence</span>}
                  </p>
                  {item.lowConfidence && <p className="hidden text-xs text-carbs lg:block">low confidence · hidden fat</p>}
                </div>
                <div className="hidden lg:block">
                  <SourceBadge source={item.source} />
                </div>
                <div className="flex items-center justify-self-start rounded-full border border-border">
                  <button type="button" className="px-2 py-1" aria-label="Less" onClick={() => update({ ...draft, items: draft.items.map((row) => (row.key === item.key ? withGrams(row, row.grams - 10) : row)) })}>
                    <Minus className="size-3" />
                  </button>
                  <input
                    inputMode="decimal"
                    value={Math.round(item.grams)}
                    onChange={(event) =>
                      update({
                        ...draft,
                        items: draft.items.map((row) => (row.key === item.key ? withGrams(row, Number(event.target.value) || 0) : row)),
                      })
                    }
                    className="w-12 bg-transparent text-center text-sm outline-none"
                  />
                  <button type="button" className="px-2 py-1" aria-label="More" onClick={() => update({ ...draft, items: draft.items.map((row) => (row.key === item.key ? withGrams(row, row.grams + 10) : row)) })}>
                    <Plus className="size-3" />
                  </button>
                </div>
                <span className="hidden tabular-nums lg:block">{Math.round(nutrition.kcal)}</span>
                <span className="hidden tabular-nums lg:block">{Math.round(nutrition.proteinG)} g</span>
              </div>
            )
          })}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" asChild>
              <Link to={`/search?add=1&slot=${draft.slot}`}>+ Add item</Link>
            </Button>
            <Button variant="secondary" className="rounded-full" onClick={() => update(applySplit(draft, !draft.split))}>
              {draft.split ? "Shared meal · halved" : "Shared meal · split ½"}
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-border px-4 py-4">
            <div>
              <p className="text-3xl font-semibold tracking-tight">
                {displayEnergy(totals.kcal, unit)} <span className="text-base text-muted-foreground">{unit}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {Math.round(totals.proteinG)} P · {Math.round(totals.carbsG)} C · {Math.round(totals.fatG)} F
                {target > 0 && ` · leaves ${displayEnergy(left, unit)} ${unit}, ${Math.max(0, Math.round((me?.goal?.proteinG ?? 0) - totals.proteinG))} g P`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-full" onClick={() => navigate("/")}>
                Discard
              </Button>
              <Button className="h-11 rounded-full px-5" disabled={busy} onClick={() => void save()}>
                <Check /> {busy ? "Saving…" : "Save meal"}
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground lg:hidden">{slotLabel(draft.slot)} · {formatClock(draft.eatenAt, zone)}</p>
        </section>
      </div>
    </div>
  )
}

function modeLabel(inputType: string) {
  if (inputType === "photo") return "Photo"
  if (inputType === "text") return "Describe"
  if (inputType === "label") return "Label"
  return "Search"
}
