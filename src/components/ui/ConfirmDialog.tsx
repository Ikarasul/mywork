import Button from './Button'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-app/80 p-4 backdrop-blur-xs"
    >
      <div className="card-surface w-full max-w-md rounded-2xl border-2 border-status-danger p-6 shadow-xl">
        <h2 id="confirm-dialog-title" className="text-lg font-bold text-ink">
          {title}
        </h2>
        <p className="mt-2 text-sm text-ink-secondary">{description}</p>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="md"
            disabled={loading}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            size="md"
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? 'กำลังดำเนินการ...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
