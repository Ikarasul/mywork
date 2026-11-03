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

const DAYS_META: Record<
  DayOfWeek,
  { label: string; short: string; color: string; badgeTone: 'amber' | 'pink' | 'mint' | 'warning' | 'sky' | 'primary' | 'danger' }
> = {
  MON: { label: 'จันทร์', short: 'จ.', color: 'border-accent-amber', badgeTone: 'amber' },
  TUE: { label: 'อังคาร', short: 'อ.', color: 'border-accent-pink', badgeTone: 'pink' },
  WED: { label: 'พุธ', short: 'พ.', color: 'border-accent-mint', badgeTone: 'mint' },
  THU: { label: 'พฤหัสบดี', short: 'พฤ.', color: 'border-status-warning', badgeTone: 'warning' },
  FRI: { label: 'ศุกร์', short: 'ศ.', color: 'border-accent-sky', badgeTone: 'sky' },
  SAT: { label: 'เสาร์', short: 'ส.', color: 'border-primary', badgeTone: 'primary' },
  SUN: { label: 'อาทิตย์', short: 'อา.', color: 'border-status-danger', badgeTone: 'danger' },
}

const DAYS_ORDER: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

type CalendarItemType = 'class' | 'routine' | 'task' | 'exam' | 'gcal'

interface UnifiedCalendarEvent {
  id: string
  title: string
  subtitle?: string
  location?: string
  timeLabel: string
  startMin: number
  type: CalendarItemType
  rawGcal?: GoogleCalendarEventItem
  rawTask?: TaskItem
  rawClass?: CourseScheduleItem
  rawRoutine?: RoutineItem
  dateKey?: string
  dayOfWeek: DayOfWeek
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function getMondayOfCurrentWeek(d: Date = new Date()): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

export function CalendarPage() {
  const { user, activeGroup } = useAuth()
  const gcal = useGoogleCalendar()

  const todayDateKey = useMemo(() => formatDateKey(new Date()), [])
  const todayDayCode = useMemo(() => getTodayDayOfWeek(), [])

  // มุมมอง: 'week' (สัปดาห์นี้ - อ่านง่ายสุด), 'month' (รายเดือน), 'agenda' (กำหนดการ)
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'agenda'>('week')
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [selectedDayKey, setSelectedDayKey] = useState<string>(todayDateKey)

  // ตัวกรองกิจกรรม
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

  // คำนวณวัน 7 วันของสัปดาห์ที่กำลังเลือกดู
  const currentWeekDays = useMemo(() => {
    const monday = getMondayOfCurrentWeek(currentDate)
    return DAYS_ORDER.map((code, index) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + index)
      const dateKey = formatDateKey(d)
      return {
        date: d,
        dateKey,
        dayNum: d.getDate(),
        dayOfWeek: code,
        isToday: dateKey === todayDateKey,
      }
    })
  }, [currentDate, todayDateKey])

  // คำนวณวันสำหรับมุมมองเดือน
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const totalDays = lastDay.getDate()

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

    for (let i = leadingEmpty - 1; i >= 0; i--) {
      const d = new Date(year, month, -i)
      const dayCode = DAYS_ORDER[d.getDay() === 0 ? 6 : d.getDay() - 1]
      days.push({
        date: d,
        dateKey: formatDateKey(d),
        dayNum: d.getDate(),
        isCurrentMonth: false,
        dayOfWeek: dayCode,
        isToday: formatDateKey(d) === todayDateKey,
      })
    }

    for (let i = 1; i <= totalDays; i++) {
      const d = new Date(year, month, i)
      const dayCode = DAYS_ORDER[d.getDay() === 0 ? 6 : d.getDay() - 1]
      days.push({
        date: d,
        dateKey: formatDateKey(d),
        dayNum: i,
        isCurrentMonth: true,
        dayOfWeek: dayCode,
        isToday: formatDateKey(d) === todayDateKey,
      })
    }

    const trailingEmpty = (7 - (days.length % 7)) % 7
    for (let i = 1; i <= trailingEmpty; i++) {
      const d = new Date(year, month + 1, i)
      const dayCode = DAYS_ORDER[d.getDay() === 0 ? 6 : d.getDay() - 1]
      days.push({
        date: d,
        dateKey: formatDateKey(d),
        dayNum: d.getDate(),
        isCurrentMonth: false,
        dayOfWeek: dayCode,
        isToday: formatDateKey(d) === todayDateKey,
      })
    }

    return days
  }, [year, month, todayDateKey])

  // ดึงกิจกรรมของวันใดวันหนึ่ง
  const getEventsForDate = useCallback(
    (dateKey: string, dayOfWeek: DayOfWeek): UnifiedCalendarEvent[] => {
      const events: UnifiedCalendarEvent[] = []

      // 1. คาบเรียน
      if (filterClasses) {
        const classMatches = sessions.filter((s) => s.day === dayOfWeek)
        for (const c of classMatches) {
          events.push({
            id: `class-${c.course_code}-${dateKey}`,
            title: c.course_name,
            subtitle: c.course_code,
            location: c.room ? `ห้อง ${c.room}` : undefined,
            timeLabel: `${c.start} – ${c.end}`,
            startMin: timeToMinutes(c.start),
            type: 'class',
            rawClass: c,
            dateKey,
            dayOfWeek,
          })
        }
      }

      // 2. กิจวัตรชีวิต
      if (filterRoutines) {
        const routineMatches = routines.filter(
          (r) => r.day === 'ALL' || r.day === dayOfWeek,
        )
        for (const r of routineMatches) {
          events.push({
            id: `routine-${r.id}-${dateKey}`,
            title: r.title,
            subtitle: r.category || 'กิจวัตร',
            timeLabel: `${r.start_time} – ${r.end_time}`,
            startMin: timeToMinutes(r.start_time),
            type: 'routine',
            rawRoutine: r,
            dateKey,
            dayOfWeek,
          })
        }
      }

      // 3. งาน/การบ้าน และนัดสอบ
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
            : '23:59'

          events.push({
            id: `task-${t.id}`,
            title: t.title,
            subtitle: t.course_code ? `วิชา ${t.course_code}` : 'งานในกลุ่ม',
            timeLabel: timePart ? `กำหนดส่ง ${timePart} น.` : 'ส่งวันนี้',
            startMin: timeToMinutes(timePart),
            type: isExam ? 'exam' : 'task',
            rawTask: t,
            dateKey,
            dayOfWeek,
          })
        }
      }

      // 4. Google Calendar
      if (filterGcal && gcal.overlayVisible) {
        for (const ev of gcal.events) {
          const evDateKey = ev.startIso ? ev.startIso.slice(0, 10) : ''
          if (evDateKey === dateKey || ev.day === dayOfWeek) {
            events.push({
              id: `gcal-${ev.id}`,
              title: ev.summary,
              subtitle: 'Google Calendar',
              location: ev.location,
              timeLabel: ev.isAllDay ? 'ตลอดทั้งวัน' : `${ev.startTime} – ${ev.endTime}`,
              startMin: ev.isAllDay ? 0 : timeToMinutes(ev.startTime),
              type: 'gcal',
              rawGcal: ev,
              dateKey,
              dayOfWeek,
            })
          }
        }
      }

      return events.sort((a, b) => a.startMin - b.startMin)
    },
    [filterClasses, filterRoutines, filterTasks, filterExams, filterGcal, sessions, routines, tasks, gcal.events, gcal.overlayVisible],
  )

  const selectedDayEvents = useMemo(() => {
    const matchDay = calendarDays.find((d) => d.dateKey === selectedDayKey)
    if (!matchDay) {
      return getEventsForDate(selectedDayKey, todayDayCode)
    }
    return getEventsForDate(matchDay.dateKey, matchDay.dayOfWeek)
  }, [calendarDays, selectedDayKey, todayDayCode, getEventsForDate])

  // สรุปข้อมูลสำหรับกล่องด้านบน
  const todayClassesCount = useMemo(() => sessions.filter((s) => s.day === todayDayCode).length, [sessions, todayDayCode])
  const pendingTasksCount = useMemo(() => tasks.filter((t) => t.status !== 'done').length, [tasks])

  function handlePrev() {
    if (viewMode === 'week') {
      setCurrentDate((prev) => {
        const d = new Date(prev)
        d.setDate(d.getDate() - 7)
        return d
      })
    } else {
      setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
    }
  }

  function handleNext() {
    if (viewMode === 'week') {
      setCurrentDate((prev) => {
        const d = new Date(prev)
        d.setDate(d.getDate() + 7)
        return d
      })
    } else {
      setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
    }
  }

  function handleToday() {
    const today = new Date()
    setCurrentDate(today)
    setSelectedDayKey(todayDateKey)
  }

  function getItemTheme(type: CalendarItemType) {
    switch (type) {
      case 'class':
        return {
          icon: '📚',
          badgeText: 'คาบเรียน',
          bg: 'bg-primary-soft/50 hover:bg-primary-soft',
          border: 'border-l-4 border-l-primary border-line',
          badgeTone: 'primary' as const,
        }
      case 'routine':
        return {
          icon: '⏰',
          badgeText: 'กิจวัตร',
          bg: 'bg-accent-mint-soft/50 hover:bg-accent-mint-soft',
          border: 'border-l-4 border-l-accent-mint border-line',
          badgeTone: 'mint' as const,
        }
      case 'exam':
        return {
          icon: '🎯',
          badgeText: 'วันสอบ',
          bg: 'bg-accent-pink-soft/60 hover:bg-accent-pink-soft',
          border: 'border-l-4 border-l-accent-pink border-line',
          badgeTone: 'pink' as const,
        }
      case 'task':
        return {
          icon: '📝',
          badgeText: 'งาน/การบ้าน',
          bg: 'bg-accent-amber-soft/50 hover:bg-accent-amber-soft',
          border: 'border-l-4 border-l-accent-amber border-line',
          badgeTone: 'amber' as const,
        }
      case 'gcal':
      default:
        return {
          icon: '📆',
          badgeText: 'Google',
          bg: 'bg-accent-sky-soft/60 hover:bg-accent-sky-soft',
          border: 'border-l-4 border-l-accent-sky border-dashed border-line',
          badgeTone: 'sky' as const,
        }
    }
  }

  return (
    <div className="space-y-6">
      {/* ส่วนหัวหน้าปฏิทิน: โลโก้อีกา + สรุปด่วน */}
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3.5">
            <PixelCat mood="happy" size={54} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-ink sm:text-2xl">
                  ปฏิทินและกำหนดการ
                </h1>
                <Badge tone="primary">ดูง่าย ครบทุกกิจกรรม</Badge>
              </div>
              <p className="mt-1 text-xs text-ink-secondary sm:text-sm">
                วันนี้: {formatFullDateThai()} • วางแผนเวลาได้อย่างชัดเจน
              </p>
            </div>
          </div>

          {/* สรุปด่วน 3 ช่องแบบเข้าใจง่าย */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
            <div className="rounded-xl border border-line bg-surface-alt px-3 py-2">
              <span className="text-[11px] font-medium text-ink-muted">เรียนวันนี้</span>
              <p className="font-pixel text-base font-bold text-primary sm:text-lg">
                {todayClassesCount} คาบ
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-alt px-3 py-2">
              <span className="text-[11px] font-medium text-ink-muted">งานค้างส่ง</span>
              <p className="font-pixel text-base font-bold text-accent-amber sm:text-lg">
                {pendingTasksCount} งาน
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-alt px-3 py-2">
              <span className="text-[11px] font-medium text-ink-muted">Google Events</span>
              <p className="font-pixel text-base font-bold text-accent-sky sm:text-lg">
                {gcal.events.length} นัดหมาย
              </p>
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

        {/* แถบตัวกรอง (Filter Pills) แบบอ่านง่าย กดเปิด/ปิดได้ */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
          <span className="text-xs font-bold text-ink-muted">แสดง:</span>
          <button
            type="button"
            onClick={() => setFilterClasses(!filterClasses)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
              filterClasses
                ? 'border-primary bg-primary-soft text-primary shadow-2xs'
                : 'border-line bg-surface-alt text-ink-muted opacity-60'
            }`}
          >
            <span>📚</span>
            <span>ตารางเรียน</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterRoutines(!filterRoutines)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
              filterRoutines
                ? 'border-accent-mint bg-accent-mint-soft text-accent-mint-fg shadow-2xs'
                : 'border-line bg-surface-alt text-ink-muted opacity-60'
            }`}
          >
            <span>⏰</span>
            <span>กิจวัตรชีวิต</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTasks(!filterTasks)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
              filterTasks
                ? 'border-accent-amber bg-accent-amber-soft text-accent-amber-fg shadow-2xs'
                : 'border-line bg-surface-alt text-ink-muted opacity-60'
            }`}
          >
            <span>📝</span>
            <span>งาน/การบ้าน</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterExams(!filterExams)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
              filterExams
                ? 'border-accent-pink bg-accent-pink-soft text-accent-pink-fg shadow-2xs'
                : 'border-line bg-surface-alt text-ink-muted opacity-60'
            }`}
          >
            <span>🎯</span>
            <span>วันสอบ</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterGcal(!filterGcal)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
              filterGcal
                ? 'border-accent-sky bg-accent-sky-soft text-accent-sky-fg shadow-2xs'
                : 'border-line bg-surface-alt text-ink-muted opacity-60'
            }`}
          >
            <span>📆</span>
            <span>Google Calendar</span>
          </button>
        </div>
      </Card>

      {/* แถบควบคุมมุมมองและเปลี่ยนช่วงเวลา */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-ink sm:text-xl">
            {viewMode === 'week'
              ? `สัปดาห์นี้ (${currentWeekDays[0].dayNum} – ${currentWeekDays[6].dayNum} ${formatMonthYearThai(currentDate)})`
              : formatMonthYearThai(currentDate)}
          </h2>
          <Button variant="outline" size="sm" onClick={handleToday}>
            กลับไปวันนี้
          </Button>
        </div>

        {/* ปุ่มสลับโหมด: สัปดาห์ / เดือน / กำหนดการ */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-line bg-surface-alt p-1">
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                viewMode === 'week'
                  ? 'bg-primary text-ink-inverted shadow-2xs'
                  : 'text-ink-secondary hover:text-ink'
              }`}
            >
              📅 สัปดาห์นี้
            </button>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                viewMode === 'month'
                  ? 'bg-primary text-ink-inverted shadow-2xs'
                  : 'text-ink-secondary hover:text-ink'
              }`}
            >
              🗓️ ทั้งเดือน
            </button>
            <button
              type="button"
              onClick={() => setViewMode('agenda')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                viewMode === 'agenda'
                  ? 'bg-primary text-ink-inverted shadow-2xs'
                  : 'text-ink-secondary hover:text-ink'
              }`}
            >
              📋 กำหนดการ
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <Button variant="secondary" size="sm" onClick={handlePrev}>
              ◀ ก่อนหน้า
            </Button>
            <Button variant="secondary" size="sm" onClick={handleNext}>
              ถัดไป ▶
            </Button>
          </div>
        </div>
      </div>

      {/* เนื้อหาปฏิทินตามมุมมองที่เลือก */}
      {loading ? (
        <Skeleton lines={5} label="อีกาตัวน้อยกำลังจัดเรียงปฏิทินให้คุณ..." />
      ) : viewMode === 'week' ? (
        /* ================= 1. มุมมองรายสัปดาห์ (ดูง่ายที่สุด สะอาดตา) ================= */
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-7">
          {currentWeekDays.map((day) => {
            const dayMeta = DAYS_META[day.dayOfWeek]
            const dayEvents = getEventsForDate(day.dateKey, day.dayOfWeek)
            const isToday = day.isToday

            return (
              <div
                key={day.dateKey}
                className={`flex flex-col rounded-2xl border p-3.5 transition ${
                  isToday
                    ? 'border-2 border-primary bg-primary-soft/20 shadow-xs'
                    : 'border-line bg-surface hover:border-line-strong'
                }`}
              >
                {/* หัวแถบวัน */}
                <div className="flex items-center justify-between border-b border-line pb-2.5">
                  <div>
                    <span className="text-xs font-bold text-ink">
                      วัน{dayMeta.label}
                    </span>
                    <span className="ml-1.5 font-mono text-sm font-extrabold text-ink">
                      {day.dayNum}
                    </span>
                  </div>
                  {isToday ? (
                    <Badge tone="primary">วันนี้</Badge>
                  ) : (
                    <span className="text-[11px] font-semibold text-ink-muted">
                      {dayEvents.length} รายการ
                    </span>
                  )}
                </div>

                {/* รายการกิจกรรมในวันนั้นแบบการ์ดอ่านง่าย */}
                <div className="mt-3 flex-1 space-y-2">
                  {dayEvents.length === 0 ? (
                    <div className="py-6 text-center text-xs text-ink-muted">
                      <span>ว่าง • ไม่มีกิจกรรม</span>
                    </div>
                  ) : (
                    dayEvents.map((ev) => {
                      const theme = getItemTheme(ev.type)
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
                          className={`cursor-pointer rounded-xl border p-2.5 text-xs transition shadow-2xs ${theme.bg} ${theme.border}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-[11px] font-bold text-ink">
                              {ev.timeLabel}
                            </span>
                            <Badge tone={theme.badgeTone}>
                              {theme.icon} {theme.badgeText}
                            </Badge>
                          </div>
                          <p className="mt-1 font-bold text-ink line-clamp-2 leading-snug">
                            {ev.title}
                          </p>
                          {ev.location && (
                            <p className="mt-0.5 text-[10px] text-ink-muted">
                              📍 {ev.location}
                            </p>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : viewMode === 'month' ? (
        /* ================= 2. มุมมองรายเดือนแบบโปร่งโล่ง ================= */
        <div className="grid gap-6 lg:grid-cols-4">
          <Card padding="none" className="lg:col-span-3 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-line bg-surface-alt text-center text-xs font-bold text-ink-secondary">
              {DAYS_ORDER.map((code) => (
                <div key={code} className="py-3">
                  <span className="hidden sm:inline">วัน{DAYS_META[code].label}</span>
                  <span className="sm:hidden">{DAYS_META[code].short}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 divide-x divide-y divide-line">
              {calendarDays.map((cell) => {
                const isSelected = cell.dateKey === selectedDayKey
                const dayEvents = getEventsForDate(cell.dateKey, cell.dayOfWeek)

                return (
                  <div
                    key={cell.dateKey}
                    onClick={() => setSelectedDayKey(cell.dateKey)}
                    className={`min-h-[92px] cursor-pointer p-2 transition sm:min-h-[110px] ${
                      !cell.isCurrentMonth
                        ? 'bg-surface-alt/40 opacity-40'
                        : isSelected
                          ? 'bg-primary-soft/40 ring-2 ring-primary ring-inset'
                          : 'bg-surface hover:bg-surface-hover/70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold ${
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

                    <div className="mt-1.5 space-y-1">
                      {dayEvents.slice(0, 3).map((ev) => {
                        const theme = getItemTheme(ev.type)
                        return (
                          <div
                            key={ev.id}
                            className={`truncate rounded px-1.5 py-0.5 text-[10px] font-semibold ${theme.bg} text-ink`}
                          >
                            <span>{theme.icon}</span> <span>{ev.title}</span>
                          </div>
                        )
                      })}
                      {dayEvents.length > 3 && (
                        <p className="text-[9px] font-bold text-ink-muted">
                          +{dayEvents.length - 3} รายการเพิ่มเติม
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* รายละเอียดของวันทางด้านข้าง */}
          <Card className="lg:col-span-1 space-y-4">
            <div className="border-b border-line pb-3">
              <span className="text-xs font-medium text-ink-muted">รายละเอียดกิจกรรม</span>
              <h3 className="mt-0.5 text-base font-bold text-ink">
                {formatFullDateThai(new Date(selectedDayKey))}
              </h3>
              <p className="mt-1 text-xs text-ink-secondary">
                รวมทั้งหมด {selectedDayEvents.length} กิจกรรม
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
                  const theme = getItemTheme(ev.type)
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
                      className={`cursor-pointer rounded-xl border p-3 transition hover:shadow-2xs ${theme.bg} ${theme.border}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <Badge tone={theme.badgeTone}>
                          {theme.icon} {theme.badgeText}
                        </Badge>
                        <span className="font-mono text-xs font-bold text-ink">
                          {ev.timeLabel}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-bold text-ink">{ev.title}</p>
                      {ev.location && (
                        <p className="mt-0.5 text-xs text-ink-muted">📍 {ev.location}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      ) : (
        /* ================= 3. มุมมองกำหนดการ (Agenda Timeline) ================= */
        <Card className="space-y-4">
          <div className="border-b border-line pb-3">
            <h2 className="text-base font-bold text-ink">
              📋 กำหนดการทั้งหมดในเดือน {formatMonthYearThai(currentDate)}
            </h2>
            <p className="text-xs text-ink-muted">
              เรียงลำดับตามวันและเวลา พร้อมรายละเอียดครบถ้วน
            </p>
          </div>

          <div className="divide-y divide-line">
            {calendarDays
              .filter((d) => d.isCurrentMonth)
              .map((d) => {
                const events = getEventsForDate(d.dateKey, d.dayOfWeek)
                if (events.length === 0) return null

                return (
                  <div key={d.dateKey} className="py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-primary">
                        วัน{DAYS_META[d.dayOfWeek].label} ที่ {d.dayNum}
                      </span>
                      {d.isToday && <Badge tone="primary">วันนี้</Badge>}
                    </div>

                    <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {events.map((ev) => {
                        const theme = getItemTheme(ev.type)
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
                            className={`cursor-pointer rounded-xl border p-3 transition hover:shadow-2xs ${theme.bg} ${theme.border}`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <Badge tone={theme.badgeTone}>
                                {theme.icon} {theme.badgeText}
                              </Badge>
                              <span className="font-mono text-xs font-bold text-ink">
                                {ev.timeLabel}
                              </span>
                            </div>
                            <p className="mt-1.5 text-sm font-bold text-ink">{ev.title}</p>
                            {ev.subtitle && (
                              <p className="mt-0.5 text-xs text-ink-muted">{ev.subtitle}</p>
                            )}
                            {ev.location && (
                              <p className="mt-0.5 text-xs text-ink-muted">📍 {ev.location}</p>
                            )}
                          </div>
                        )
                      })}
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

      {/* Modal รายละเอียดกิจกรรม (วิชาเรียน, งาน, กิจวัตร) */}
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
                <Badge tone={getItemTheme(selectedUnifiedEvent.type).badgeTone}>
                  {getItemTheme(selectedUnifiedEvent.type).icon}{' '}
                  {getItemTheme(selectedUnifiedEvent.type).badgeText}
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
              {selectedUnifiedEvent.location && (
                <div className="rounded-xl bg-surface-alt px-3 py-2">
                  <span className="font-medium text-ink">
                    📍 {selectedUnifiedEvent.location}
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
