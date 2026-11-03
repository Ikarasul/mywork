import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'mint'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const variantClasses: Record<ButtonVariant, string> = {
    primary:
      'bg-primary text-ink-inverted hover:bg-primary-hover border border-transparent shadow-2xs',
    secondary:
      'bg-primary-soft text-primary-fg hover:bg-surface-hover border border-line',
    outline:
      'bg-surface text-ink hover:bg-surface-hover border border-line-strong',
    danger:
      'bg-status-danger-soft text-status-danger-fg hover:opacity-90 border border-status-danger',
    mint:
      'bg-accent-mint text-ink-inverted hover:opacity-90 border border-transparent shadow-2xs',
    ghost:
      'bg-transparent text-ink-secondary hover:bg-surface-hover border border-transparent',
  }

  const sizeClasses: Record<ButtonSize, string> = {
    sm: 'min-h-[44px] sm:min-h-[36px] px-3 py-1.5 text-xs',
    md: 'min-h-[44px] px-4 py-2 text-sm',
    lg: 'min-h-[48px] px-5 py-2.5 text-base',
  }

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export default Button
