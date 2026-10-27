import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { Navigate, useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Logo } from "@/components/visuals"
import { authClient } from "@/lib/auth"
import { useSession } from "@/lib/session"

export function AuthPage() {
  const { status, googleEnabled, refresh } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const resetToken = params.get("token")
  const [mode, setMode] = useState<"in" | "up" | "reset">(params.get("error") ? "reset" : "in")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (params.get("error")) toast.error("That reset link is invalid or expired.")
  }, [params])

  if (status === "ready" && !resetToken) return <Navigate to="/" replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      if (resetToken) {
        const result = await authClient.resetPassword({ newPassword: password, token: resetToken })
        if (result.error) throw new Error(result.error.message || "Could not reset the password.")
        toast.success("Password updated. Sign in with the new one.")
        navigate("/login", { replace: true })
        return
      }
      if (mode === "reset") {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/login`,
        })
        if (result.error) throw new Error(result.error.message || "Could not send the reset link.")
        toast.success("If that email exists, a reset link was issued. In local dev it is printed by the API.")
        setMode("in")
        return
      }
      const result =
        mode === "up"
          ? await authClient.signUp.email({ email, password, name: name || email.split("@")[0] })
          : await authClient.signIn.email({ email, password })
      if (result.error) throw new Error(result.error.message || "Sign-in failed.")
      const me = await refresh()
      navigate(me?.profile?.onboarded ? "/" : "/onboarding", { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign-in failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex items-center gap-3">
        <Logo className="size-9" />
        <div>
          <p className="text-lg font-semibold tracking-tight">Deit</p>
          <p className="text-sm text-muted-foreground">Photo-first logging. Numbers from a real database.</p>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-[28px] border border-border bg-card p-5">
        {resetToken ? (
          <p className="text-sm text-muted-foreground">Choose a new password for this account.</p>
        ) : (
          <div className="flex gap-2">
            {(["in", "up"] as const).map((item) => (
              <Button
                key={item}
                type="button"
                variant={mode === item ? "default" : "secondary"}
                className="h-9 flex-1 rounded-full"
                onClick={() => setMode(item)}
              >
                {item === "in" ? "Sign in" : "Create account"}
              </Button>
            ))}
          </div>
        )}
        {mode === "up" && !resetToken && (
          <Field label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="h-11 rounded-xl" />
          </Field>
        )}
        {resetToken ? null : <Field label="Email">
          <Input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="h-11 rounded-xl"
          />
        </Field>}
        {resetToken ? (
          <Field label="New password">
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              className="h-11 rounded-xl"
            />
          </Field>
        ) : mode !== "reset" && (
          <Field label="Password">
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "up" ? "new-password" : "current-password"}
              className="h-11 rounded-xl"
            />
          </Field>
        )}
        <Button type="submit" disabled={busy} className="h-12 w-full rounded-full text-base">
          {busy ? "Please wait…" : resetToken ? "Update password" : mode === "up" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
        </Button>
        {mode === "in" && !resetToken && (
          <button type="button" className="w-full text-sm text-muted-foreground" onClick={() => setMode("reset")}>
            Forgot password
          </button>
        )}
        {googleEnabled && mode !== "reset" && (
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-full"
            onClick={() => {
              void authClient.signIn.social({ provider: "google", callbackURL: window.location.origin })
            }}
          >
            Continue with Google
          </Button>
        )}
      </form>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Local demo: demo@deit.app / demopass
      </p>
    </main>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
