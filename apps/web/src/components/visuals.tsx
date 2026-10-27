import type { ReactNode } from "react"
import { displayEnergy } from "@deit/domain"
import { cn } from "@/lib/utils"
import { formatMacro, formatNumber, sourceLabel } from "@/lib/format"
import type { EnergyUnit } from "@/lib/types"

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block size-7 shrink-0 rounded-[9px] bg-primary shadow-[0_0_0_4px_rgba(200,245,49,0.08)]", className)}
      aria-hidden
    />
  )
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("eyebrow", className)}>{children}</p>
}

export function Energy({
  kcal,
  unit,
  className,
}: {
  kcal: number
  unit: EnergyUnit
  className?: string
}) {
  return <span className={className}>{formatNumber(displayEnergy(kcal, unit))}</span>
}

export function CalorieRing({
  percent,
  size = 108,
  stroke = 9,
}: {
  percent: number
  size?: number
  stroke?: number
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(140, percent))
  const drawn = Math.min(100, clamped)
  const offset = circumference - (drawn / 100) * circumference
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#232328" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#c8f531"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#f5f5f6"
        fontSize={size > 96 ? 18 : 14}
        fontWeight="600"
      >
        {Math.round(Math.min(percent, 999))}%
      </text>
    </svg>
  )
}

export function MacroRow({
  label,
  value,
  target,
  color,
}: {
  label: string
  value: number
  target: number
  color: string
}) {
  const width = target > 0 ? Math.min(100, (value / target) * 100) : 0
  return (
    <div className="grid grid-cols-[4.6rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/80 py-3 last:border-b-0">
      <span className="text-[15px] font-medium">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
      </div>
      <span className="text-sm tabular-nums text-muted-foreground">
        <span className="text-foreground">{formatMacro(value)}</span>
        <span> / {formatMacro(target)} g</span>
      </span>
    </div>
  )
}

export function SourceBadge({ source }: { source: string | null | undefined }) {
  const label = sourceLabel(source)
  const group = label === "GROUP"
  const usda = label === "USDA"
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md px-1.5 text-[10px] font-semibold tracking-wide",
        group && "bg-primary/15 text-primary",
        usda && "bg-protein/15 text-protein",
        !group && !usda && "bg-secondary text-muted-foreground",
      )}
    >
      {label}
    </span>
  )
}

export function PhotoFrame({
  src,
  label = "[Meal photo]",
  className,
}: {
  src?: string | null
  label?: string
  className?: string
}) {
  return (
    <div className={cn("photo-placeholder relative overflow-hidden rounded-[28px] border border-white/5", className)}>
      {src ? (
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">{label}</div>
      )}
    </div>
  )
}

export function IndexMark({ index }: { index: number }) {
  return <span className="w-6 shrink-0 pt-1 text-xs tabular-nums text-muted-foreground">{String(index).padStart(2, "0")}</span>
}
