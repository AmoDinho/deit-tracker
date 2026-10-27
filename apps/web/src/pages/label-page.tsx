import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"
import { kjToKcal, kcalToKj } from "@deit/domain"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PhotoFrame } from "@/components/visuals"
import { mediaUrl, saveFood, saveMeal } from "@/lib/api"
import { useSession } from "@/lib/session"
import { uploadPhoto } from "@/lib/upload"
import { readNutritionLabel } from "@/lib/api"
import type { LabelRead } from "@/lib/types"
import { cn } from "@/lib/utils"

type LabelState = LabelRead & {
  photoKey: string
  photoPreview: string | null
  slot: string
  eatenAt: string
}

const servings = [
  { label: "1 tbsp", grams: 16 },
  { label: "2 tbsp", grams: 32 },
]

export function LabelPage() {
  const navigate = useNavigate()
  const { invalidate } = useSession()
  const stored = readStored()
  const [draft, setDraft] = useState<LabelState | null>(stored)
  const [grams, setGrams] = useState(32)
  const [custom, setCustom] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onFile(file: File) {
    setBusy(true)
    try {
      const uploaded = await uploadPhoto(file, "label")
      const read = await readNutritionLabel(uploaded.key)
      const next: LabelState = {
        ...read,
        photoKey: uploaded.key,
        photoPreview: uploaded.preview,
        slot: draft?.slot || "snack",
        eatenAt: draft?.eatenAt || new Date().toISOString(),
      }
      sessionStorage.setItem("deit.label", JSON.stringify(next))
      setDraft(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that label.")
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!draft?.name.trim()) {
      toast.error("Add the product name before saving.")
      return
    }
    setBusy(true)
    try {
      const food = await saveFood({
        name: draft.name,
        brand: draft.brand,
        kcal100g: Number(draft.kcal100g) || 0,
        protein100g: Number(draft.protein100g) || 0,
        carbs100g: Number(draft.carbs100g) || 0,
        fat100g: Number(draft.fat100g) || 0,
        fibre100g: draft.fibre100g,
        labelPhotoKey: draft.photoKey,
        servingLabel: servings.find((item) => item.grams === grams)?.label,
        servingGrams: grams,
      })
      const factor = grams / 100
      await saveMeal({
        eatenAt: draft.eatenAt,
        slot: draft.slot,
        note: draft.name,
        photoKey: draft.photoKey,
        inputType: "label",
        items: [
          {
            foodId: food.id,
            name: food.name,
            grams,
            kcal: Math.round(food.kcal100g * factor * 10) / 10,
            proteinG: Math.round(food.protein100g * factor * 10) / 10,
            carbsG: Math.round(food.carbs100g * factor * 10) / 10,
            fatG: Math.round(food.fat100g * factor * 10) / 10,
            source: "label",
            userEdited: true,
          },
        ],
      })
      sessionStorage.removeItem("deit.label")
      invalidate()
      toast.success("Saved. Your group can search for it now.")
      navigate("/")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that food.")
    } finally {
      setBusy(false)
    }
  }

  const kcal = Number(draft?.kcal100g) || 0
  const portion = Math.round(kcal * (grams / 100))

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center justify-between">
        <Button variant="secondary" size="icon" className="size-11 rounded-full" asChild>
          <Link to="/" aria-label="Back">←</Link>
        </Button>
        <p className="eyebrow">Label · per 100 g</p>
      </div>
      {!draft ? (
        <label className="grid aspect-[4/3] cursor-pointer place-items-center rounded-[28px] border border-dashed border-border text-center">
          <span>
            <span className="block font-medium">{busy ? "Reading label…" : "Photograph the nutrition label"}</span>
            <span className="text-sm text-muted-foreground">We'll read the per 100 g column. You confirm every number.</span>
          </span>
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => event.target.files?.[0] && void onFile(event.target.files[0])} />
        </label>
      ) : (
        <>
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <PhotoFrame src={mediaUrl(draft.photoPreview)} label="[Label]" className="aspect-square" />
            <div className="space-y-2">
              <label className="block">
                <span className="eyebrow">Product</span>
                <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-1 h-11 rounded-xl" />
              </label>
              <label className="block">
                <span className="eyebrow">Brand · optional</span>
                <Input value={draft.brand ?? ""} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} placeholder="e.g. store brand" className="mt-1 h-11 rounded-xl" />
              </label>
            </div>
          </div>
          <p className="mt-6 flex justify-between text-xs text-muted-foreground">
            <span className="eyebrow">As read</span>
            tap to fix
          </p>
          <Nutrient label="Energy" value={String(Math.round(kcal))} suffix="kcal" hint={draft.energyKj ? `${Math.round(draft.energyKj)} kJ ÷ 4.184` : `${Math.round(kcalToKj(kcal))} kJ`} onChange={(value) => setDraft({ ...draft, kcal100g: Number(value) || 0, energyKj: kcalToKj(Number(value) || 0) })} check={draft.needsManualEntry} />
          <Nutrient label="Protein" value={String(draft.protein100g)} suffix="g" onChange={(value) => setDraft({ ...draft, protein100g: Number(value) || 0 })} />
          <Nutrient label="Carbohydrate" value={String(draft.carbs100g)} suffix="g" onChange={(value) => setDraft({ ...draft, carbs100g: Number(value) || 0 })} />
          <Nutrient label="Fat" value={String(draft.fat100g)} suffix="g" onChange={(value) => setDraft({ ...draft, fat100g: Number(value) || 0 })} check={draft.needsManualEntry} />
          <Nutrient label="Fibre" value={String(draft.fibre100g ?? "")} suffix="g" onChange={(value) => setDraft({ ...draft, fibre100g: value === "" ? null : Number(value) })} />
          <p className="eyebrow mt-6">How much</p>
          <div className="mt-2 flex gap-2">
            {servings.map((item) => (
              <button key={item.label} type="button" onClick={() => { setGrams(item.grams); setCustom(false) }} className={cn("rounded-full border px-3 py-2 text-sm", !custom && grams === item.grams ? "border-foreground bg-secondary" : "border-border")}>
                {item.label} · {item.grams} g
              </button>
            ))}
            <button type="button" onClick={() => setCustom(true)} className={cn("rounded-full border px-3 py-2 text-sm", custom ? "border-foreground" : "border-border")}>
              grams
            </button>
          </div>
          {custom && <Input inputMode="decimal" value={grams} onChange={(event) => setGrams(Number(event.target.value) || 0)} className="mt-2 h-11 w-28 rounded-full" />}
          <p className="mt-4 text-sm text-muted-foreground">Once saved, everyone in your group can find this food in search.</p>
          <div className="mt-6 flex items-center justify-between">
            <div>
              <p className="text-3xl font-semibold">{portion} <span className="text-base text-muted-foreground">kcal</span></p>
              <p className="text-sm text-muted-foreground">{Math.round(Number(draft.protein100g) * grams / 100)} g P · {draft.slot}</p>
            </div>
            <Button className="h-12 rounded-full px-6" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save & log"}
            </Button>
          </div>
          <p className="sr-only">{kjToKcal(draft.energyKj || 0)}</p>
        </>
      )}
    </div>
  )
}

function readStored(): LabelState | null {
  const raw = sessionStorage.getItem("deit.label")
  if (!raw) return null
  try {
    return JSON.parse(raw) as LabelState
  } catch {
    return null
  }
}

function Nutrient({
  label,
  value,
  suffix,
  hint,
  check,
  onChange,
}: {
  label: string
  value: string
  suffix: string
  hint?: string
  check?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="flex items-center gap-3 border-b border-border py-3">
      <span className="flex-1 font-medium">{label}</span>
      {hint && <span className="hidden text-xs text-muted-foreground sm:inline">{hint}</span>}
      {check && <span className="rounded-md bg-carbs px-1.5 py-0.5 text-[10px] font-semibold text-black">CHECK</span>}
      <input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" className="w-16 bg-transparent text-right text-lg font-semibold outline-none" />
      <span className="w-8 text-sm text-muted-foreground">{suffix}</span>
    </label>
  )
}
