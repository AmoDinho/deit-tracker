import { useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eyebrow } from "@/components/visuals"
import { deleteAccount, setGoals, updatePreferences } from "@/lib/api"
import { authClient } from "@/lib/auth"
import { formatNumber } from "@/lib/format"
import { useSession } from "@/lib/session"
import { cn } from "@/lib/utils"

export function GoalsPage() {
  const { me, refresh } = useSession()
  const navigate = useNavigate()
  const goal = me?.goal
  const profile = me?.profile
  const [calories, setCalories] = useState(String(goal?.calories ?? ""))
  const [protein, setProtein] = useState(String(goal?.proteinG ?? ""))
  const [carbs, setCarbs] = useState(String(goal?.carbsG ?? ""))
  const [fat, setFat] = useState(String(goal?.fatG ?? ""))
  const [unit, setUnit] = useState(profile?.energyUnit === "kJ" ? "kJ" : "kcal")
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await setGoals({
        calories: Number(calories),
        proteinG: Number(protein),
        carbsG: Number(carbs),
        fatG: Number(fat),
      })
      if (unit !== profile?.energyUnit) await updatePreferences(unit, profile?.timezone)
      await refresh()
      toast.success("Targets saved.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save targets.")
    } finally {
      setBusy(false)
    }
  }

  async function changeUnit(next: "kcal" | "kJ") {
    setUnit(next)
    try {
      await updatePreferences(next, profile?.timezone)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the unit.")
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Eyebrow>Targets</Eyebrow>
      <h1 className="mt-1 text-4xl font-semibold tracking-tight">Goals</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Calculated from your body, then yours to override. Past days keep the target that was in force then.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-4">
        <TargetField label="Calories" value={calories} onChange={setCalories} />
        <TargetField label="Protein g" value={protein} onChange={setProtein} />
        <TargetField label="Carbs g" value={carbs} onChange={setCarbs} />
        <TargetField label="Fat g" value={fat} onChange={setFat} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="h-11 rounded-full px-5" disabled={busy} onClick={() => void save()}>
          Save targets
        </Button>
        <Button variant="outline" className="h-11 rounded-full" onClick={() => navigate("/onboarding")}>
          Recalculate from body stats
        </Button>
      </div>

      {goal && (
        <div className="mt-8 rounded-[28px] border border-border bg-card p-5">
          <Eyebrow>How the current calculation works</Eyebrow>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Mini label="BMR" value={goal.bmr ? formatNumber(goal.bmr) : "—"} />
            <Mini label="TDEE" value={goal.tdee ? formatNumber(goal.tdee) : "—"} />
            <Mini label="Adjustment" value={goal.adjustment == null ? "—" : `${goal.adjustment > 0 ? "+" : ""}${formatNumber(goal.adjustment)}`} />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {profile?.heightCm ?? "—"} cm · {profile?.weightKg ?? "—"} kg · {profile?.age ?? "—"} · {profile?.sex ?? "—"} · {profile?.activityLevel ?? "—"}
          </p>
          {goal.warnings[0] && <p className="mt-3 text-sm text-muted-foreground">{goal.warnings.at(-1)}</p>}
        </div>
      )}

      <section className="mt-8">
        <Eyebrow>Energy unit</Eyebrow>
        <div className="mt-3 flex w-fit rounded-full bg-secondary p-1">
          {(["kcal", "kJ"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => void changeUnit(item)}
              className={cn("rounded-full px-4 py-1.5 text-sm", unit === item ? "bg-background" : "text-muted-foreground")}
            >
              {item}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">South African labels lead with kilojoules. We store kcal either way.</p>
      </section>

      <section className="mt-10 border-t border-border pt-6">
        <Eyebrow>Account</Eyebrow>
        <p className="mt-2 text-sm">{me?.user.email}</p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => {
              void authClient.signOut().then(() => navigate("/login"))
            }}
          >
            Sign out
          </Button>
          <Button variant="destructive" className="rounded-full" onClick={() => setConfirmDelete(true)}>
            Delete account
          </Button>
        </div>
      </section>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this account?</DialogTitle>
            <DialogDescription>Meals, photos and targets for this login are removed. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void deleteAccount()
                  .then(() => authClient.signOut())
                  .then(() => navigate("/login"))
                  .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not delete the account."))
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TargetField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input inputMode="numeric" value={value} onChange={(event) => onChange(event.target.value)} className="h-12 rounded-xl text-lg" />
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
