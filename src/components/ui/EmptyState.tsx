import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  description?: string
  illustration?: ReactNode
  action?: ReactNode
}

export function EmptyState({
  title,
  description,
  illustration,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface-alt px-6 py-10 text-center">
      {illustration && <div className="mb-3">{illustration}</div>}
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-xs text-ink-muted sm:text-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export default EmptyState
