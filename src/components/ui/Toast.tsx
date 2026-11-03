export type ToastTone = 'success' | 'warning' | 'danger' | 'info'

export interface ToastProps {
  message: string | null
  tone?: ToastTone
  onClose?: () => void
}

export function Toast({ message, tone = 'info', onClose }: ToastProps) {
  if (!message) return null

  const toneClasses: Record<ToastTone, string> = {
    success:
      'bg-status-success-soft text-status-success-fg border-status-success',
    warning:
      'bg-status-warning-soft text-status-warning-fg border-status-warning',
    danger: 'bg-status-danger-soft text-status-danger-fg border-status-danger',
    info: 'bg-primary-soft text-primary-fg border-primary',
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start justify-between gap-3 rounded-xl border p-3.5 text-sm shadow-sm ${toneClasses[tone]}`}
    >
      <div className="whitespace-pre-line font-medium">{message}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดข้อความแจ้งเตือน"
          className="min-h-[32px] min-w-[32px] shrink-0 rounded-lg px-2 text-xs font-bold hover:opacity-75"
        >
          ✕
        </button>
      )}
    </div>
  )
}

export default Toast
