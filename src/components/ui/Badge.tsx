import type { HTMLAttributes, ReactNode } from 'react'

export type BadgeTone =
  | 'neutral'
  | 'primary'
  | 'pink'
  | 'sky'
  | 'amber'
  | 'mint'
  | 'success'
  | 'warning'
  | 'danger'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  children: ReactNode
}

export function Badge({
  tone = 'neutral',
  className = '',
  children,
  ...rest
}: BadgeProps) {
  const toneClasses: Record<BadgeTone, string> = {
    neutral: 'bg-surface-alt text-ink-secondary border-line',
    primary: 'bg-primary-soft text-primary-fg border-primary',
    pink: 'bg-accent-pink-soft text-accent-pink-fg border-accent-pink',
    sky: 'bg-accent-sky-soft text-accent-sky-fg border-accent-sky',
    amber: 'bg-accent-amber-soft text-accent-amber-fg border-accent-amber',
    mint: 'bg-accent-mint-soft text-accent-mint-fg border-accent-mint',
    success: 'bg-status-success-soft text-status-success-fg border-status-success',
    warning: 'bg-status-warning-soft text-status-warning-fg border-status-warning',
    danger: 'bg-status-danger-soft text-status-danger-fg border-status-danger',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneClasses[tone]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  )
}

export default Badge
