import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Badge, Button } from './ui'
import { formatFullDateThai } from '../lib/dateThai'
import type { AppointmentInput } from '../lib/appointments'
import type { AppointmentItem } from '../types'

export interface AppointmentDialogProps {
  open: boolean
  /** นัดที่เปิดดู/แก้ไข (null = สร้างนัดใหม่) */
  appointment: AppointmentItem | null
  defaultDate: string
  courseCodes: string[]
  canManage: boolean
  /** ผู้ใช้ลบนัดนี้ได้หรือไม่ (ฝั่งฐานข้อมูลยังบังคับ RLS อีกชั้น) */
  canDelete: boolean
  onSave: (input: AppointmentInput, id?: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}

const inputClass =
  'mt-1 min-h-[44px] w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none'

export function AppointmentDialog({
  open,
  appointment,
  defaultDate,
  courseCodes,
  canManage,
  canDelete,
  onSave,
  onDelete,
  onClose,
}: AppointmentDialogProps) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [allDay, setAllDay] = useState(false)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [courseCode, setCourseCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const titleRef = useRef<HTMLInputElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  // รีเซ็ตฟอร์มทุกครั้งที่เปิด
  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement as HTMLElement | null
    setTitle(appointment?.title ?? '')
    setDate(appointment?.appt_date ?? defaultDate)
    setAllDay(appointment?.all_day ?? false)
    setStart(appointment?.start_time ?? '09:00')
    setEnd(appointment?.end_time ?? '10:00')
    setLocation(appointment?.location ?? '')
    setNotes(appointment?.notes ?? '')
    setCourseCode(appointment?.course_code ?? '')
    setErrorText(null)
    setConfirmDelete(false)
    const t = window.setTimeout(() => titleRef.current?.focus(), 30)
    return () => {
      window.clearTimeout(t)
      returnFocusRef.current?.focus?.()
    }
  }, [open, appointment, defaultDate])

  // ปิดด้วยปุ่ม Esc
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const readOnly = !canManage
  const isEdit = Boolean(appointment)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (readOnly) return
    setSaving(true)
    setErrorText(null)
    try {
      await onSave(
        {
          title,
          appt_date: date,
          start_time: start,
          end_time: end,
          all_day: allDay,
          location,
          notes,
          course_code: courseCode,
        },
        appointment?.id,
      )
      onClose()
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'บันทึกนัดไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!appointment) return
    setSaving(true)
    setErrorText(null)
    try {
      await onDelete(appointment.id)
      onClose()
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'ลบนัดไม่สำเร็จ')
      setConfirmDelete(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="appt-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface p-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] shadow-xl sm:max-w-[520px] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-2 border-b border-line pb-3">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="amber">🤝 นัดหมาย</Badge>
              {readOnly && <Badge tone="warning">👁️ โหมดดูอย่างเดียว</Badge>}
            </div>
            <h2 id="appt-dialog-title" className="mt-2 text-base font-bold text-ink">
              {readOnly ? 'รายละเอียดนัด' : isEdit ? 'แก้ไขนัด' : 'เพิ่มนัดใหม่'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-sm font-bold text-ink-muted hover:bg-surface-alt hover:text-ink"
          >
            ✕
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3">
          <div>
            <label htmlFor="appt-title" className="block text-xs font-medium text-ink-secondary">
              ชื่อนัด *
            </label>
            <input
              id="appt-title"
              ref={titleRef}
              type="text"
              required
              maxLength={200}
              disabled={readOnly}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น ประชุมกลุ่มทำโปรเจกต์"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="appt-date" className="block text-xs font-medium text-ink-secondary">
              วันที่ *
            </label>
            <input
              id="appt-date"
              type="date"
              required
              disabled={readOnly}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
            {/^\d{4}-\d{2}-\d{2}$/.test(date) && (
              <p className="mt-1 text-[11px] text-ink-muted">
                {formatFullDateThai(new Date(`${date}T12:00:00`))}
              </p>
            )}
          </div>

          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium text-ink-secondary">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-5 w-5 rounded border-line-strong"
            />
            ทั้งวัน
          </label>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="appt-start" className="block text-xs font-medium text-ink-secondary">
                  เวลาเริ่ม
                </label>
                <input
                  id="appt-start"
                  type="time"
                  required
                  disabled={readOnly}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="appt-end" className="block text-xs font-medium text-ink-secondary">
                  เวลาสิ้นสุด
                </label>
                <input
                  id="appt-end"
                  type="time"
                  required
                  disabled={readOnly}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="appt-location" className="block text-xs font-medium text-ink-secondary">
              สถานที่
            </label>
            <input
              id="appt-location"
              type="text"
              maxLength={300}
              disabled={readOnly}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="เช่น ห้องสมุด ชั้น 2 / Google Meet"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="appt-course" className="block text-xs font-medium text-ink-secondary">
              วิชาที่เกี่ยวข้อง (ไม่บังคับ)
            </label>
            <select
              id="appt-course"
              disabled={readOnly}
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              className={inputClass}
            >
              <option value="">— ไม่เกี่ยวกับวิชาใด —</option>
              {courseCodes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="appt-notes" className="block text-xs font-medium text-ink-secondary">
              โน้ต
            </label>
            <textarea
              id="appt-notes"
              rows={3}
              maxLength={2000}
              disabled={readOnly}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
              className={`${inputClass} resize-y`}
            />
          </div>

          {errorText && (
            <div
              role="alert"
              className="rounded-xl border border-status-danger bg-status-danger-soft p-3 text-xs font-medium text-status-danger-fg"
            >
              ⚠️ {errorText}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <div>
              {isEdit && canDelete && !readOnly && (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={saving}
                      onClick={() => void handleDelete()}
                    >
                      ยืนยันลบ
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                      ยกเลิก
                    </Button>
                  </div>
                ) : (
                  <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                    🗑️ ลบนัด
                  </Button>
                )
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                {readOnly ? 'ปิด' : 'ยกเลิก'}
              </Button>
              {!readOnly && (
                <Button type="submit" variant="primary" size="sm" disabled={saving}>
                  {saving ? 'กำลังบันทึก...' : 'บันทึกนัด'}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AppointmentDialog
