import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import GoogleCalendarSyncBar, {
  GoogleCalendarEventModal,
} from '../components/GoogleCalendarSyncBar'
import PixelCat from '../components/PixelCat'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
} from '../components/ui'
import { useAuth } from '../lib/auth'
import {
  formatFullDateThai,
  formatMonthYearThai,
  getTodayDayOfWeek,
} from '../lib/dateThai'
import { useGoogleCalendar } from '../lib/googleCalendar'
import {
  DEFAULT_SEMESTER,
  getSampleScheduleFromCsv,
  storage,
  timeToMinutes,
} from '../lib/storage'
import type {
  CourseScheduleItem,
  DayOfWeek,
  GoogleCalendarEventItem,
  RoutineItem,
  TaskItem,
} from '../types'

const DAYS_HEADER: { code: DayOfWeek; label: string; short: string }[] = [
  { code: 'MON', label: 'จันทร์', short: 'จ.' },
  { code: 'TUE', label: 'อังคาร', short: 'อ.' },
  { code: 'WED', label: 'พุธ', short: 'พ.' },
  { code: 'THU', label: 'พฤหัสบดี', short: 'พฤ.' },
  { code: 'FRI', label: 'ศุกร์', short: 'ศ.' },
  { code: 'SAT', label: 'เสาร์', short: 'ส.' },
  { code: 'SUN', label: 'อาทิตย์', short: 'อา.' },
]

type CalendarItemType = 'class' | 'routine' | 'task' | 'exam' | 'gcal'

interface UnifiedCalendarEvent {
  id: string
  title: string
  subtitle?: string
  timeLabel: string
  type: CalendarItemType
  rawGcal?: GoogleCalendarEventItem
  rawTask?: TaskItem
  rawClass?: CourseScheduleItem
  rawRoutine?: RoutineItem
  dateKey?: string // YYYY-MM-DD
  dayOfWeek: DayOfWeek
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function CalendarPage() {
  const { user, activeGroup } = useAuth()
  const gcal = useGoogleCalendar()

  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month')
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => formatDateKey(new Date()))

  // ตัวกรองการแสดงผล
  const [filterClasses, setFilterClasses] = useState(true)
  const [filterRoutines, setFilterRoutines] = useState(true)
  const [filterTasks, setFilterTasks] = useState(true)
  const [filterExams, setFilterExams] = useState(true)
  const [filterGcal, setFilterGcal] = useState(true)

  const [sessions, setSessions] = useState<CourseScheduleItem[]>([])
  const [routines, setRoutines] = useState<RoutineItem[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedGcalEvent, setSelectedGcalEvent] = useState<GoogleCalendarEventItem | null>(null)
  const [selectedUnifiedEvent, setSelectedUnifiedEvent] = useState<UnifiedCalendarEvent | null>(null)

  const groupKeyPart = activeGroup?.id ?? 'local'
  const scheduleStorageKey = `class_sessions:${groupKeyPart}:${DEFAULT_SEMESTER}`
  const taskStorageKey = activeGroup ? `tasks:${activeGroup.id}` : 'tasks'

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [schedData, routineData, taskData] = await Promise.all([
        storage.get<CourseScheduleItem[]>(scheduleStorageKey),
        storage.get<RoutineItem[]>('routine_items'),
        storage.get<TaskItem[]>(taskStorageKey),
      ])

      setSessions(
        schedData && schedData.length > 0 ? schedData : getSampleScheduleFromCsv(),
      )
      setRoutines(routineData ?? [])
      setTasks(taskData ?? [])
    } catch {
      setSessions(getSampleScheduleFromCsv())
    } finally {
      setLoading(false)
    }
  }, [scheduleStorageKey, taskStorageKey, user?.id])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // คำนวณวันของเดือนที่แสดงในปฏิทิน
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const totalDays = lastDay.getDate()

    // วันจันทร์คือ index 0 (getDay() ให้ 0=Sun, 1=Mon, ..., 6=Sat)
    const firstDayJs = firstDay.getDay()
    const leadingEmpty = firstDayJs === 0 ? 6 : firstDayJs - 1

    const days: Array<{
      date: Date
      dateKey: string
      dayNum: number
      isCurrentMonth: boolean
      dayOfWeek: DayOfWeek
      isToday: boolean
    }> = []

    // วันของเดือนก่อนหน้า (padding)
    for (let i = leadingEmpty - 1; i >= 0; i--) {
      const d = new Date(year, month, -i)
      const dayCode = DAYS_HEADER[d.getDay() === 0 ? 6 : d.getDay() - 1].code
      days.push({
        date: d,
        dateKey: formatDateKey(d),
        dayNum: d.getDate(),
        isCurrentMonth: false,
        dayOfWeek: dayCode,
        isToday: formatDateKey(d) === formatDateKey(new Date()),
      })
    }

    // วันในเดือนปัจจุบัน
    for (let i = 1; i <= totalDays; i++) {
      const d = new Date(year, month, i)
      const dayCode = DAYS_HEADER[d.getDay() === 0 ? 6 : d.getDay() - 1].code
      days.push({
        date: d,
        dateKey: formatDateKey(d),
        dayNum: i,
        isCurrentMonth: true,
        dayOfWeek: dayCode,
        isToday: formatDateKey(d) === formatDateKey(new Date()),
      })
    }

    // วันของเดือนถัดไปเพื่อให้ครบ 35 หรือ 42 ช่อง (สัปดาห์เต็ม)
    const trailingEmpty = (7 - (days.length % 7)) % 7
    for (let i = 1; i <= trailingEmpty; i++) {
      const d = new Date(year, month + 1, i)
      const dayCode = DAYS_HEADER[d.getDay() === 0 ? 6 : d.getDay() - 1].code
      days.push({
        date: d,
        dateKey: formatDateKey(d),
        dayNum: d.getDate(),
        isCurrentMonth: false,
        dayOfWeek: dayCode,
        isToday: formatDateKey(d) === formatDateKey(new Date()),
      })
    }

    return days
  }, [year, month])

  function getEventsForDate(dateKey: string, dayOfWeek: DayOfWeek): UnifiedCalendarEvent[] {
    const events: UnifiedCalendarEvent[] = []

    // 1. ตารางเรียน (ซ้ำทุกสัปดาห์ตามวัน)
    if (filterClasses) {
      const classMatches = sessions.filter((s) => s.day === dayOfWeek)
      for (const c of classMatches) {
        events.push({
          id: `class-${c.course_code}-${dateKey}`,
          title: `${c.course_code} ${c.course_name}`,
          subtitle: `📍 ห้อง ${c.room || '-'} (Sec ${c.section})`,
          timeLabel: `${c.start}–${c.end}`,
          type: 'class',
          rawClass: c,
          dateKey,
          dayOfWeek,
        })
      }
    }

    // 2. ตารางชีวิตประจำวัน
    if (filterRoutines) {
      const routineMatches = routines.filter(
        (r) => r.day === 'ALL' || r.day === dayOfWeek,
      )
      for (const r of routineMatches) {
        events.push({
          id: `routine-${r.id}-${dateKey}`,
          title: r.title,
          subtitle: r.category ? `หมวด: ${r.category}` : undefined,
          timeLabel: `${r.start_time}–${r.end_time}`,
          type: 'routine',
          rawRoutine: r,
          dateKey,
          dayOfWeek,
        })
      }
    }

    // 3. งาน / การบ้าน / สอบ ที่มีกำหนดส่งตรงกับวัน
    if (filterTasks || filterExams) {
      for (const t of tasks) {
        if (!t.due_date) continue
        const tDateKey = t.due_date.slice(0, 10)
        if (tDateKey !== dateKey) continue

        const isExam = t.task_type === 'exam'
        if (isExam && !filterExams) continue
        if (!isExam && !filterTasks) continue

        const timePart = t.due_date.includes('T')
          ? t.due_date.split('T')[1].slice(0, 5)
          : ''

        events.push({
          id: `task-${t.id}`,
          title: t.title,
          subtitle: t.course_code ? `วิชา ${t.course_code}` : undefined,
          timeLabel: timePart ? `ส่ง ${timePart} น.` : 'กำหนดส่งวันนี้',
          type: isExam ? 'exam' : 'task',
          rawTask: t,
          dateKey,
          dayOfWeek,
        })
      }
    }

    // 4. Google Calendar Events
    if (filterGcal && gcal.overlayVisible) {
      for (const ev of gcal.events) {
        const evDateKey = ev.startIso ? ev.startIso.slice(0, 10) : ''
        if (evDateKey === dateKey || ev.day === dayOfWeek) {
          events.push({
            id: `gcal-${ev.id}`,
            title: ev.summary,
            subtitle: ev.location ? `📍 ${ev.location}` : 'Google Calendar',
            timeLabel: ev.isAllDay ? 'ตลอดวัน' : `${ev.startTime}–${ev.endTime}`,
            type: 'gcal',
            rawGcal: ev,
            dateKey,
            dayOfWeek,
          })
        }
      }
    }

    return events.sort((a, b) => {
      const aMin = timeToMinutes(a.timeLabel.split('–')[0].replace('ส่ง ', ''))
      const bMin = timeToMinutes(b.timeLabel.split('–')[0].replace('ส่ง ', ''))
      return aMin - bMin
    })
  }

  function handlePrevMonth() {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  function handleNextMonth() {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  function handleToday() {
    const today = new Date()
    setCurrentDate(today)
    setSelectedDayKey(formatDateKey(today))
  }

  const selectedDayEvents = useMemo(() => {
    const matchDay = calendarDays.find((d) => d.dateKey === selectedDayKey)
    if (!matchDay) {
      const todayCode = getTodayDayOfWeek()
      return getEventsForDate(selectedDayKey, todayCode)
    }
    return getEventsForDate(matchDay.dateKey, matchDay.dayOfWeek)
  }, [calendarDays, selectedDayKey, sessions, routines, tasks, gcal.events, gcal.overlayVisible, filterClasses, filterRoutines, filterTasks, filterExams, filterGcal])

  function getBadgeTone(type: CalendarItemType) {
    switch (type) {
      case 'class':
        return 'primary' as const
      case 'routine':
        return 'mint' as const
      case 'exam':
        return 'pink' as const
      case 'task':
        return 'amber' as const
      case 'gcal':
      default:
        return 'sky' as const
    }
  }

  function getTypeLabel(type: CalendarItemType) {
    switch (type) {
      case 'class':
        return '📚 ตารางเรียน'
      case 'routine':
        return '⏰ กิจวัตรชีวิต'
      case 'exam':
        return '🎯 นัดสอบ'
      case 'task':
        return '📝 งาน/การบ้าน'
      case 'gcal':
      default:
        return '📆 Google Calendar'
    }
  }

  return (
    <div className="space-y-6">
      {/* ส่วนหัวหน้าปฏิทิน */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <PixelCat mood="happy" size={52} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-ink sm:text-2xl">ปฏิทินรวมระบบ</h1>
                <Badge tone="primary">มุมมองรวมทุกกิจกรรม</Badge>
              </div>
              <p className="mt-1 text-xs text-ink-muted sm:text-sm">
                วันนี้: {formatFullDateThai()} • รวมตารางเรียน กิจวัตรชีวิต งาน/สอบ และ Google Calendar
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-line bg-surface-alt p-1">
              <button
                type="button"
                onClick={() => setViewMode('month')}
                className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  viewMode === 'month'
                    ? 'bg-primary text-ink-inverted shadow-2xs'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                📅 ปฏิทินรายเดือน
              </button>
              <button
                type="button"
                onClick={() => setViewMode('agenda')}
                className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  viewMode === 'agenda'
                    ? 'bg-primary text-ink-inverted shadow-2xs'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                📋 รายการกำหนดการ
              </button>
            </div>
          </div>
        </div>

        {/* แถบซิงก์ Google Calendar */}
        <div className="mt-4">
          <GoogleCalendarSyncBar
            eventsCount={gcal.events.length}
            lastSyncedAt={gcal.lastSyncedAt}
            weekRangeLabel={gcal.weekRangeLabel}
            overlayVisible={gcal.overlayVisible}
            onToggleOverlay={gcal.setOverlayVisible}
            syncing={gcal.syncing}
            syncError={gcal.syncError}
            syncSuccessMessage={gcal.syncSuccessMessage}
            onClearError={() => gcal.setSyncError(null)}
            onClearSuccess={() => gcal.setSyncSuccessMessage(null)}
            onSyncNow={() => void gcal.syncNow()}
            onClearEvents={gcal.clearSyncedEvents}
          />
        </div>

        {/* แถบฟิลเตอร์เปิด/ปิดประเภทกิจกรรม */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
          <span className="font-bold text-ink-muted mr-1">กรองแสดงผล:</span>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 font-semibold text-ink">
            <input
              type="checkbox"
              checked={filterClasses}
              onChange={(e) => setFilterClasses(e.target.checked)}
              className="rounded"
            />
            <span>📚 ตารางเรียน</span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 font-semibold text-ink">
            <input
              type="checkbox"
              checked={filterRoutines}
              onChange={(e) => setFilterRoutines(e.target.checked)}
              className="rounded"
            />
            <span>⏰ กิจวัตรชีวิต</span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 font-semibold text-ink">
            <input
              type="checkbox"
              checked={filterTasks}
              onChange={(e) => setFilterTasks(e.target.checked)}
              className="rounded"
            />
            <span>📝 งาน/การบ้าน</span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 font-semibold text-ink">
            <input
              type="checkbox"
              checked={filterExams}
              onChange={(e) => setFilterExams(e.target.checked)}
              className="rounded"
            />
            <span>🎯 นัดสอบ</span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 font-semibold text-ink">
            <input
              type="checkbox"
              checked={filterGcal}
              onChange={(e) => setFilterGcal(e.target.checked)}
              className="rounded"
            />
            <span>📆 Google Calendar</span>
          </label>
        </div>
      </Card>

      {/* ควบคุมการเปลี่ยนเดือน */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-ink sm:text-xl">
            {formatMonthYearThai(currentDate)}
          </h2>
          <Button variant="outline" size="sm" onClick={handleToday}>
            วันนี้
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handlePrevMonth}>
            ◀ เดือนก่อน
          </Button>
          <Button variant="secondary" size="sm" onClick={handleNextMonth}>
            เดือนถัดไป ▶
          </Button>
        </div>
      </div>

      {loading ? (
        <Skeleton lines={6} label="กำลังรวบรวมข้อมูลปฏิทิน..." />
      ) : viewMode === 'month' ? (
        <div className="grid gap-6 lg:grid-cols-4">
          {/* ตารางปฏิทินเดือน 7 คอลัมน์ */}
          <Card padding="none" className="lg:col-span-3 overflow-hidden">
            {/* แถวชื่อวัน จันทร์ - อาทิตย์ */}
            <div className="grid grid-cols-7 border-b border-line bg-surface-alt text-center text-xs font-bold text-ink-secondary">
              {DAYS_HEADER.map((d) => (
                <div key={d.code} className="py-2.5">
                  <span className="hidden sm:inline">วัน{d.label}</span>
                  <span className="sm:hidden">{d.short}</span>
                </div>
              ))}
            </div>

            {/* ช่องวันในเดือน */}
            <div className="grid grid-cols-7 divide-x divide-y divide-line">
              {calendarDays.map((cell) => {
                const isSelected = cell.dateKey === selectedDayKey
                const dayEvents = getEventsForDate(cell.dateKey, cell.dayOfWeek)

                return (
                  <div
                    key={cell.dateKey}
                    onClick={() => setSelectedDayKey(cell.dateKey)}
                    className={`min-h-[85px] cursor-pointer p-1.5 transition sm:min-h-[105px] ${
                      !cell.isCurrentMonth
                        ? 'bg-surface-alt/40 opacity-40'
                        : isSelected
                          ? 'bg-primary-soft/40 ring-2 ring-primary ring-inset'
                          : 'bg-surface hover:bg-surface-hover/70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          cell.isToday
                            ? 'bg-primary text-ink-inverted'
                            : isSelected
                              ? 'text-primary'
                              : 'text-ink'
                        }`}
                      >
                        {cell.dayNum}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="font-pixel text-[10px] text-ink-muted">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    {/* แสดงป้ายรายการกิจกรรมย่อในช่องวัน */}
                    <div className="mt-1 space-y-1">
                      {dayEvents.slice(0, 3).map((ev) => {
                        const tone = getBadgeTone(ev.type)
                        return (
                          <div
                            key={ev.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (ev.rawGcal) {
                                setSelectedGcalEvent(ev.rawGcal)
                              } else {
                                setSelectedUnifiedEvent(ev)
                              }
                            }}
                            title={`${ev.timeLabel} ${ev.title}`}
                            className={`truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight ${
                              tone === 'primary'
                                ? 'bg-primary-soft text-primary'
                                : tone === 'mint'
                                  ? 'bg-accent-mint-soft text-accent-mint-fg'
                                  : tone === 'pink'
                                    ? 'bg-accent-pink-soft text-accent-pink-fg'
                                    : tone === 'amber'
                                      ? 'bg-accent-amber-soft text-accent-amber-fg'
                                      : 'bg-accent-sky-soft text-accent-sky-fg'
                            }`}
                          >
                            <span className="font-mono">{ev.timeLabel.split('–')[0]}</span>{' '}
                            <span>{ev.title}</span>
                          </div>
                        )
                      })}

                      {dayEvents.length > 3 && (
                        <p className="text-[9px] font-semibold text-ink-muted">
                          +{dayEvents.length - 3} รายการเพิ่มเติม
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* คอลัมน์ข้าง: สรุปกิจกรรมของวันที่เลือก */}
          <Card className="lg:col-span-1 space-y-4">
            <div className="border-b border-line pb-3">
              <span className="text-xs font-medium text-ink-muted">กิจกรรมในวันที่เลือก</span>
              <h3 className="mt-0.5 text-base font-bold text-ink">
                {formatFullDateThai(new Date(selectedDayKey))}
              </h3>
              <p className="mt-1 text-xs text-ink-secondary">
                รวมทั้งหมด {selectedDayEvents.length} รายการ
              </p>
            </div>

            {selectedDayEvents.length === 0 ? (
              <EmptyState
                mood="idle"
                title="ไม่มีกิจกรรมในวันนี้"
                description="เลือกวันอื่นบนปฏิทิน หรือเปิดตัวกรองการแสดงผลด้านบน"
              />
            ) : (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {selectedDayEvents.map((ev) => {
                  const tone = getBadgeTone(ev.type)
                  return (
                    <div
                      key={ev.id}
                      onClick={() => {
                        if (ev.rawGcal) {
                          setSelectedGcalEvent(ev.rawGcal)
                        } else {
                          setSelectedUnifiedEvent(ev)
                        }
                      }}
                      className="cursor-pointer rounded-xl border border-line bg-surface-alt p-3 transition hover:border-primary/50 hover:bg-surface"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <Badge tone={tone}>{getTypeLabel(ev.type)}</Badge>
                        <span className="font-mono text-xs font-bold text-ink">
                          {ev.timeLabel}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs font-bold text-ink">{ev.title}</p>
                      {ev.subtitle && (
                        <p className="mt-0.5 text-[11px] text-ink-muted">{ev.subtitle}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      ) : (
        /* มุมมองกำหนดการ (Agenda View) */
        <Card className="space-y-4">
          <h2 className="text-base font-bold text-ink">
            📋 กำหนดการทั้งหมดในเดือน {formatMonthYearThai(currentDate)}
          </h2>

          <div className="divide-y divide-line">
            {calendarDays
              .filter((d) => d.isCurrentMonth)
              .map((d) => {
                const events = getEventsForDate(d.dateKey, d.dayOfWeek)
                if (events.length === 0) return null

                return (
                  <div key={d.dateKey} className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-primary">
                        วัน{DAYS_HEADER.find((dh) => dh.code === d.dayOfWeek)?.label} ที่ {d.dayNum}
                      </span>
                      {d.isToday && <Badge tone="primary">วันนี้</Badge>}
                    </div>

                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {events.map((ev) => (
                        <div
                          key={ev.id}
                          onClick={() => {
                            if (ev.rawGcal) {
                              setSelectedGcalEvent(ev.rawGcal)
                            } else {
                              setSelectedUnifiedEvent(ev)
                            }
                          }}
                          className="cursor-pointer rounded-xl border border-line bg-surface-alt p-3 transition hover:border-primary"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <Badge tone={getBadgeTone(ev.type)}>{getTypeLabel(ev.type)}</Badge>
                            <span className="font-mono text-xs font-bold text-ink">
                              {ev.timeLabel}
                            </span>
                          </div>
                          <p className="mt-1 text-sm font-bold text-ink">{ev.title}</p>
                          {ev.subtitle && (
                            <p className="mt-0.5 text-xs text-ink-muted">{ev.subtitle}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
          </div>
        </Card>
      )}

      {/* Modal รายละเอียดอีเวนต์ Google Calendar */}
      <GoogleCalendarEventModal
        event={selectedGcalEvent}
        onClose={() => setSelectedGcalEvent(null)}
      />

      {/* Modal รายละเอียดกิจกรรมทั่วไป (วิชาเรียน, งาน, กิจวัตร) */}
      {selectedUnifiedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedUnifiedEvent(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 border-b border-line pb-3">
              <div>
                <Badge tone={getBadgeTone(selectedUnifiedEvent.type)}>
                  {getTypeLabel(selectedUnifiedEvent.type)}
                </Badge>
                <h3 className="mt-2 text-base font-bold text-ink">
                  {selectedUnifiedEvent.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUnifiedEvent(null)}
                className="rounded-lg px-2 py-1 text-xs font-bold text-ink-muted hover:bg-surface-alt"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs text-ink-secondary">
              <div className="rounded-xl bg-surface-alt px-3 py-2">
                <span className="font-semibold text-ink-muted">เวลา: </span>
                <span className="font-mono font-bold text-ink">
                  {selectedUnifiedEvent.timeLabel}
                </span>
              </div>
              {selectedUnifiedEvent.subtitle && (
                <div className="rounded-xl bg-surface-alt px-3 py-2">
                  <span className="font-medium text-ink">
                    {selectedUnifiedEvent.subtitle}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
              {selectedUnifiedEvent.type === 'class' && (
                <Link to="/schedule">
                  <Button variant="primary" size="sm">
                    เปิดตารางเรียนเต็ม ↗
                  </Button>
                </Link>
              )}
              {selectedUnifiedEvent.type === 'task' && (
                <Link to="/tasks">
                  <Button variant="primary" size="sm">
                    ไปจัดการงาน ↗
                  </Button>
                </Link>
              )}
              {selectedUnifiedEvent.type === 'routine' && (
                <Link to="/life">
                  <Button variant="primary" size="sm">
                    ไปจัดการตารางชีวิต ↗
                  </Button>
                </Link>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedUnifiedEvent(null)}
              >
                ปิดหน้าต่าง
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CalendarPage
