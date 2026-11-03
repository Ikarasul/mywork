import type { HTMLAttributes, ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function Card({
  children,
  padding = 'md',
  className = '',
  ...rest
}: CardProps) {
  const padClass =
    padding === 'none'
      ? ''
      : padding === 'sm'
        ? 'p-3.5 sm:p-4'
        : padding === 'lg'
          ? 'p-6 sm:p-8'
          : 'p-4 sm:p-6'

  return (
    <div
      className={`card-surface rounded-2xl transition-colors ${padClass} ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

export default Card
