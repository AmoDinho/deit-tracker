import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { Camera, FileText, Search, ArrowUp } from "lucide-react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { todayIso, zonedTimeToUtc } from "@deit/domain"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { analyzeMealPhoto, logAgain, parseMealText, readNutritionLabel } from "@/lib/api"
import { draftFromAnalysis, emptyDraft, writeDraft } from "@/lib/draft"
import { defaultSlot, formatClock, slotLabel, SLOTS } from "@/lib/format"
import { useSession } from "@/lib/session"
import type { Meal, Slot } from "@/lib/types"
import { uploadPhoto } from "@/lib/upload"
import { cn } from "@/lib/utils"

type LogContextValue = {
  busy: boolean
  openLog: (opts?: { date?: string; slot?: Slot }) => void
  describe: (text: string, date?: string, slot?: Slot) => Promise<void>
  photo: (file: File, date?: string, slot?: Slot) => Promise<void>
  label: (file: File, date?: string, slot?: Slot) => Promise<void>
  again: (meal: Meal, date?: string) => Promise<void>
}

const LogContext = createContext<LogContextValue | null>(null)

export function useLog() {
  const value = useContext(LogContext)
  if (!value) throw new Error("useLog must be used inside LogProvider")
  return value
}

function eatenAtFor(date: string, timeZone: string) {
  const now = nowInZone(timeZone)
  const time = date === now.date ? now.time : "12:00"
  return zonedTimeToUtc(`${date}T${time}:00`, timeZone).toISOString()
}

function nowInZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00"
  const hour = get("hour") === "24" ? "00" : get("hour")
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour}:${get("minute")}` }
}

export function LogProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { me, invalidate } = useSession()
  const zone = me?.profile?.timezone || "Africa/Johannesburg"
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(() => todayIso(zone))
  const [slot, setSlot] = useState<Slot>("dinner")
  const [when, setWhen] = useState(() => new Date().toISOString())
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [recents, setRecents] = useState<Meal[]>([])

  function openLog(opts?: { date?: string; slot?: Slot }) {
    const nextDate = opts?.date || todayIso(zone)
    const nextSlot = opts?.slot || (defaultSlot() as Slot)
    setDate(nextDate)
    setSlot(nextSlot)
    setWhen(eatenAtFor(nextDate, zone))
    setOpen(true)
    void import("@/lib/api").then(({ fetchDay }) =>
      fetchDay(nextDate)
        .then((data) => setRecents(data.recentMeals))
        .catch(() => setRecents([])),
    )
  }

  async function run(work: () => Promise<void>) {
    setBusy(true)
    try {
      await work()
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not log that meal.")
    } finally {
      setBusy(false)
    }
  }

  async function describe(textValue: string, forDate?: string, forSlot?: Slot) {
    const trimmed = textValue.trim()
    if (trimmed.length < 2) {
      toast.error("Describe the meal in a few words.")
      return
    }
    await run(async () => {
      const analysis = await parseMealText(trimmed)
      writeDraft(
        draftFromAnalysis(analysis, {
          inputType: "text",
          slot: forSlot || slot,
          eatenAt: forDate ? eatenAtFor(forDate, zone) : when,
          note: trimmed,
        }),
      )
      navigate("/log/confirm")
    })
  }

  async function photo(file: File, forDate?: string, forSlot?: Slot) {
    await run(async () => {
      const uploaded = await uploadPhoto(file, "meal")
      const analysis = await analyzeMealPhoto(uploaded.key)
      writeDraft(
        draftFromAnalysis(analysis, {
          inputType: "photo",
          slot: forSlot || slot,
          eatenAt: forDate ? eatenAtFor(forDate, zone) : when,
          photoKey: uploaded.key,
          photoPreview: uploaded.preview,
        }),
      )
      navigate("/log/confirm")
    })
  }

  async function label(file: File, forDate?: string, forSlot?: Slot) {
    await run(async () => {
      const uploaded = await uploadPhoto(file, "label")
      const read = await readNutritionLabel(uploaded.key)
      sessionStorage.setItem(
        "deit.label",
        JSON.stringify({
          ...read,
          photoKey: uploaded.key,
          photoPreview: uploaded.preview,
          slot: forSlot || slot,
          eatenAt: forDate ? eatenAtFor(forDate, zone) : when,
        }),
      )
      navigate("/log/label")
    })
  }

  async function again(meal: Meal, forDate?: string) {
    await run(async () => {
      await logAgain(meal.id, forDate ? eatenAtFor(forDate, zone) : new Date().toISOString(), meal.slot)
      invalidate()
      toast.success("Logged again.")
      navigate(forDate ? `/?date=${forDate}` : "/")
    })
  }

  const desktop = useDesktop()
  const value: LogContextValue = { busy, openLog, describe, photo, label, again }
  const body = (
    <LogMenu
      date={date}
      slot={slot}
      when={when}
      zone={zone}
      text={text}
      busy={busy}
      recents={recents}
      onSlot={setSlot}
      onWhen={setWhen}
      onText={setText}
      onDescribe={() => void describe(text)}
      onPhoto={(file) => void photo(file)}
      onLabel={(file) => void label(file)}
      onSearch={() => {
        writeDraft(emptyDraft({ slot, eatenAt: when, inputType: "search" }))
        setOpen(false)
        navigate(`/search?slot=${slot}&date=${date}`)
      }}
      onAgain={(meal) => void again(meal, date)}
    />
  )

  return (
    <LogContext.Provider value={value}>
      {children}
      {desktop ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg bg-[#16161a] sm:max-w-lg">
            <DialogTitle className="text-2xl font-semibold tracking-tight">Log a meal</DialogTitle>
            {body}
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[92dvh] rounded-t-[28px] border-border bg-[#16161a] px-4 pb-6">
            <SheetTitle className="text-2xl font-semibold tracking-tight">Log a meal</SheetTitle>
            {body}
          </SheetContent>
        </Sheet>
      )}
    </LogContext.Provider>
  )
}

function useDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches)
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)")
    const onChange = () => setDesktop(media.matches)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])
  return desktop
}

function LogMenu({
  date,
  slot,
  when,
  zone,
  text,
  busy,
  recents,
  onSlot,
  onWhen,
  onText,
  onDescribe,
  onPhoto,
  onLabel,
  onSearch,
  onAgain,
}: {
  date: string
  slot: Slot
  when: string
  zone: string
  text: string
  busy: boolean
  recents: Meal[]
  onSlot: (slot: Slot) => void
  onWhen: (value: string) => void
  onText: (value: string) => void
  onDescribe: () => void
  onPhoto: (file: File) => void
  onLabel: (file: File) => void
  onSearch: () => void
  onAgain: (meal: Meal) => void
}) {
  const unique = recents.filter((meal, index, list) => list.findIndex((item) => item.note === meal.note) === index).slice(0, 2)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-1 rounded-full bg-background p-1">
        {SLOTS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSlot(item.id)}
            className={cn("rounded-full py-2 text-sm", slot === item.id ? "bg-secondary text-foreground" : "text-muted-foreground")}
          >
            {item.short}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        Today {formatClock(when, zone)} ·
        <input
          type="datetime-local"
          value={toLocal(when)}
          onChange={(event) => onWhen(new Date(event.target.value).toISOString())}
          className="bg-transparent text-foreground outline-none"
        />
      </label>
      <ActionRow index="01" title="Snap meal" detail="AI spots the food and grams" disabled={busy} onFile={onPhoto} capture>
        <span className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground">
          <Camera className="size-5" />
        </span>
      </ActionRow>
      <ActionRow index="02" title="Label photo" detail="Read a packaged food's label" disabled={busy} onFile={onLabel} capture>
        <span className="grid size-11 place-items-center rounded-full border border-border">
          <FileText className="size-5" />
        </span>
      </ActionRow>
      <button type="button" onClick={onSearch} className="flex w-full items-center gap-3 py-2 text-left">
        <span className="w-6 text-xs text-muted-foreground">03</span>
        <span className="flex-1">
          <span className="block text-lg font-semibold">Search</span>
          <span className="text-sm text-muted-foreground">USDA plus your group's foods</span>
        </span>
        <span className="grid size-11 place-items-center rounded-full border border-border">
          <Search className="size-5" />
        </span>
      </button>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          onDescribe()
        }}
      >
        <Input
          value={text}
          onChange={(event) => onText(event.target.value)}
          placeholder="chicken stir-fry with noodles, a bowl"
          className="h-12 rounded-full px-4"
        />
        <Button type="submit" size="icon" className="size-12 rounded-full" disabled={busy} aria-label="Analyse description">
          <ArrowUp />
        </Button>
      </form>
      {unique.length > 0 && (
        <div>
          <p className="eyebrow mb-2">Log again</p>
          <div className="grid grid-cols-2 gap-2">
            {unique.map((meal) => (
              <button key={meal.id} type="button" onClick={() => onAgain(meal)} className="rounded-2xl border border-border px-3 py-3 text-left">
                <span className="block text-sm font-medium">{meal.note || meal.items[0]?.name}</span>
                <span className="text-xs text-muted-foreground">
                  {Math.round(meal.kcal)} kcal · {Math.round(meal.proteinG)} g P
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="sr-only">{date}</p>
    </div>
  )
}

function ActionRow({
  index,
  title,
  detail,
  children,
  onFile,
  disabled,
  capture,
}: {
  index: string
  title: string
  detail: string
  children: ReactNode
  onFile: (file: File) => void
  disabled?: boolean
  capture?: boolean
}) {
  return (
    <label className={cn("flex items-center gap-3 py-1", disabled && "pointer-events-none opacity-60")}>
      <span className="w-6 text-xs text-muted-foreground">{index}</span>
      <span className="flex-1">
        <span className="block text-lg font-semibold">{title}</span>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </span>
      {children}
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
    </label>
  )
}

function toLocal(iso: string) {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function slotName(slot: string) {
  return slotLabel(slot, false)
}
