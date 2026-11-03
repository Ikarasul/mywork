import { useEffect, useState } from 'react'
import {
  IconPauseCircle,
  IconPin,
  IconRefreshCw,
  IconRotateCcw,
  IconX,
} from './icons'
import { dateKeyToDay } from '../lib/appointments'
import { DAY_THAI_NAMES } from '../lib/reschedules'
import { timeToMinutes } from '../lib/storage'
import type { CourseScheduleItem, DayOfWeek } from '../types'
import { Badge, Button } from './ui'

const inputClass =
  'mt-1 min-h-[44px] w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none'

export type RescheduleMode = 'weekly' | 'permanent' | 'cancel'

export interface RescheduleSubmitPayload {
  mode: RescheduleMode
  newDate: string
  newDay: DayOfWeek
  newStart: string
  newEnd: string
  newRoom: string
  reason: string
}

interface Props {
  open: boolean
  session: CourseScheduleItem | null
  /** วันที่เดิมของคาบนี้ (YYYY-MM-DD) */
  originalDate: string
  /** วันที่ปลายทางเริ่มต้น (เมื่อลากไปวางในวันใหม่) */
  initialTargetDate?: string
  /** เวลาเริ่มปลายทางเริ่มต้น (เมื่อลากไปวางในช่องเวลาใหม่) */
  initialTargetStart?: string
  /** เวลาสิ้นสุดปลายทางเริ่มต้น */
  initialTargetEnd?: string
  canManage: boolean
  onClose: () => void
  onSubmit: (payload: RescheduleSubmitPayload) => Promise<void>
  onRestoreOriginal?: (overrideId: string) => Promise<void>
}

export default function RescheduleDialog({
  open,
  session,
  originalDate,
  initialTargetDate,
  initialTargetStart,
  initialTargetEnd,
  canManage,
  onClose,
  onSubmit,
  onRestoreOriginal,
}: Props) {
  const [mode, setMode] = useState<RescheduleMode>('weekly')
  const [newDate, setNewDate] = useState('')
  const [newStart, setNewStart] = useState('09:00')
  const [newEnd, setNewEnd] = useState('11:30')
  const [newRoom, setNewRoom] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !session) return
    setMode('weekly')
    setNewDate(initialTargetDate || originalDate)
    setNewStart(initialTargetStart || session.start)
    setNewEnd(initialTargetEnd || session.end)
    setNewRoom(session.room || '')
    setReason(session.rescheduledInfo?.reason || '')
    setError(null)
  }, [
    open,
    session,
    originalDate,
    initialTargetDate,
    initialTargetStart,
    initialTargetEnd,
  ])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !session) return null

  const origDay = session.rescheduledInfo?.originalDay ?? session.day
  const origStart = session.rescheduledInfo?.originalStart ?? session.start
  const origEnd = session.rescheduledInfo?.originalEnd ?? session.end
  const origDateVal = session.rescheduledInfo?.originalDate ?? originalDate
  const targetDay: DayOfWeek = /^\d{4}-\d{2}-\d{2}$/.test(newDate)
    ? dateKeyToDay(newDate)
    : session.day

  const handleConfirm = async () => {
    if (!canManage) {
      setError('โหมดดูอย่างเดียว: คุณไม่มีสิทธิ์ย้ายคาบเรียน')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      setError('กรุณาเลือกวันที่ปลายทางให้ถูกต้อง')
      return
    }
    if (mode !== 'cancel') {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(newStart)) {
        setError('รูปแบบเวลาเริ่มไม่ถูกต้อง')
        return
      }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(newEnd)) {
        setError('รูปแบบเวลาเลิกไม่ถูกต้อง')
        return
      }
      if (timeToMinutes(newEnd) <= timeToMinutes(newStart)) {
        setError('เวลาเลิกเรียนต้องอยู่หลังเวลาเริ่มเรียน')
        return
      }
    }

    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        mode,
        newDate,
        newDay: targetDay,
        newStart,
        newEnd,
        newRoom: newRoom.trim(),
        reason: reason.trim(),
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleRestore = async () => {
    if (!session.rescheduledInfo?.overrideId || !onRestoreOriginal) return
    setSaving(true)
    setError(null)
    try {
      await onRestoreOriginal(session.rescheduledInfo.overrideId)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ย้ายคาบเรียนหรือปรับเวลาเรียน"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-lg sm:max-w-[540px] sm:rounded-2xl"
      >
        {/* ส่วนหัวป็อปอัพ */}
        <div className="flex items-start justify-between gap-2 border-b border-line pb-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="amber" className="inline-flex items-center gap-1">
                <IconRefreshCw className="h-3 w-3 shrink-0" />
                <span>ย้ายคาบเรียน / ปรับเวลา</span>
              </Badge>
              <span className="font-mono text-xs font-extrabold text-primary">
                {session.course_code} (Sec {session.section})
              </span>
            </div>
            <h2 className="mt-1 text-base font-bold text-ink">{session.course_name}</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              ตารางเดิม: วัน{DAY_THAI_NAMES[origDay]} ({origDateVal}) • เวลา {origStart}–{origEnd} น.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-line bg-surface-alt text-sm font-bold text-ink hover:bg-surface-hover"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {error && (
            <div className="rounded-xl border border-status-danger bg-status-danger-soft p-3 text-xs font-semibold text-status-danger">
              {error}
            </div>
          )}

          {/* แถบแจ้งเตือนหากคาบนี้ถูกย้ายมาอยู่แล้ว พร้อมปุ่มคืนค่าเดิม */}
          {session.rescheduledInfo && onRestoreOriginal && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent-amber bg-accent-amber-soft/70 p-3 text-xs">
              <div>
                <p className="flex items-center gap-1.5 font-bold text-accent-amber-fg">
                  <IconRefreshCw className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    คาบนี้ถูกย้ายชั่วคราวมาจากวัน{DAY_THAI_NAMES[session.rescheduledInfo.originalDay]} ({session.rescheduledInfo.originalStart}–{session.rescheduledInfo.originalEnd})
                  </span>
                </p>
                {session.rescheduledInfo.reason && (
                  <p className="mt-0.5 text-ink-secondary">
                    หมายเหตุ: {session.rescheduledInfo.reason}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => void handleRestore()}
              >
                <IconRotateCcw className="h-3.5 w-3.5 shrink-0 mr-1" />
                <span>คืนค่าคาบเดิม</span>
              </Button>
            </div>
          )}

          {/* ตัวเลือกโหมดการย้ายคาบ */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-ink-secondary">
              เลือกรูปแบบการย้ายคาบเรียน
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setMode('weekly')}
                className={`rounded-xl border p-2.5 text-left text-xs transition ${
                  mode === 'weekly'
                    ? 'border-primary bg-primary-soft/60 text-ink ring-2 ring-primary/30'
                    : 'border-line bg-surface-alt text-ink-secondary hover:bg-surface-hover'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-primary">
                  <IconRefreshCw className="h-3.5 w-3.5 shrink-0" />
                  <span>เฉพาะสัปดาห์นี้</span>
                </div>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  ชดเชย/ย้ายเฉพาะวันที่เลือก (มีป้ายย้ายคาบ และกดคืนค่าเดิมได้)
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('permanent')}
                className={`rounded-xl border p-2.5 text-left text-xs transition ${
                  mode === 'permanent'
                    ? 'border-accent-mint bg-accent-mint-soft/70 text-ink ring-2 ring-accent-mint/40'
                    : 'border-line bg-surface-alt text-ink-secondary hover:bg-surface-hover'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-accent-mint-fg">
                  <IconPin className="h-3.5 w-3.5 shrink-0" />
                  <span>เปลี่ยนตารางหลักถาวร</span>
                </div>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  เปลี่ยนวัน/เวลาเรียนหลักของวิชานี้ในทุกสัปดาห์ตลอดเทอม
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('cancel')}
                className={`rounded-xl border p-2.5 text-left text-xs transition ${
                  mode === 'cancel'
                    ? 'border-status-danger bg-status-danger-soft/70 text-ink ring-2 ring-status-danger/30'
                    : 'border-line bg-surface-alt text-ink-secondary hover:bg-surface-hover'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-status-danger">
                  <IconPauseCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>งดคลาสในวันนี้</span>
                </div>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  งดการเรียนการสอนในวันที่ {origDateVal} (สามารถกดคืนค่าทีหลังได้)
                </p>
              </button>
            </div>
          </div>

          {mode !== 'cancel' && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-ink-secondary">
                    วันที่ย้ายไป (วัน{DAY_THAI_NAMES[targetDay]})
                  </label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-secondary">
                    เวลาเริ่มใหม่
                  </label>
                  <input
                    type="time"
                    value={newStart}
                    onChange={(e) => setNewStart(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-secondary">
                    เวลาเลิกใหม่
                  </label>
                  <input
                    type="time"
                    value={newEnd}
                    onChange={(e) => setNewEnd(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-secondary">
                  ห้องเรียน / ช่องทางเรียน (แก้ไขได้หากย้ายห้องหรือเปลี่ยนเป็นออนไลน์)
                </label>
                <input
                  type="text"
                  value={newRoom}
                  onChange={(e) => setNewRoom(e.target.value)}
                  placeholder="เช่น 05-0704 หรือ ออนไลน์ผ่าน Google Meet"
                  className={inputClass}
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-ink-secondary">
              หมายเหตุการย้ายคาบ / งดคลาส (ไม่บังคับ)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น อาจารย์ติดภารกิจ นัดเรียนชดเชยช่วงบ่าย"
              className={inputClass}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
            <Button variant="ghost" size="sm" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button
              variant={mode === 'cancel' ? 'danger' : 'primary'}
              size="sm"
              disabled={saving}
              onClick={() => void handleConfirm()}
            >
              {saving
                ? 'กำลังบันทึก...'
                : mode === 'weekly'
                  ? 'ยืนยันย้ายเฉพาะสัปดาห์นี้'
                  : mode === 'permanent'
                    ? 'ยืนยันเปลี่ยนตารางหลักถาวร'
                    : 'ยืนยันงดคลาสวันนี้'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
