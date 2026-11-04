import { IconCalendarDays, IconRefreshCw, IconX } from './icons'
import { Badge, Button, Toast } from './ui'
import { formatDateTimeThai } from '../lib/dateThai'
import { isSupabaseConfigured } from '../lib/supabase'
import type { DayOfWeek, GoogleCalendarEventItem } from '../types'

const DAY_NAMES: Record<DayOfWeek, string> = {
  MON: 'จันทร์',
  TUE: 'อังคาร',
  WED: 'พุธ',
  THU: 'พฤหัสบดี',
  FRI: 'ศุกร์',
  SAT: 'เสาร์',
  SUN: 'อาทิตย์',
}

export interface GoogleCalendarSyncBarProps {
  eventsCount: number
  lastSyncedAt: string | null
  weekRangeLabel: string
  overlayVisible: boolean
  onToggleOverlay: (visible: boolean) => void
  autoSyncEnabled?: boolean
  onToggleAutoSync?: (enabled: boolean) => void
  onRequestWriteScope?: () => void
  syncing: boolean
  syncError: string | null
  syncSuccessMessage: string | null
  onClearError: () => void
  onClearSuccess: () => void
  onSyncNow: () => void
  onClearEvents: () => void
}

export function GoogleCalendarSyncBar({
  eventsCount,
  lastSyncedAt,
  weekRangeLabel,
  overlayVisible,
  onToggleOverlay,
  autoSyncEnabled = true,
  onToggleAutoSync,
  onRequestWriteScope,
  syncing,
  syncError,
  syncSuccessMessage,
  onClearError,
  onClearSuccess,
  onSyncNow,
  onClearEvents,
}: GoogleCalendarSyncBarProps) {
  const isPermissionError =
    syncError &&
    (syncError.includes('Scope') ||
      syncError.includes('insufficient') ||
      syncError.includes('403') ||
      syncError.includes('สิทธิ์'))

  return (
    <div className="rounded-2xl border border-line bg-surface-alt p-3.5 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-extrabold text-ink sm:text-sm">
              <IconCalendarDays className="h-4 w-4 text-accent-sky-fg" />
              <span>ซิงก์ปฏิทิน Google Calendar (2 ทาง)</span>
            </span>
            <Badge tone={lastSyncedAt ? 'sky' : 'neutral'}>
              {lastSyncedAt ? `${eventsCount} อีเวนต์สัปดาห์นี้` : 'ยังไม่ได้ซิงก์'}
            </Badge>
            <Badge tone="neutral">สัปดาห์: {weekRangeLabel}</Badge>
            {autoSyncEnabled && (
              <Badge tone="success" className="inline-flex items-center gap-1">
                <span>🔄 อัปเดตกลับอัตโนมัติ</span>
              </Badge>
            )}
          </div>
          <p className="text-xs text-ink-muted">
            {lastSyncedAt
              ? `ซิงก์ล่าสุดเมื่อ ${formatDateTimeThai(lastSyncedAt)} • รองรับการซิงค์ 2 ทาง (ย้ายคาบ / นัดหมาย / สอบ จะอัปเดตไปยัง Google Calendar)`
              : 'กดปุ่มซิงก์เพื่อเชื่อมต่อ Google Calendar ของคุณ (ดึงกิจกรรมมาแสดง และอัปเดตการแก้ไขกลับอัตโนมัติ)'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onToggleAutoSync && (
            <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-alt">
              <input
                type="checkbox"
                checked={autoSyncEnabled}
                onChange={(e) => onToggleAutoSync(e.target.checked)}
                className="rounded border-line-strong text-primary"
              />
              <span>ซิงค์กลับ Google อัตโนมัติ</span>
            </label>
          )}

          {lastSyncedAt && (
            <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink">
              <input
                type="checkbox"
                checked={overlayVisible}
                onChange={(e) => onToggleOverlay(e.target.checked)}
                className="rounded border-line-strong"
              />
              แสดงซ้อนบนตาราง
            </label>
          )}

          {onRequestWriteScope && (
            <Button
              variant="outline"
              size="sm"
              disabled={syncing || !isSupabaseConfigured}
              onClick={onRequestWriteScope}
              title="ขอสิทธิ์เขียนเพื่อให้อัปเดตและลบอีเวนต์บน Google Calendar ได้"
            >
              ขอสิทธิ์บันทึก Google
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            disabled={syncing || !isSupabaseConfigured}
            onClick={onSyncNow}
          >
            {syncing ? (
              'กำลังซิงก์ Google Calendar...'
            ) : (
              <span className="inline-flex items-center gap-1">
                <IconRefreshCw className="h-3.5 w-3.5 shrink-0" />
                <span>ซิงก์ Google Calendar</span>
              </span>
            )}
          </Button>

          {lastSyncedAt && (
            <Button
              variant="outline"
              size="sm"
              disabled={syncing}
              onClick={onClearEvents}
            >
              ล้างข้อมูลซิงก์
            </Button>
          )}
        </div>
      </div>

      {syncSuccessMessage && (
        <div className="mt-3">
          <Toast tone="success" message={syncSuccessMessage} onClose={onClearSuccess} />
        </div>
      )}

      {syncError && (
        <div className="mt-3 flex flex-col gap-2">
          <Toast tone="danger" message={syncError} onClose={onClearError} />
          {isPermissionError && onRequestWriteScope && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
              <span>สิทธิ์การเขียน Google Calendar ยังไม่ได้รับการอนุมัติ</span>
              <button
                type="button"
                onClick={onRequestWriteScope}
                className="font-bold underline hover:no-underline"
              >
                กดที่นี่เพื่อขอสิทธิ์บันทึกปฏิทิน
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export interface GoogleCalendarEventModalProps {
  event: GoogleCalendarEventItem | null
  onClose: () => void
}

export function GoogleCalendarEventModal({
  event,
  onClose,
}: GoogleCalendarEventModalProps) {
  if (!event) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-line pb-3">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="sky" className="inline-flex items-center gap-1">
                <IconCalendarDays className="h-3 w-3 shrink-0" />
                <span>Google Calendar</span>
              </Badge>
              {event.isAllDay && <Badge tone="neutral">ทั้งวัน</Badge>}
            </div>
            <h2 className="mt-2 text-base font-bold text-ink">{event.summary}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl text-sm font-bold text-ink-muted hover:bg-surface-alt hover:text-ink"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 text-xs text-ink-secondary">
          <div>
            <span className="font-semibold text-ink">วัน: </span>
            <span>วัน{DAY_NAMES[event.day]}</span>
          </div>
          <div>
            <span className="font-semibold text-ink">เวลา: </span>
            <span>
              {event.isAllDay ? 'ทั้งวัน' : `${event.startTime} – ${event.endTime} น.`}
            </span>
          </div>
          {event.location && (
            <div>
              <span className="font-semibold text-ink">สถานที่: </span>
              <span>{event.location}</span>
            </div>
          )}
          {event.description && (
            <div className="whitespace-pre-wrap rounded-xl border border-line bg-surface-alt p-3 text-xs text-ink">
              {event.description}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
          <a
            href={event.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-primary underline hover:text-primary-hover"
          >
            เปิดดูใน Google Calendar ↗
          </a>
          <Button variant="outline" size="sm" onClick={onClose}>
            ปิด
          </Button>
        </div>
      </div>
    </div>
  )
}
export default GoogleCalendarSyncBar
