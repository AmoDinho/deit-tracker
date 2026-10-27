import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { gql, ME_QUERY } from "./api"
import { authClient } from "./auth"
import type { Me } from "./types"

type SessionValue = {
  loading: boolean
  status: "loading" | "anon" | "ready"
  sessionUser: { id: string; name: string; email: string; image?: string | null } | null
  me: Me | null
  googleEnabled: boolean
  refresh: () => Promise<Me | null>
  signOut: () => Promise<void>
  revision: number
  invalidate: () => void
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession()
  const [me, setMe] = useState<Me | null>(null)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [meLoading, setMeLoading] = useState(false)
  const [revision, setRevision] = useState(0)

  const refresh = useCallback(async () => {
    const data = await gql<{ googleEnabled: boolean; me: Me | null }>(ME_QUERY)
    setGoogleEnabled(data.googleEnabled)
    setMe(data.me)
    return data.me
  }, [])

  useEffect(() => {
    let cancelled = false
    if (session.isPending) return
    if (!session.data?.user) {
      setMe(null)
      setMeLoading(false)
      gql<{ googleEnabled: boolean }>(`query { googleEnabled }`)
        .then((data) => {
          if (!cancelled) setGoogleEnabled(data.googleEnabled)
        })
        .catch(() => {
          if (!cancelled) setGoogleEnabled(false)
        })
      return () => {
        cancelled = true
      }
    }
    setMeLoading(true)
    refresh()
      .catch(() => {
        if (!cancelled) setMe(null)
      })
      .finally(() => {
        if (!cancelled) setMeLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session.data?.user?.id, session.isPending, refresh])

  const value = useMemo<SessionValue>(
    () => ({
      loading: session.isPending || meLoading,
      status: session.isPending || meLoading ? "loading" : session.data?.user ? "ready" : "anon",
      sessionUser: session.data?.user ?? null,
      me,
      googleEnabled,
      refresh,
      signOut: async () => {
        await authClient.signOut()
        setMe(null)
      },
      revision,
      invalidate: () => setRevision((current) => current + 1),
    }),
    [googleEnabled, me, meLoading, refresh, revision, session.data?.user, session.isPending],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error("useSession must be used inside SessionProvider")
  return value
}
