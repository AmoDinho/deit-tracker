import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { nutritionForGrams } from "@deit/domain"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SourceBadge } from "@/components/visuals"
import { searchFoods } from "@/lib/api"
import { emptyDraft, itemFromFood, readDraft, writeDraft } from "@/lib/draft"
import { slotLabel } from "@/lib/format"
import type { Food } from "@/lib/types"
import { cn } from "@/lib/utils"

const filters = [
  { id: "all", label: "All", source: null },
  { id: "group", label: "Group", source: "group" },
  { id: "usda", label: "USDA", source: "usda" },
] as const

export function SearchPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initial = params.get("q") || ""
  const slot = params.get("slot") || readDraft()?.slot || "dinner"
  const [query, setQuery] = useState(initial)
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all")
  const [foods, setFoods] = useState<Food[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [grams, setGrams] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const source = filters.find((item) => item.id === filter)?.source
      searchFoods(query, source)
        .then((rows) => {
          setFoods(rows)
          setOpenId(rows[0]?.id ?? null)
          setError(null)
        })
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Search failed."))
    }, 180)
    return () => window.clearTimeout(handle)
  }, [query, filter])

  function add(food: Food) {
    const serving = food.servings.find((item) => item.grams === grams) ?? food.servings[0]
    const amount = grams ?? serving?.grams ?? 100
    const draft = readDraft() ?? emptyDraft({ slot, eatenAt: new Date().toISOString(), inputType: "search" })
    draft.items = params.get("add") === "1" ? [...draft.items, itemFromFood(food, amount)] : [itemFromFood(food, amount)]
    draft.slot = draft.slot || slot
    draft.inputType = draft.inputType === "photo" || draft.inputType === "text" ? draft.inputType : "search"
    writeDraft(draft)
    navigate("/log/confirm")
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="secondary" size="icon" className="size-11 rounded-full" asChild>
          <Link to="/" aria-label="Back">
            ←
          </Link>
        </Button>
        <div className="flex h-12 flex-1 items-center gap-2 rounded-full border border-border bg-card px-3">
          <Search className="size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search foods"
            className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            autoFocus
          />
          <span className="text-xs text-muted-foreground">{foods.length} results</span>
        </div>
      </div>
      <div className="mb-4 flex gap-2">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn("rounded-full px-4 py-1.5 text-sm", filter === item.id ? "bg-foreground text-background" : "bg-secondary text-muted-foreground")}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        {foods.map((food, index) => {
          const open = food.id === openId
          const serving = food.servings.find((item) => item.grams === grams) ?? food.servings[Math.min(1, food.servings.length - 1)]
          const amount = grams ?? serving?.grams ?? 100
          const nutrition = nutritionForGrams(food, amount)
          return (
            <article key={food.id} className="rounded-3xl border border-border bg-card/40 p-4">
              <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => { setOpenId(food.id); setGrams(null) }}>
                <span className="w-6 text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                <span className="flex-1">
                  <span className="block text-lg font-semibold">{food.name}</span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <SourceBadge source={food.source} />
                    {Math.round(food.kcal100g)} kcal / 100 g
                  </span>
                </span>
                <span className="tabular-nums">{Math.round(nutrition.kcal)}</span>
              </button>
              {open && (
                <div className="mt-3 pl-9">
                  <div className="flex flex-wrap gap-2">
                    {food.servings.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setGrams(item.grams)}
                        className={cn("rounded-full border px-3 py-1.5 text-sm", amount === item.grams ? "border-foreground bg-secondary" : "border-border")}
                      >
                        {item.label} · {Math.round(item.grams)} g
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setGrams(amount === grams && !serving ? grams : 100)}
                      className={cn("rounded-full border px-3 py-1.5 text-sm", !serving || grams && !food.servings.some((item) => item.grams === grams) ? "border-foreground" : "border-border")}
                    >
                      grams
                    </button>
                  </div>
                  {!food.servings.some((item) => item.grams === amount) && (
                    <Input inputMode="decimal" value={amount} onChange={(event) => setGrams(Number(event.target.value) || 0)} className="mt-2 h-10 w-28 rounded-full" />
                  )}
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      {Math.round(nutrition.proteinG)} P · {Math.round(nutrition.carbsG)} C · {Math.round(nutrition.fatG)} F
                    </p>
                    <Button className="rounded-full" onClick={() => add(food)}>
                      Add to {slotLabel(slot, false).toLowerCase()}
                    </Button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
      <Button variant="outline" className="mt-6 h-12 w-full rounded-full" asChild>
        <Link to="/log/label">Not here? Photograph the label</Link>
      </Button>
    </div>
  )
}
