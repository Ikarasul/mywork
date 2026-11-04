import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import GoogleCalendarSyncBar, {
  GoogleCalendarEventModal,
} from '../components/GoogleCalendarSyncBar'
import { IconCalendarDays } from '../components/icons'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
  Toast,
} from '../components/ui'
import { useAuth } from '../lib/auth'
import {
  formatFullDateThai,
  getCurrentMinutesOfDay,
  getTodayDayOfWeek,
} from '../lib/dateThai'
import { useGoogleCalendar } from '../lib/googleCalendar'
import { formatStorageErrorThai, storage, timeToMinutes } from '../lib/storage'
import type {
  DayOfWeek,
  GoogleCalendarEventItem,
  RoutineDay,
  RoutineItem,
} from '../types'

const DAYS_ORDER: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const TABLET_DAYS: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI']

const DAY_LABELS: Record<RoutineDay, string> = {
  ALL: 'ทุกวัน',
  MON: 'จันทร์',
  TUE: 'อังคาร',
  WED: 'พุธ',
  THU: 'พฤหัสบดี',
  FRI: 'ศุกร์',
  SAT: 'เสาร์',
  SUN: 'อาทิตย์',
}

const SHORT_DAY_LABELS: Record<DayOfWeek, string> = {
  MON: 'จ.',
  TUE: 'อ.',
  WED: 'พ.',
  THU: 'พฤ.',
  FRI: 'ศ.',
  SAT: 'ส.',
  SUN: 'อา.',
}

export function LifeSchedulePage() {
  const { user } = useAuth()
  const gcal = useGoogleCalendar()
  const [selectedGcalEvent, setSelectedGcalEvent] = useState<GoogleCalendarEventItem | null>(
    null,
  )
  const todayCode = useMemo(() => getTodayDayOfWeek(), [])
  const [selectedMobileDay, setSelectedMobileDay] = useState<DayOfWeek>(todayCode)
  const nowMinutes = useMemo(() => getCurrentMinutesOfDay(), [])

  const [items, setItems] = useState<RoutineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const [title, setTitle] = useState('')
  const [day, setDay] = useState<RoutineDay>('ALL')
  const [startTime, setStartTime] = useState('07:00')
  const [endTime, setEndTime] = useState('08:00')
  const [category, setCategory] = useState('กิจวัตรประจำวัน')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const loadRoutine = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const data = await storage.get<RoutineItem[]>('routine_items')
      setItems(data ?? [])
    } catch (err) {
      setErrorMessage(formatStorageErrorThai(err))
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void loadRoutine()
  }, [loadRoutine])

  async function handleAddRoutine(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    setSaving(true)
    setErrorMessage(null)

    const newItem: RoutineItem = {
      id: window.crypto.randomUUID(),
      title: title.trim(),
      day,
      start_time: startTime,
      end_time: endTime,
      category: category.trim() || 'ทั่วไป',
      notes: notes.trim(),
    }

    const updated = [...items, newItem].sort((a, b) =>
      a.start_time.localeCompare(b.start_time),
    )

    try {
      await storage.set('routine_items', updated)
      setTitle('')
      setNotes('')
      setShowAddForm(false)
      await loadRoutine()
    } catch (err) {
      setErrorMessage(formatStorageErrorThai(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveRoutine(id: string) {
    setErrorMessage(null)
    const updated = items.filter((item) => item.id !== id)
    try {
      await storage.set('routine_items', updated)
      setItems(updated)
    } catch (err) {
      setErrorMessage(formatStorageErrorThai(err))
    }
  }

  function getRoutinesForDay(d: DayOfWeek) {
    return items
      .filter((item) => item.day === 'ALL' || item.day === d)
      .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
  }

  function getGcalEventsForDay(d: DayOfWeek) {
    if (!gcal.overlayVisible) return []
    return gcal.events
      .filter((ev) => ev.day === d)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-ink sm:text-2xl">ตารางชีวิตส่วนตัว</h1>
              <Badge tone="mint">
                {user ? 'ซิงค์บัญชีส่วนตัว (RLS)' : 'บันทึกในเครื่อง (localStorage)'}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-ink-muted sm:text-sm">
              วันนี้: {formatFullDateThai()} • จัดการกิจวัตรประจำวันและเวลาพักผ่อนของคุณ
            </p>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAddForm((prev) => !prev)}
          >
            {showAddForm ? 'ซ่อนฟอร์ม' : '+ เพิ่มกิจวัตรใหม่'}
          </Button>
        </div>

        <div className="mt-4">
          <GoogleCalendarSyncBar
            eventsCount={gcal.events.length}
            lastSyncedAt={gcal.lastSyncedAt}
            weekRangeLabel={gcal.weekRangeLabel}
            overlayVisible={gcal.overlayVisible}
            onToggleOverlay={gcal.setOverlayVisible}
            autoSyncEnabled={gcal.autoSyncEnabled}
            onToggleAutoSync={gcal.setAutoSyncEnabled}
            onRequestWriteScope={() => void gcal.requestWriteScope()}
            syncing={gcal.syncing}
            syncError={gcal.syncError}
            syncSuccessMessage={gcal.syncSuccessMessage}
            onClearError={() => gcal.setSyncError(null)}
            onClearSuccess={() => gcal.setSyncSuccessMessage(null)}
            onSyncNow={() => void gcal.syncNow()}
            onClearEvents={gcal.clearSyncedEvents}
          />
        </div>

        {errorMessage && (
          <div className="mt-4">
            <Toast
              tone="danger"
              message={errorMessage}
              onClose={() => setErrorMessage(null)}
            />
          </div>
        )}

        {showAddForm && (
          <form
            onSubmit={(e) => void handleAddRoutine(e)}
            className="mt-5 grid gap-3 rounded-2xl border border-line bg-surface-alt p-4 sm:grid-cols-6"
          >
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-ink-secondary">กิจกรรม *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="เช่น ออกกำลังกาย / ทบทวนบทเรียน"
                className="mt-1 min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-secondary">วัน</label>
              <select
                value={day}
                onChange={(e) => setDay(e.target.value as RoutineDay)}
                className="mt-1 min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm text-ink"
              >
                {Object.entries(DAY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-secondary">เริ่ม</label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-secondary">สิ้นสุด</label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm text-ink"
              />
            </div>

            <div className="flex items-end">
              <Button type="submit" variant="primary" size="sm" disabled={saving} className="w-full">
                {saving ? 'กำลังบันทึก...' : 'บันทึกกิจกรรม'}
              </Button>
            </div>

            <div className="sm:col-span-3">
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="หมวดหมู่ (เช่น สุขภาพ, การเรียน, พักผ่อน)"
                className="min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink"
              />
            </div>
            <div className="sm:col-span-3">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                className="min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink"
              />
            </div>
          </form>
        )}
      </Card>

      <GoogleCalendarEventModal
        event={selectedGcalEvent}
        onClose={() => setSelectedGcalEvent(null)}
      />

      {loading ? (
        <Skeleton lines={4} label="อีกาตัวน้อยกำลังจัดตารางชีวิตให้คุณ..." />
      ) : items.length === 0 && (!gcal.overlayVisible || gcal.events.length === 0) ? (
        <Card>
          <EmptyState
            mood="happy"
            title="ยังไม่มีรายการตารางชีวิต"
            description="ออกแบบตารางชีวิตประจำวันของคุณ เช่น เวลาอ่านหนังสือ ออกกำลังกาย หรือพักผ่อน หรือกดซิงก์ Google Calendar ด้านบน"
            action={
              <Button variant="primary" size="sm" onClick={() => setShowAddForm(true)}>
                + เริ่มเพิ่มกิจกรรมแรก
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-ink">
              ตารางชีวิตตามวัน ({items.length} กิจกรรม
              {gcal.overlayVisible && gcal.events.length > 0
                ? ` • ${gcal.events.length} อีเวนต์ Google`
                : ''}
              )
            </h2>
            <Badge tone="primary">● วันนี้: วัน{DAY_LABELS[todayCode]}</Badge>
          </div>

          {/* มือถือ (<640px): แท็บเลือกวัน จ-อา แสดงทีละวัน */}
          <div className="sm:hidden space-y-4">
            <div className="grid grid-cols-7 gap-1 rounded-xl border border-line bg-surface-alt p-1">
              {DAYS_ORDER.map((d) => {
                const isSelected = selectedMobileDay === d
                const isToday = d === todayCode
                return (
                  <button
                    key={`life-mob-${d}`}
                    type="button"
                    onClick={() => setSelectedMobileDay(d)}
                    className={`flex min-h-[44px] items-center justify-center rounded-lg text-xs font-bold transition ${
                      isSelected
                        ? 'bg-primary text-ink-inverted'
                        : isToday
                          ? 'border border-primary text-primary'
                          : 'text-ink-secondary'
                    }`}
                  >
                    {SHORT_DAY_LABELS[d]}
                  </button>
                )
              })}
            </div>

            <div className="space-y-2.5">
              {getRoutinesForDay(selectedMobileDay).map((item) => {
                const isNow =
                  selectedMobileDay === todayCode &&
                  nowMinutes >= timeToMinutes(item.start_time) &&
                  nowMinutes <= timeToMinutes(item.end_time)
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-2 rounded-xl border p-3.5 ${
                      isNow
                        ? 'border-primary bg-primary-soft/50'
                        : 'border-line bg-surface-alt'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary">
                          {item.start_time} – {item.end_time}
                        </span>
                        <Badge tone="neutral">{item.category}</Badge>
                      </div>
                      <p className="mt-1 text-sm font-bold text-ink">{item.title}</p>
                      {item.notes && (
                        <p className="mt-0.5 text-xs text-ink-muted">{item.notes}</p>
                      )}
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void handleRemoveRoutine(item.id)}
                    >
                      ลบ
                    </Button>
                  </div>
                )
              })}

              {getGcalEventsForDay(selectedMobileDay).map((ev, gIdx) => (
                <div
                  key={`life-mob-gcal-${ev.id}-${gIdx}`}
                  onClick={() => setSelectedGcalEvent(ev)}
                  className="cursor-pointer rounded-xl border border-dashed border-accent-sky bg-accent-sky-soft/70 p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-accent-sky-fg">
                      {ev.isAllDay ? 'ตลอดทั้งวัน' : `${ev.startTime} – ${ev.endTime}`}
                    </span>
                    <Badge tone="sky" className="inline-flex items-center gap-1">
                      <IconCalendarDays className="h-3 w-3 shrink-0" />
                      <span>Google Calendar</span>
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm font-bold text-ink">{ev.summary}</p>
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="text-ink-muted">อ่านอย่างเดียว</span>
                    <a
                      href={ev.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="font-bold text-primary underline"
                    >
                      แก้ไขใน Google Calendar ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* แท็บเล็ต (5 วัน) และ คอมพิวเตอร์ (7 วัน) */}
          <div className="hidden sm:grid sm:grid-cols-5 lg:hidden gap-3">
            {TABLET_DAYS.map((d) => {
              const isToday = d === todayCode
              const dayItems = getRoutinesForDay(d)
              const dayGcal = getGcalEventsForDay(d)
              return (
                <div
                  key={`tab-life-${d}`}
                  className={`rounded-xl border p-3 ${
                    isToday ? 'border-primary bg-primary-soft/20' : 'border-line bg-surface-alt'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <span className="text-xs font-bold text-ink">วัน{DAY_LABELS[d]}</span>
                    {isToday && <Badge tone="primary">วันนี้</Badge>}
                  </div>
                  <div className="mt-2 space-y-2">
                    {dayItems.map((item) => (
                      <div
                        key={`${d}-${item.id}`}
                        className="rounded-lg border border-line bg-surface p-2 text-xs"
                      >
                        <div className="font-mono text-[11px] font-bold text-primary">
                          {item.start_time}–{item.end_time}
                        </div>
                        <div className="font-bold text-ink">{item.title}</div>
                        <button
                          type="button"
                          onClick={() => void handleRemoveRoutine(item.id)}
                          className="mt-1 text-[10px] font-semibold text-status-danger hover:underline"
                        >
                          ลบ
                        </button>
                      </div>
                    ))}
                    {dayGcal.map((ev, gIdx) => (
                      <div
                        key={`tab-gcal-${d}-${ev.id}-${gIdx}`}
                        onClick={() => setSelectedGcalEvent(ev)}
                        className="cursor-pointer rounded-lg border border-dashed border-accent-sky bg-accent-sky-soft/75 p-2 text-xs text-accent-sky-fg"
                      >
                        <div className="flex items-center gap-1 font-mono text-[10px] font-bold">
                          <IconCalendarDays className="h-3 w-3 shrink-0" />
                          <span>{ev.isAllDay ? 'ทั้งวัน' : `${ev.startTime}–${ev.endTime}`}</span>
                        </div>
                        <div className="font-bold text-ink">{ev.summary}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="hidden lg:grid lg:grid-cols-7 gap-3">
            {DAYS_ORDER.map((d) => {
              const isToday = d === todayCode
              const dayItems = getRoutinesForDay(d)
              const dayGcal = getGcalEventsForDay(d)
              return (
                <div
                  key={`desk-life-${d}`}
                  className={`rounded-xl border p-3 ${
                    isToday ? 'border-primary bg-primary-soft/20' : 'border-line bg-surface-alt'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <span className="text-xs font-bold text-ink">วัน{DAY_LABELS[d]}</span>
                    {isToday && <Badge tone="primary">วันนี้</Badge>}
                  </div>
                  <div className="mt-2 space-y-2">
                    {dayItems.map((item) => (
                      <div
                        key={`${d}-${item.id}`}
                        className="rounded-lg border border-line bg-surface p-2 text-xs"
                      >
                        <div className="font-mono text-[11px] font-bold text-primary">
                          {item.start_time}–{item.end_time}
                        </div>
                        <div className="font-bold text-ink">{item.title}</div>
                        <button
                          type="button"
                          onClick={() => void handleRemoveRoutine(item.id)}
                          className="mt-1 text-[10px] font-semibold text-status-danger hover:underline"
                        >
                          ลบ
                        </button>
                      </div>
                    ))}
                    {dayGcal.map((ev, gIdx) => (
                      <div
                        key={`desk-gcal-${d}-${ev.id}-${gIdx}`}
                        onClick={() => setSelectedGcalEvent(ev)}
                        className="cursor-pointer rounded-lg border border-dashed border-accent-sky bg-accent-sky-soft/75 p-2 text-xs text-accent-sky-fg"
                      >
                        <div className="flex items-center gap-1 font-mono text-[10px] font-bold">
                          <IconCalendarDays className="h-3 w-3 shrink-0" />
                          <span>{ev.isAllDay ? 'ทั้งวัน' : `${ev.startTime}–${ev.endTime}`}</span>
                        </div>
                        <div className="font-bold text-ink">{ev.summary}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ปุ่มเพิ่มเร็วลอยมุมล่างขวาบนมือถือ */}
      <button
        type="button"
        onClick={() => {
          setShowAddForm(true)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
        aria-label="เพิ่มกิจวัตรด่วน"
        className="fixed right-4 bottom-20 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl font-bold text-ink-inverted shadow-lg transition hover:bg-primary-hover sm:hidden"
      >
        +
      </button>
    </div>
  )
}

export default LifeSchedulePage
