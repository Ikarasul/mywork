import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppointmentDialog from '../components/AppointmentDialog'
import GoogleCalendarSyncBar, {
  GoogleCalendarEventModal,
} from '../components/GoogleCalendarSyncBar'
import PixelCat from '../components/PixelCat'
import RescheduleDialog, { type RescheduleSubmitPayload } from '../components/RescheduleDialog'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
  Toast,
} from '../components/ui'
import { formatApptTimeLabel, toDateKey, useAppointments } from '../lib/appointments'
import { useAuth } from '../lib/auth'
import {
  formatFullDateThai,
  formatMonthYearThai,
  getTodayDayOfWeek,
} from '../lib/dateThai'
import { useGoogleCalendar } from '../lib/googleCalendar'
import { DAY_THAI_NAMES, useClassReschedules } from '../lib/reschedules'
import {
  DEFAULT_SEMESTER,
  KNOWN_COURSE_LINKS,
  getSampleScheduleFromCsv,
  mergeScheduleWithoutDuplicates,
  storage,
  timeToMinutes,
} from '../lib/storage'
import type {
  AppointmentItem,
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

type CalendarItemType = 'class' | 'routine' | 'task' | 'exam' | 'gcal' | 'appt'

interface UnifiedCalendarEvent {
  id: string
  title: string
  subtitle?: string
  location?: string
  timeLabel: string
  startMin: number
  type: CalendarItemType
  rawGcal?: GoogleCalendarEventItem
  rawAppt?: AppointmentItem
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
  const { user, activeGroup, currentRole } = useAuth()
  const gcal = useGoogleCalendar()
  const reschedules = useClassReschedules(DEFAULT_SEMESTER)

  const todayDateKey = useMemo(() => formatDateKey(new Date()), [])
  const todayDayCode = useMemo(() => getTodayDayOfWeek(), [])
  const canManage =
    !user || currentRole === 'owner' || currentRole === 'admin' || currentRole === 'member'

  // มุมมอง: 'week' (สัปดาห์นี้ - อ่านง่ายสุด), 'month' (รายเดือน), 'agenda' (กำหนดการ)
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'agenda'>('week')
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [selectedDayKey, setSelectedDayKey] = useState<string>(todayDateKey)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // ตัวกรองกิจกรรม
  const [filterClasses, setFilterClasses] = useState(true)
  const [filterRoutines, setFilterRoutines] = useState(true)
  const [filterTasks, setFilterTasks] = useState(true)
  const [filterExams, setFilterExams] = useState(true)
  const [filterGcal, setFilterGcal] = useState(true)
  const [filterAppts, setFilterAppts] = useState(true)
  const appts = useAppointments()
  const [apptDialog, setApptDialog] = useState<{ open: boolean; item: AppointmentItem | null }>({
    open: false,
    item: null,
  })
  const [rescheduleModal, setRescheduleModal] = useState<{
    session: CourseScheduleItem
    originalDate: string
    targetDate: string
  } | null>(null)
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null)
  const [draggingEvent, setDraggingEvent] = useState<UnifiedCalendarEvent | null>(null)

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

      const rawSched =
        schedData && schedData.length > 0 ? schedData : getSampleScheduleFromCsv()
      const enrichedSched = rawSched.map((s) => ({
        ...s,
        online_url: s.online_url || KNOWN_COURSE_LINKS[s.course_code]?.online_url,
        contact_url: s.contact_url || KNOWN_COURSE_LINKS[s.course_code]?.contact_url,
        online_link: s.online_link || Boolean(s.online_url || KNOWN_COURSE_LINKS[s.course_code]?.online_url),
      }))
      const { merged: dedupedSched } = mergeScheduleWithoutDuplicates([], enrichedSched)

      setSessions(dedupedSched)
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

      // 1. คาบเรียน (รองรับการย้ายคาบรายสัปดาห์/รายวัน)
      if (filterClasses) {
        const { activeSessions: classMatches } = reschedules.getEffectiveSessionsForDate(
          sessions,
          dateKey,
          dayOfWeek,
        )
        for (const c of classMatches) {
          events.push({
            id: `class-${c.course_code}-${c.start}-${dateKey}`,
            title: c.course_name,
            subtitle: c.rescheduledInfo
              ? `${c.course_code} • ย้ายจากวัน${DAYS_META[c.rescheduledInfo.originalDay].label}`
              : c.course_code,
            location: c.room ? `ห้อง ${c.room}` : undefined,
            timeLabel: `${c.start}–${c.end}`,
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
            timeLabel: `${r.start_time}–${r.end_time}`,
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

      // 5. นัดหมายของกลุ่ม (ตรงวันที่)
      if (filterAppts) {
        for (const a of appts.byDate.get(dateKey) ?? []) {
          events.push({
            id: `appt-${a.id}`,
            title: a.title,
            subtitle: a.course_code ? `วิชา ${a.course_code}` : 'นัดหมาย',
            location: a.location || undefined,
            timeLabel: formatApptTimeLabel(a),
            startMin: a.all_day ? 0 : timeToMinutes(a.start_time),
            type: 'appt',
            rawAppt: a,
            dateKey,
            dayOfWeek,
          })
        }
      }

      return events.sort((a, b) => a.startMin - b.startMin)
    },
    [
      filterClasses,
      filterRoutines,
      filterTasks,
      filterExams,
      filterGcal,
      filterAppts,
      appts.byDate,
      reschedules,
      sessions,
      routines,
      tasks,
      gcal.events,
      gcal.overlayVisible,
    ],
  )

  const handleDropOnDate = useCallback(
    async (targetDateKey: string) => {
      setDragOverDateKey(null)
      if (!draggingEvent || !canManage) {
        setDraggingEvent(null)
        return
      }
      const ev = draggingEvent
      setDraggingEvent(null)
      if (ev.dateKey === targetDateKey) return

      if (ev.type === 'appt' && ev.rawAppt) {
        await appts.saveAppointment(
          {
            title: ev.rawAppt.title,
            appt_date: targetDateKey,
            start_time: ev.rawAppt.start_time,
            end_time: ev.rawAppt.end_time,
            all_day: ev.rawAppt.all_day,
            location: ev.rawAppt.location,
            notes: ev.rawAppt.notes,
            course_code: ev.rawAppt.course_code,
          },
          ev.rawAppt.id,
        )
        setToastMsg(`ย้ายนัดหมาย "${ev.rawAppt.title}" ไปวันที่ ${targetDateKey} เรียบร้อยแล้ว`)
      } else if (ev.type === 'class' && ev.rawClass) {
        const origDate =
          ev.rawClass.rescheduledInfo?.originalDate ?? ev.dateKey ?? todayDateKey
        setRescheduleModal({
          session: ev.rawClass,
          originalDate: origDate,
          targetDate: targetDateKey,
        })
      }
    },
    [draggingEvent, canManage, appts, todayDateKey],
  )

  const handleRescheduleSubmit = useCallback(
    async (payload: RescheduleSubmitPayload) => {
      if (!rescheduleModal) return
      const targetSess = rescheduleModal.session
      const origDay = targetSess.rescheduledInfo?.originalDay ?? targetSess.day
      const origStart =
        targetSess.rescheduledInfo?.originalStart ?? targetSess.start
      const origEnd = targetSess.rescheduledInfo?.originalEnd ?? targetSess.end
      const origDate =
        targetSess.rescheduledInfo?.originalDate ?? rescheduleModal.originalDate

      if (payload.mode === 'permanent') {
        const updated = sessions.map((s) => {
          if (
            s.course_code.toUpperCase() === targetSess.course_code.toUpperCase() &&
            s.day === origDay &&
            s.start === origStart
          ) {
            return {
              ...s,
              day: payload.newDay,
              start: payload.newStart,
              end: payload.newEnd,
              room: payload.newRoom || s.room,
            }
          }
          return s
        })
        await storage.set(scheduleStorageKey, updated)
        if (targetSess.rescheduledInfo?.overrideId) {
          await reschedules.removeOverride(targetSess.rescheduledInfo.overrideId)
        }
        setSessions(updated)
        setToastMsg(
          `เปลี่ยนตารางหลักวิชา ${targetSess.course_code} เป็นวัน${DAY_THAI_NAMES[payload.newDay]} เวลา ${payload.newStart}–${payload.newEnd} เรียบร้อยแล้ว`,
        )
      } else {
        await reschedules.saveOverride(
          {
            course_code: targetSess.course_code,
            course_name: targetSess.course_name,
            section: targetSess.section,
            original_date: origDate,
            original_day: origDay,
            original_start: origStart,
            original_end: origEnd,
            canceled: payload.mode === 'cancel',
            new_date: payload.newDate,
            new_start: payload.newStart,
            new_end: payload.newEnd,
            new_room: payload.newRoom,
            reason: payload.reason,
          },
          targetSess.rescheduledInfo?.overrideId,
        )
        setToastMsg(
          payload.mode === 'cancel'
            ? `บันทึกการงดคลาสวิชา ${targetSess.course_code} วันที่ ${origDate} เรียบร้อยแล้ว`
            : `ย้ายคาบวิชา ${targetSess.course_code} ไปวันที่ ${payload.newDate} (${payload.newStart}–${payload.newEnd}) เรียบร้อยแล้ว`,
        )
      }
    },
    [rescheduleModal, sessions, scheduleStorageKey, reschedules],
  )

  function handleEventClick(ev: UnifiedCalendarEvent) {
    if (ev.rawGcal) {
      setSelectedGcalEvent(ev.rawGcal)
    } else if (ev.rawAppt) {
      setApptDialog({ open: true, item: ev.rawAppt })
    } else {
      setSelectedUnifiedEvent(ev)
    }
  }

  const courseCodeOptions = useMemo(
    () => Array.from(new Set(sessions.map((s) => s.course_code.toUpperCase()))).sort(),
    [sessions],
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
          bg: 'bg-primary-soft/40 hover:bg-primary-soft/70',
          border: 'border-l-[3.5px] border-l-primary border-line',
          badgeTone: 'primary' as const,
          chipClass: 'bg-primary/20 text-primary border border-primary/30',
        }
      case 'routine':
        return {
          icon: '⏰',
          badgeText: 'กิจวัตร',
          bg: 'bg-accent-mint-soft/40 hover:bg-accent-mint-soft/70',
          border: 'border-l-[3.5px] border-l-accent-mint border-line',
          badgeTone: 'mint' as const,
          chipClass: 'bg-accent-mint/20 text-accent-mint-fg border border-accent-mint/30',
        }
      case 'exam':
        return {
          icon: '🎯',
          badgeText: 'วันสอบ',
          bg: 'bg-accent-pink-soft/50 hover:bg-accent-pink-soft/80',
          border: 'border-l-[3.5px] border-l-accent-pink border-line',
          badgeTone: 'pink' as const,
          chipClass: 'bg-accent-pink/20 text-accent-pink-fg border border-accent-pink/30',
        }
      case 'task':
        return {
          icon: '📝',
          badgeText: 'งาน/การบ้าน',
          bg: 'bg-accent-amber-soft/40 hover:bg-accent-amber-soft/70',
          border: 'border-l-[3.5px] border-l-accent-amber border-line',
          badgeTone: 'amber' as const,
          chipClass: 'bg-accent-amber/20 text-accent-amber-fg border border-accent-amber/30',
        }
      case 'appt':
        return {
          icon: '🤝',
          badgeText: 'นัดหมาย',
          bg: 'bg-accent-amber-soft/60 hover:bg-accent-amber-soft',
          border: 'border-l-[3.5px] border-l-accent-amber border-line',
          badgeTone: 'amber' as const,
          chipClass: 'bg-accent-amber/25 text-accent-amber-fg border border-accent-amber/40',
        }
      case 'gcal':
      default:
        return {
          icon: '📆',
          badgeText: 'Google',
          bg: 'bg-accent-sky-soft/40 hover:bg-accent-sky-soft/70',
          border: 'border-l-[3.5px] border-l-accent-sky border-line',
          badgeTone: 'sky' as const,
          chipClass: 'bg-accent-sky/20 text-accent-sky-fg border border-accent-sky/30',
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

          <button
            type="button"
            onClick={() => setFilterAppts(!filterAppts)}
            className={`flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition sm:min-h-[36px] ${
              filterAppts
                ? 'border-accent-amber bg-accent-amber-soft text-accent-amber-fg shadow-2xs'
                : 'border-line bg-surface-alt text-ink-muted opacity-60'
            }`}
          >
            <span>🤝</span>
            <span>นัดหมาย</span>
          </button>

          <button
            type="button"
            onClick={() => setApptDialog({ open: true, item: null })}
            className="ml-auto flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-ink-inverted shadow-2xs transition hover:bg-primary-hover sm:min-h-[36px]"
          >
            <span>+ เพิ่มนัด</span>
          </button>
        </div>
      </Card>

      {/* แผงควบคุมปฏิทินขนาดใหญ่ ชัดเจน อ่านง่าย */}
      <Card padding="md" className="border-line shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* ซ้าย: ปุ่มสลับช่วงเวลา + ชื่อช่วงวันที่ตัวโต */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrev}
                title="ย้อนกลับ"
                className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm font-bold text-ink shadow-2xs transition hover:bg-surface-hover"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={handleToday}
                className="flex min-h-[42px] items-center gap-1.5 rounded-xl border border-primary/40 bg-primary-soft px-3.5 py-2 text-xs sm:text-sm font-bold text-primary shadow-2xs transition hover:bg-primary hover:text-ink-inverted"
              >
                <span>⚡</span>
                <span>กลับไปวันนี้</span>
              </button>
              <button
                type="button"
                onClick={handleNext}
                title="ถัดไป"
                className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm font-bold text-ink shadow-2xs transition hover:bg-surface-hover"
              >
                ▶
              </button>
            </div>

            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                {viewMode === 'week'
                  ? 'ช่วงสัปดาห์ที่กำลังดู'
                  : viewMode === 'month'
                    ? 'เดือนที่กำลังดู'
                    : 'กำหนดการ'}
              </span>
              <h2 className="text-lg font-extrabold text-ink sm:text-2xl">
                {viewMode === 'week'
                  ? `สัปดาห์นี้ (${currentWeekDays[0].dayNum} – ${currentWeekDays[6].dayNum} ${formatMonthYearThai(currentDate)})`
                  : formatMonthYearThai(currentDate)}
              </h2>
            </div>
          </div>

          {/* ขวา: สลับมุมมอง 3 แบบ ปุ่มใหญ่ ตัวโต กดง่าย */}
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs font-semibold text-ink-muted">มุมมอง:</span>
            <div className="inline-flex rounded-2xl border border-line-strong bg-surface-alt p-1.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className={`flex min-h-[38px] items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition-all ${
                  viewMode === 'week'
                    ? 'bg-primary text-ink-inverted shadow-xs'
                    : 'text-ink-secondary hover:text-ink hover:bg-surface/60'
                }`}
              >
                <span>📅</span>
                <span>สัปดาห์นี้</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('month')}
                className={`flex min-h-[38px] items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition-all ${
                  viewMode === 'month'
                    ? 'bg-primary text-ink-inverted shadow-xs'
                    : 'text-ink-secondary hover:text-ink hover:bg-surface/60'
                }`}
              >
                <span>🗓️</span>
                <span>ทั้งเดือน</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('agenda')}
                className={`flex min-h-[38px] items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition-all ${
                  viewMode === 'agenda'
                    ? 'bg-primary text-ink-inverted shadow-xs'
                    : 'text-ink-secondary hover:text-ink hover:bg-surface/60'
                }`}
              >
                <span>📋</span>
                <span>กำหนดการ</span>
              </button>
            </div>
          </div>
        </div>
      </Card>

      {toastMsg && (
        <Toast
          tone="success"
          message={toastMsg}
          onClose={() => setToastMsg(null)}
        />
      )}

      {/* เนื้อหาปฏิทินตามมุมมองที่เลือก */}
      {loading ? (
        <Skeleton lines={5} label="อีกาตัวน้อยกำลังจัดเรียงปฏิทินให้คุณ..." />
      ) : viewMode === 'week' ? (
        /* ================= 1. มุมมองรายสัปดาห์ (ดีไซน์กระดานปฏิทินแบบ Unified เชื่อมต่อ 7 วัน สะอาด สวยงาม ไม่บีบอัด) ================= */
        <Card padding="none" className="overflow-hidden border-line shadow-xs">
          {canManage && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-alt/60 px-4 py-2 text-[11px] text-ink-secondary">
              <span>
                💡 <strong>ลากการ์ดวิชาเรียนหรือนัดหมาย</strong> ข้ามวันเพื่อย้ายคาบ/เลื่อนนัดได้ทันที หรือคลิกที่การ์ดเพื่อดูรายละเอียด
              </span>
              {reschedules.overrides.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    void reschedules.clearAllOverrides()
                    setToastMsg('คืนค่าคาบเรียนที่ย้ายชั่วคราวทั้งหมดกลับสู่ตารางปกติแล้ว')
                  }}
                  className="font-bold text-primary hover:underline"
                >
                  ↩️ คืนค่าคาบที่ย้ายทั้งหมด ({reschedules.overrides.length})
                </button>
              )}
            </div>
          )}
          <div className="overflow-x-auto">
            <div className="grid min-w-[920px] grid-cols-7 divide-x divide-line">
              {currentWeekDays.map((day) => {
                const dayMeta = DAYS_META[day.dayOfWeek]
                const dayEvents = getEventsForDate(day.dateKey, day.dayOfWeek)
                const isToday = day.isToday
                const isDropTarget = dragOverDateKey === day.dateKey

                return (
                  <div
                    key={day.dateKey}
                    onDragOver={(e) => {
                      if (!canManage || !draggingEvent) return
                      e.preventDefault()
                      if (dragOverDateKey !== day.dateKey) {
                        setDragOverDateKey(day.dateKey)
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverDateKey === day.dateKey) {
                        setDragOverDateKey(null)
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      void handleDropOnDate(day.dateKey)
                    }}
                    className={`flex flex-col transition-colors ${
                      isDropTarget
                        ? 'bg-primary-soft/30 ring-2 ring-primary ring-inset'
                        : isToday
                          ? 'bg-primary-soft/10'
                          : 'bg-surface'
                    }`}
                  >
                    {/* ส่วนหัวของแต่ละวัน (Day Header) */}
                    <div
                      className={`border-b border-line px-2.5 py-3 text-center transition-colors ${
                        isToday
                          ? 'bg-primary-soft/40 border-b-primary/40'
                          : 'bg-surface-alt/70'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-xs font-bold text-ink-secondary">
                          วัน{dayMeta.label}
                        </span>
                        {isToday && (
                          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-extrabold text-ink-inverted">
                            วันนี้
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex items-center justify-center">
                        <span
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full font-mono text-sm font-extrabold transition ${
                            isToday
                              ? 'bg-primary text-ink-inverted shadow-xs'
                              : 'text-ink'
                          }`}
                        >
                          {day.dayNum}
                        </span>
                      </div>

                      <div className="mt-1 text-[10px] font-semibold text-ink-muted">
                        {dayEvents.length > 0 ? `${dayEvents.length} รายการ` : 'ว่าง'}
                      </div>
                    </div>

                    {/* รายการกิจกรรมในวันนั้น (Event Cards List) */}
                    <div className="flex-1 space-y-2 p-2 min-h-[340px]">
                      {dayEvents.length === 0 ? (
                        <div className="flex h-32 flex-col items-center justify-center text-center text-xs text-ink-muted/40 select-none">
                          <span className="text-base opacity-40">☕</span>
                          <span className="mt-1 text-[11px]">ไม่มีกิจกรรม</span>
                        </div>
                      ) : (
                        dayEvents.map((ev) => {
                          const theme = getItemTheme(ev.type)
                          const isDraggable =
                            canManage && (ev.type === 'class' || ev.type === 'appt')
                          const isRescheduled = Boolean(ev.rawClass?.rescheduledInfo)

                          return (
                            <div
                              key={ev.id}
                              draggable={isDraggable}
                              onDragStart={(e) => {
                                if (!isDraggable) return
                                e.dataTransfer.effectAllowed = 'move'
                                e.dataTransfer.setData('text/plain', ev.id)
                                setDraggingEvent(ev)
                              }}
                              onDragEnd={() => {
                                setDraggingEvent(null)
                                setDragOverDateKey(null)
                              }}
                              onClick={() => {
                                handleEventClick(ev)
                              }}
                              title={
                                isDraggable
                                  ? 'คลิกเพื่อดูรายละเอียด หรือลากไปวางในวันอื่นเพื่อย้ายคาบ/นัดหมาย'
                                  : undefined
                              }
                              className={`group cursor-pointer rounded-xl border p-2 text-xs transition-all hover:shadow-xs hover:border-line-strong ${theme.bg} ${theme.border} ${
                                isDraggable ? 'active:cursor-grabbing' : ''
                              }`}
                            >
                              {/* แถวเวลา + แท็กประเภท: ใช้ flex-wrap เพื่อไม่ให้ป้าย "คาบเรียน" ถูกตัดขอบขวา */}
                              <div className="flex flex-wrap items-center justify-between gap-1">
                                <span className="font-mono text-[10px] font-extrabold text-ink whitespace-nowrap">
                                  {ev.timeLabel}
                                </span>
                                <span
                                  className={`inline-flex max-w-full items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-tight ${
                                    isRescheduled
                                      ? 'bg-accent-amber/25 text-accent-amber-fg border border-accent-amber/40'
                                      : theme.chipClass
                                  }`}
                                >
                                  <span>{isRescheduled ? '🔄' : theme.icon}</span>
                                  <span className="truncate">
                                    {isRescheduled ? 'ย้ายคาบ' : theme.badgeText}
                                  </span>
                                </span>
                              </div>

                              {/* รหัสวิชา (ถ้ามี) + ชื่อวิชา/กิจกรรม */}
                              <div className="mt-1.5">
                                {ev.rawClass?.course_code && (
                                  <div className="font-mono text-[10px] font-extrabold uppercase text-accent-pink tracking-wide">
                                    {ev.rawClass.course_code}
                                  </div>
                                )}
                                <p className="text-xs font-bold text-ink leading-snug line-clamp-3 break-words group-hover:text-primary">
                                  {ev.title}
                                </p>
                                {isRescheduled && ev.rawClass?.rescheduledInfo && (
                                  <p className="mt-0.5 text-[10px] font-semibold text-accent-amber-fg">
                                    จากวัน{DAYS_META[ev.rawClass.rescheduledInfo.originalDay].short}{' '}
                                    {ev.rawClass.rescheduledInfo.originalStart}
                                  </p>
                                )}
                              </div>

                              {/* สถานที่ / ห้องเรียน */}
                              {ev.location && (
                                <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-muted">
                                  <span>📍</span>
                                  <span className="truncate">{ev.location}</span>
                                </p>
                              )}

                              {/* ปุ่มลิงก์ Meet / LINE + ปุ่มย้ายคาบแบบ Micro Buttons */}
                              {(ev.rawClass?.online_url ||
                                ev.rawClass?.contact_url ||
                                (canManage && ev.rawClass)) && (
                                <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-line/40 pt-1.5">
                                  {ev.rawClass?.online_url && (
                                    <a
                                      href={ev.rawClass.online_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-0.5 rounded-md border border-accent-pink/30 bg-accent-pink-soft/80 px-1.5 py-0.5 text-[10px] font-bold text-accent-pink shadow-2xs transition hover:bg-accent-pink hover:text-ink-inverted"
                                    >
                                      <span>🔗 Meet</span>
                                      <span>↗</span>
                                    </a>
                                  )}
                                  {ev.rawClass?.contact_url && (
                                    <a
                                      href={ev.rawClass.contact_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-0.5 rounded-md border border-status-success/30 bg-status-success-soft/80 px-1.5 py-0.5 text-[10px] font-bold text-status-success shadow-2xs transition hover:bg-status-success hover:text-ink-inverted"
                                    >
                                      <span>💬 LINE</span>
                                      <span>↗</span>
                                    </a>
                                  )}
                                  {canManage && ev.rawClass && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        const origDate =
                                          ev.rawClass!.rescheduledInfo?.originalDate ??
                                          day.dateKey
                                        setRescheduleModal({
                                          session: ev.rawClass!,
                                          originalDate: origDate,
                                          targetDate: day.dateKey,
                                        })
                                      }}
                                      className="inline-flex items-center gap-0.5 rounded-md border border-accent-amber/40 bg-accent-amber-soft px-1.5 py-0.5 text-[10px] font-bold text-accent-amber-fg transition hover:opacity-90"
                                    >
                                      🔄 ย้ายคาบ
                                    </button>
                                  )}
                                </div>
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
          </div>
        </Card>
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
                const isDropTarget = dragOverDateKey === cell.dateKey

                return (
                  <div
                    key={cell.dateKey}
                    onClick={() => setSelectedDayKey(cell.dateKey)}
                    onDragOver={(e) => {
                      if (!canManage || !draggingEvent) return
                      e.preventDefault()
                      if (dragOverDateKey !== cell.dateKey) {
                        setDragOverDateKey(cell.dateKey)
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverDateKey === cell.dateKey) {
                        setDragOverDateKey(null)
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      void handleDropOnDate(cell.dateKey)
                    }}
                    className={`min-h-[92px] cursor-pointer p-2 transition sm:min-h-[110px] ${
                      isDropTarget
                        ? 'bg-primary-soft/50 ring-2 ring-primary ring-inset'
                        : !cell.isCurrentMonth
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
                        const isDraggable =
                          canManage && (ev.type === 'class' || ev.type === 'appt')
                        return (
                          <div
                            key={ev.id}
                            draggable={isDraggable}
                            onDragStart={(e) => {
                              if (!isDraggable) return
                              e.stopPropagation()
                              e.dataTransfer.effectAllowed = 'move'
                              e.dataTransfer.setData('text/plain', ev.id)
                              setDraggingEvent(ev)
                            }}
                            onDragEnd={() => {
                              setDraggingEvent(null)
                              setDragOverDateKey(null)
                            }}
                            className={`truncate rounded px-1.5 py-0.5 text-[10px] font-semibold ${theme.bg} text-ink ${
                              isDraggable ? 'cursor-grab active:cursor-grabbing' : ''
                            }`}
                          >
                            <span>{ev.rawClass?.rescheduledInfo ? '🔄' : theme.icon}</span>{' '}
                            <span>{ev.title}</span>
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
                        handleEventClick(ev)
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
                              handleEventClick(ev)
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

      {/* ป็อปอัพเพิ่ม/แก้ไข/ลบนัดหมายของกลุ่ม */}
      <AppointmentDialog
        open={apptDialog.open}
        appointment={apptDialog.item}
        defaultDate={selectedDayKey || toDateKey(new Date())}
        courseCodes={courseCodeOptions}
        canManage={appts.canManage}
        canDelete={apptDialog.item ? appts.canDeleteAppointment(apptDialog.item) : false}
        onSave={appts.saveAppointment}
        onDelete={appts.deleteAppointment}
        onClose={() => setApptDialog({ open: false, item: null })}
      />

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

              {/* ปุ่มลิงก์เข้าเรียนและติดต่อของรายวิชา */}
              {selectedUnifiedEvent.rawClass && (selectedUnifiedEvent.rawClass.online_url || selectedUnifiedEvent.rawClass.contact_url) && (
                <div className="mt-2 flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
                  <span className="font-bold text-ink">ลิงก์ที่เกี่ยวข้อง:</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedUnifiedEvent.rawClass.online_url && (
                      <a
                        href={selectedUnifiedEvent.rawClass.online_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-accent-pink px-3 py-2 text-xs font-bold text-ink-inverted shadow-2xs hover:opacity-95"
                      >
                        <span>🔗 Click online classes (Google Meet)</span>
                        <span>↗</span>
                      </a>
                    )}
                    {selectedUnifiedEvent.rawClass.contact_url && (
                      <a
                        href={selectedUnifiedEvent.rawClass.contact_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-status-success px-3 py-2 text-xs font-bold text-ink-inverted shadow-2xs hover:opacity-95"
                      >
                        <span>💬 Contact (LINE กลุ่มอาจารย์)</span>
                        <span>↗</span>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
              {selectedUnifiedEvent.type === 'class' &&
                canManage &&
                selectedUnifiedEvent.rawClass && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const rawClass = selectedUnifiedEvent.rawClass!
                      const origDate =
                        rawClass.rescheduledInfo?.originalDate ??
                        selectedUnifiedEvent.dateKey ??
                        todayDateKey
                      const targetDate = selectedUnifiedEvent.dateKey ?? todayDateKey
                      setSelectedUnifiedEvent(null)
                      setRescheduleModal({
                        session: rawClass,
                        originalDate: origDate,
                        targetDate,
                      })
                    }}
                  >
                    🔄 ย้ายคาบ / งดคลาส
                  </Button>
                )}
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

      {/* ป็อปอัพย้ายคาบเรียน / งดคลาส */}
      <RescheduleDialog
        open={Boolean(rescheduleModal)}
        session={rescheduleModal?.session ?? null}
        originalDate={rescheduleModal?.originalDate ?? todayDateKey}
        initialTargetDate={rescheduleModal?.targetDate}
        canManage={canManage}
        onClose={() => setRescheduleModal(null)}
        onSubmit={handleRescheduleSubmit}
        onRestoreOriginal={async (overrideId) => {
          await reschedules.removeOverride(overrideId)
          setToastMsg('คืนค่าคาบเรียนกลับสู่ตารางเดิมแล้ว')
        }}
      />
    </div>
  )
}

export default CalendarPage
