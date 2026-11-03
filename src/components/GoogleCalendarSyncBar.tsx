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
  syncing,
  syncError,
  syncSuccessMessage,
  onClearError,
  onClearSuccess,
  onSyncNow,
  onClearEvents,
}: GoogleCalendarSyncBarProps) {
  return (
    <div className="rounded-2xl border border-line bg-surface-alt p-3.5 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-ink sm:text-sm">
              📆 ซิงก์ปฏิทิน Google Calendar (อ่านอย่างเดียว)
            </span>
            <Badge tone={lastSyncedAt ? 'sky' : 'neutral'}>
              {lastSyncedAt ? `${eventsCount} อีเวนต์สัปดาห์นี้` : 'ยังไม่ได้ซิงก์'}
            </Badge>
            <Badge tone="neutral">สัปดาห์: {weekRangeLabel}</Badge>
          </div>
          <p className="text-xs text-ink-muted">
            {lastSyncedAt
              ? `ซิงก์ล่าสุดเมื่อ ${formatDateTimeThai(lastSyncedAt)} • แสดงซ้อนทับตารางโดยไม่เขียนข้อมูลกลับไปที่ Google`
              : 'กดปุ่มซิงก์เพื่อดึงอีเวนต์สัปดาห์นี้จาก Google Calendar มาแสดงซ้อนทับบนตาราง (ไม่อัปเดตเองเบื้องหลัง)'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

          <Button
            variant="secondary"
            size="sm"
            disabled={syncing || !isSupabaseConfigured}
            onClick={onSyncNow}
          >
            {syncing ? 'กำลังซิงก์ Google Calendar...' : '🔄 ซิงก์ Google Calendar'}
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
        <div className="mt-3">
          <Toast tone="danger" message={syncError} onClose={onClearError} />
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
              <Badge tone="sky">📆 Google Calendar</Badge>
              <Badge tone="neutral">อ่านอย่างเดียว</Badge>
            </div>
            <h3 className="mt-2 text-base font-bold text-ink">{event.summary}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs font-bold text-ink-muted hover:bg-surface-alt hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2 text-xs text-ink-secondary">
          <div className="flex items-center justify-between rounded-xl bg-surface-alt px-3 py-2">
            <span className="font-semibold text-ink-muted">วันและเวลา</span>
            <span className="font-mono font-bold text-ink">
              วัน{DAY_NAMES[event.day]}{' '}
              {event.isAllDay ? '(ตลอดทั้งวัน)' : `${event.startTime} – ${event.endTime}`}
            </span>
          </div>

          {event.location && (
            <div className="rounded-xl bg-surface-alt px-3 py-2">
              <span className="font-semibold text-ink-muted">สถานที่: </span>
              <span className="font-medium text-ink">{event.location}</span>
            </div>
          )}

          {event.description && (
            <div className="rounded-xl bg-surface-alt px-3 py-2">
              <p className="font-semibold text-ink-muted">รายละเอียด:</p>
              <p className="mt-1 whitespace-pre-wrap text-ink">{event.description}</p>
            </div>
          )}

          <p className="text-[11px] text-ink-muted">
            * ระบบซิงก์ปฏิทิน Google แบบอ่านอย่างเดียว เว็บจะไม่แก้ไขหรือเขียนข้อมูลกลับไปยังบัญชี Google ของคุณ
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
          <a
            href={event.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[38px] items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-bold text-ink-inverted transition hover:bg-primary-hover"
          >
            แก้ไขใน Google Calendar ↗
          </a>
          <Button variant="outline" size="sm" onClick={onClose}>
            ปิดหน้าต่าง
          </Button>
        </div>
      </div>
    </div>
  )
}

export default GoogleCalendarSyncBar
