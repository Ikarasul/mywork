import type { ReactNode } from 'react'
import PixelCat from '../PixelCat'

export interface SkeletonProps {
  lines?: number
  className?: string
  illustration?: ReactNode
  label?: string
}

export function Skeleton({
  lines = 3,
  className = '',
  illustration,
  label = 'แมวเหมียวกำลังจัดตารางข้อมูลให้คุณ...',
}: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`card-surface rounded-2xl p-6 ${className}`}
    >
      <div className="mb-4 flex flex-col items-center justify-center gap-2">
        {illustration ?? <PixelCat mood="idle" size={52} />}
        <span className="text-xs font-medium text-ink-muted">{label}</span>
      </div>
      <div className="space-y-3 animate-pulse">
        {Array.from({ length: lines }).map((_, idx) => (
          <div
            key={idx}
            className={`h-4 rounded-lg bg-surface-hover ${
              idx === lines - 1 ? 'w-2/3' : 'w-full'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

export default Skeleton
