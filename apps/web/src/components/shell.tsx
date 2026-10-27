import { CalendarDays, House, Plus, Target, UserRound } from "lucide-react"
import { NavLink, useLocation, useNavigate } from "react-router"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Logo } from "@/components/visuals"
import { authClient } from "@/lib/auth"
import { useSession } from "@/lib/session"
import { cn } from "@/lib/utils"

const links = [
  { to: "/", label: "Today", icon: House, end: true },
  { to: "/history", label: "History", icon: CalendarDays, end: false },
  { to: "/goals", label: "Goals", icon: Target, end: false },
]

export function DesktopNav({ onLog, onSearch }: { onLog: () => void; onSearch: (query: string) => void }) {
  const { me } = useSession()
  const navigate = useNavigate()
  const initial = me?.user.name?.slice(0, 1).toUpperCase() || "D"

  return (
    <header className="sticky top-0 z-30 hidden border-b border-border/80 bg-background/90 backdrop-blur-xl lg:block">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-8">
        <NavLink to="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <Logo />
          Deit
        </NavLink>
        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  "rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors",
                  isActive && "bg-secondary text-foreground",
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <form
          className="ml-auto flex h-10 w-56 items-center rounded-full border border-border bg-card px-3"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            onSearch(String(data.get("q") || ""))
          }}
        >
          <input
            name="q"
            aria-label="Search foods"
            placeholder="Search foods"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">⌘K</kbd>
        </form>
        <Button className="h-10 rounded-full px-4" onClick={onLog}>
          <Plus />
          Log a meal
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label="Account">
              <Avatar className="size-9">
                <AvatarImage src={me?.user.image || undefined} alt="" />
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate("/goals")}>Goals & account</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                void authClient.signOut().then(() => navigate("/login"))
              }}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

export function MobileNav({ onLog }: { onLog: () => void }) {
  const location = useLocation()
  return (
    <nav className="fixed inset-x-0 bottom-[max(0.85rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:hidden">
      <div className="flex h-16 w-full max-w-md items-center justify-between rounded-full border border-white/5 bg-[#1a1a1e]/95 px-3 shadow-2xl backdrop-blur-xl">
        <MobileLink to="/" label="Today" icon={House} active={location.pathname === "/"} />
        <MobileLink to="/history" label="History" icon={CalendarDays} active={location.pathname.startsWith("/history")} />
        <button
          type="button"
          onClick={onLog}
          className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(200,245,49,0.25)]"
          aria-label="Log a meal"
        >
          <Plus className="size-6" />
        </button>
        <MobileLink to="/goals" label="Goals" icon={Target} active={location.pathname.startsWith("/goals")} />
        <MobileLink to="/goals" label="Account" icon={UserRound} active={false} />
      </div>
    </nav>
  )
}

function MobileLink({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string
  label: string
  icon: typeof House
  active: boolean
}) {
  return (
    <NavLink
      to={to}
      className={cn(
        "flex min-w-14 flex-col items-center gap-0.5 rounded-full px-2 py-1.5 text-[10px] text-muted-foreground",
        active && "bg-secondary text-foreground",
      )}
    >
      <Icon className="size-5" />
      {label}
    </NavLink>
  )
}
