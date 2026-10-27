import { Navigate, Route, Routes, useNavigate } from "react-router"
import { Toaster } from "@/components/ui/sonner"
import { DesktopNav, MobileNav } from "@/components/shell"
import { LogProvider, useLog } from "@/components/log-provider"
import { AuthPage } from "@/pages/auth-page"
import { ConfirmPage } from "@/pages/confirm-page"
import { GoalsPage } from "@/pages/goals-page"
import { HistoryPage } from "@/pages/history-page"
import { LabelPage } from "@/pages/label-page"
import { OnboardingPage } from "@/pages/onboarding-page"
import { SearchPage } from "@/pages/search-page"
import { TodayPage } from "@/pages/today-page"
import { draftFromMeal, writeDraft } from "@/lib/draft"
import { useSession } from "@/lib/session"
import type { Meal } from "@/lib/types"

export default function App() {
  return (
    <LogProvider>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/*" element={<AuthedApp />} />
      </Routes>
    </LogProvider>
  )
}

function AuthedApp() {
  const { status, me } = useSession()
  const log = useLog()
  const navigate = useNavigate()

  if (status === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="text-sm text-muted-foreground">Loading Deit…</p>
      </div>
    )
  }
  if (status === "anon") return <Navigate to="/login" replace />
  if (!me?.profile?.onboarded) return <Navigate to="/onboarding" replace />

  function edit(meal: Meal) {
    writeDraft(draftFromMeal(meal))
    navigate("/log/confirm")
  }

  return (
    <div className="min-h-dvh">
      <DesktopNav onLog={() => log.openLog()} onSearch={(query) => navigate(`/search?q=${encodeURIComponent(query)}`)} />
      <main className="mx-auto w-full max-w-6xl px-5 pt-6 pb-28 lg:px-8 lg:pt-8 lg:pb-16">
        <Routes>
          <Route
            path="/"
            element={
              <TodayPage
                busy={log.busy}
                onLog={(date, slot) => log.openLog({ date, slot })}
                onDescribe={(text, date) => void log.describe(text, date)}
                onPhoto={(file, date) => void log.photo(file, date)}
                onLabel={(file, date) => void log.label(file, date)}
                onLogAgain={(meal, date) => void log.again(meal, date)}
              />
            }
          />
          <Route path="/history" element={<HistoryPage onEdit={edit} />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/log/confirm" element={<ConfirmPage />} />
          <Route path="/log/label" element={<LabelPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <MobileNav onLog={() => log.openLog()} />
    </div>
  )
}
