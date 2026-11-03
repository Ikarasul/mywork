import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppointmentDialog from '../components/AppointmentDialog'
import {
  IconBookOpen,
  IconCalendar,
  IconCheck,
  IconClock,
  IconExternalLink,
  IconEye,
  IconFileText,
  IconHandshake,
  IconHourglass,
  IconMapPin,
  IconMessageCircle,
  IconPauseCircle,
  IconPlus,
  IconRefreshCw,
  IconRotateCcw,
  IconTarget,
  IconVideo,
  IconZap,
} from '../components/icons'
import PixelCat from '../components/PixelCat'
import RescheduleDialog, { type RescheduleSubmitPayload } from '../components/RescheduleDialog'
import { Badge, Button, Card, EmptyState, Skeleton, Toast } from '../components/ui'
import { useAuth } from '../lib/auth'
import { formatApptTimeLabel, toDateKey, useAppointments } from '../lib/appointments'
import {
  formatDateTimeThai,
  formatFullDateThai,
  getCurrentMinutesOfDay,
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
  RoutineItem,
  TaskItem,
  TaskStatus,
} from '../types'

const DAY_NAMES: Record<DayOfWeek, string> = {
  MON: 'จันทร์',
  TUE: 'อังคาร',
  WED: 'พุธ',
  THU: 'พฤหัสบดี',
  FRI: 'ศุกร์',
  SAT: 'เสาร์',
  SUN: 'อาทิตย์',
}

function getStatusMeta(status: TaskStatus) {
  switch (status) {
    case 'done':
      return {
        icon: <IconCheck className="h-3 w-3 shrink-0" />,
        label: 'เสร็จแล้ว',
        tone: 'success' as const,
      }
    case 'in_progress':
      return {
        icon: <IconZap className="h-3 w-3 shrink-0" />,
        label: 'กำลังทำ',
        tone: 'sky' as const,
      }
    case 'todo':
    default:
      return {
        icon: <IconHourglass className="h-3 w-3 shrink-0" />,
        label: 'รอดำเนินการ',
        tone: 'warning' as const,
      }
  }
}

export function TodayPage() {
  const { user, displayName, activeGroup, currentRole } = useAuth()
  const gcal = useGoogleCalendar()
  const appts = useAppointments()
  const reschedules = useClassReschedules(DEFAULT_SEMESTER)
  const todayDateKey = useMemo(() => toDateKey(new Date()), [])
  const todayAppts = appts.byDate.get(todayDateKey) ?? []
  const [sessions, setSessions] = useState<CourseScheduleItem[]>([])
  const [routines, setRoutines] = useState<RoutineItem[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [apptDialog, setApptDialog] = useState<{
    open: boolean
    item: AppointmentItem | null
  }>({ open: false, item: null })
  const [rescheduleTarget, setRescheduleTarget] = useState<CourseScheduleItem | null>(
    null,
  )

  const todayCode = useMemo(() => getTodayDayOfWeek(), [])
  const todayThaiDate = useMemo(() => formatFullDateThai(new Date()), [])
  const nowMinutes = useMemo(() => getCurrentMinutesOfDay(), [])

  const isViewer = Boolean(user && currentRole === 'viewer')
  const canManage =
    !user || currentRole === 'owner' || currentRole === 'admin' || currentRole === 'member'
  const groupKeyPart = activeGroup?.id ?? 'local'
  const scheduleStorageKey = `class_sessions:${groupKeyPart}:${DEFAULT_SEMESTER}`
  const taskStorageKey = activeGroup ? `tasks:${activeGroup.id}` : 'tasks'

  const loadTodayOverview = useCallback(async () => {
    setLoading(true)
    try {
      const [schedData, routineData, taskData] = await Promise.all([
        storage.get<CourseScheduleItem[]>(scheduleStorageKey),
        storage.get<RoutineItem[]>('routine_items'),
        storage.get<TaskItem[]>(taskStorageKey),
      ])

      const resolvedSchedule = (
        schedData && schedData.length > 0 ? schedData : getSampleScheduleFromCsv()
      ).map((s) => ({
        ...s,
        online_url: s.online_url || KNOWN_COURSE_LINKS[s.course_code]?.online_url,
        contact_url: s.contact_url || KNOWN_COURSE_LINKS[s.course_code]?.contact_url,
        online_link: s.online_link || Boolean(s.online_url || KNOWN_COURSE_LINKS[s.course_code]?.online_url),
      }))
      const { merged: dedupedTodaySched } = mergeScheduleWithoutDuplicates([], resolvedSchedule)

      setSessions(dedupedTodaySched)
      setRoutines(routineData ?? [])
      setTasks(taskData ?? [])
    } catch {
      setSessions(getSampleScheduleFromCsv())
    } finally {
      setLoading(false)
    }
  }, [scheduleStorageKey, taskStorageKey, user?.id])

  useEffect(() => {
    void loadTodayOverview()
  }, [loadTodayOverview])

  const { activeSessions: todayClasses, movedAwayOrCanceled } = useMemo(
    () => reschedules.getEffectiveSessionsForDate(sessions, todayDateKey, todayCode),
    [reschedules, sessions, todayDateKey, todayCode],
  )

  const courseCodes = useMemo(
    () => Array.from(new Set(sessions.map((s) => s.course_code))).sort(),
    [sessions],
  )

  const handleRescheduleSubmit = useCallback(
    async (payload: RescheduleSubmitPayload) => {
      if (!rescheduleTarget) return
      const origDay = rescheduleTarget.rescheduledInfo?.originalDay ?? rescheduleTarget.day
      const origStart =
        rescheduleTarget.rescheduledInfo?.originalStart ?? rescheduleTarget.start
      const origEnd =
        rescheduleTarget.rescheduledInfo?.originalEnd ?? rescheduleTarget.end
      const origDate =
        rescheduleTarget.rescheduledInfo?.originalDate ?? todayDateKey

      if (payload.mode === 'permanent') {
        const updated = sessions.map((s) => {
          if (
            s.course_code.toUpperCase() === rescheduleTarget.course_code.toUpperCase() &&
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
        if (rescheduleTarget.rescheduledInfo?.overrideId) {
          await reschedules.removeOverride(rescheduleTarget.rescheduledInfo.overrideId)
        }
        setSessions(updated)
        setToastMsg(
          `เปลี่ยนตารางหลักวิชา ${rescheduleTarget.course_code} เป็นวัน${DAY_THAI_NAMES[payload.newDay]} เวลา ${payload.newStart}–${payload.newEnd} เรียบร้อยแล้ว`,
        )
      } else {
        await reschedules.saveOverride(
          {
            course_code: rescheduleTarget.course_code,
            course_name: rescheduleTarget.course_name,
            section: rescheduleTarget.section,
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
          rescheduleTarget.rescheduledInfo?.overrideId,
        )
        setToastMsg(
          payload.mode === 'cancel'
            ? `บันทึกการงดคลาสวิชา ${rescheduleTarget.course_code} วันนี้เรียบร้อยแล้ว`
            : `ย้ายคาบวิชา ${rescheduleTarget.course_code} ไปวันที่ ${payload.newDate} (${payload.newStart}–${payload.newEnd}) เรียบร้อยแล้ว`,
        )
      }
    },
    [rescheduleTarget, todayDateKey, sessions, scheduleStorageKey, reschedules],
  )

  const todayRoutines = useMemo(() => {
    return routines
      .filter((r) => r.day === 'ALL' || r.day === todayCode)
      .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
  }, [routines, todayCode])

  const todayGcalEvents = useMemo(() => {
    if (!gcal.overlayVisible) return []
    return gcal.events
      .filter((ev) => ev.day === todayCode)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
  }, [gcal.events, gcal.overlayVisible, todayCode])

  const upcomingAssignments = useMemo(() => {
    return tasks
      .filter((t) => t.task_type !== 'exam' && t.status !== 'done')
      .slice(0, 5)
  }, [tasks])

  const upcomingExams = useMemo(() => {
    return tasks.filter((t) => t.task_type === 'exam').slice(0, 5)
  }, [tasks])

  if (loading) {
    return <Skeleton lines={5} label="อีกาตัวน้อยกำลังสรุปตารางวันนี้ให้คุณ..." />
  }

  return (
    <div className="space-y-6">
      {/* แบนเนอร์ต้อนรับหน้าแรก "วันนี้" */}
      <Card padding="lg" className="relative overflow-hidden">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">หน้าแรก • วันนี้</Badge>
              <Badge tone="pink">วัน{DAY_NAMES[todayCode]}</Badge>
              {isViewer && (
                <Badge tone="warning" className="inline-flex items-center gap-1">
                  <IconEye className="h-3 w-3 shrink-0" />
                  <span>โหมดดูอย่างเดียว</span>
                </Badge>
              )}
            </div>
            <h1 className="text-xl font-bold text-ink sm:text-2xl">
              สวัสดี {user ? displayName : 'นักศึกษา'}! สรุปตารางวันนี้ของคุณ
            </h1>
            <p className="text-sm font-medium text-ink-secondary">{todayThaiDate}</p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-center">
            <PixelCat mood="happy" size={56} />
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl border border-line bg-surface-alt px-3 py-2">
                <p className="font-pixel text-base font-bold text-primary">
                  {todayClasses.length}
                </p>
                <p className="text-[11px] font-medium text-ink-muted">คาบวันนี้</p>
              </div>
              <div className="rounded-xl border border-line bg-surface-alt px-3 py-2">
                <p className="font-pixel text-base font-bold text-accent-pink">
                  {upcomingAssignments.length}
                </p>
                <p className="text-[11px] font-medium text-ink-muted">งานค้างส่ง</p>
              </div>
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* คอลัมน์ 1: คาบเรียนวันนี้ + กิจวัตรวันนี้ */}
        <Card className="lg:col-span-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-ink">
                  <IconBookOpen className="h-4 w-4 text-primary shrink-0" />
                  <span>คาบเรียนวันนี้ (วัน{DAY_NAMES[todayCode]})</span>
                </h2>
                <p className="text-xs text-ink-muted">
                  รายวิชาที่มีเรียนในวัน{DAY_NAMES[todayCode]}นี้
                </p>
              </div>
              <Badge tone="sky">{todayClasses.length} คาบ</Badge>
            </div>

            <div className="mt-4">
              {todayClasses.length === 0 ? (
                <EmptyState
                  mood="sleep"
                  title={`วัน${DAY_NAMES[todayCode]}ไม่มีคาบเรียน!`}
                  description="วันนี้ไม่มีตารางเรียนในระบบ พักผ่อนหรือทบทวนบทเรียนได้ตามสบายเลย"
                  action={
                    <Link to="/schedule">
                      <Button variant="outline" size="sm">
                        ดูตารางเรียนทั้งสัปดาห์
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {todayClasses.map((c, idx) => {
                    const startM = timeToMinutes(c.start)
                    const endM = timeToMinutes(c.end)
                    const isOngoing = nowMinutes >= startM && nowMinutes <= endM
                    return (
                      <div
                        key={`${c.course_code}-${idx}`}
                        className={`rounded-xl border p-3.5 transition ${
                          isOngoing
                            ? 'border-primary bg-primary-soft/60'
                            : c.rescheduledInfo
                              ? 'border-accent-amber bg-accent-amber-soft/30'
                              : 'border-line bg-surface-alt'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-extrabold text-primary">
                              {c.course_code}
                            </span>
                            {c.rescheduledInfo && (
                              <Badge tone="amber" className="inline-flex items-center gap-1">
                                <IconRefreshCw className="h-3 w-3 shrink-0" />
                                <span>ย้ายคาบ</span>
                              </Badge>
                            )}
                          </div>
                          <Badge tone={isOngoing ? 'mint' : 'neutral'}>
                            {isOngoing ? '● กำลังเรียนอยู่' : `${c.start} – ${c.end}`}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm font-bold text-ink">{c.course_name}</p>
                        {c.rescheduledInfo && (
                          <p className="mt-0.5 text-[11px] font-semibold text-accent-amber-fg">
                            ย้ายมาจากวัน{DAY_NAMES[c.rescheduledInfo.originalDay]} ({c.rescheduledInfo.originalStart}–{c.rescheduledInfo.originalEnd})
                            {c.rescheduledInfo.reason ? ` • ${c.rescheduledInfo.reason}` : ''}
                          </p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                          <span className="inline-flex items-center gap-1">
                            <IconMapPin className="h-3 w-3 shrink-0" />
                            <span>ห้อง {c.room || '-'}</span>
                          </span>
                          {c.online_link && (
                            <Badge tone="mint">มีเรียนออนไลน์</Badge>
                          )}
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-line/40 pt-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {c.online_url && (
                              <a
                                href={c.online_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1 text-xs font-bold text-accent-pink shadow-2xs hover:underline"
                              >
                                <IconVideo className="h-3.5 w-3.5 shrink-0" />
                                <span>Meet</span>
                                <IconExternalLink className="h-2.5 w-2.5 opacity-70" />
                              </a>
                            )}
                            {c.contact_url && (
                              <a
                                href={c.contact_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1 text-xs font-bold text-status-success shadow-2xs hover:underline"
                              >
                                <IconMessageCircle className="h-3.5 w-3.5 shrink-0" />
                                <span>LINE</span>
                                <IconExternalLink className="h-2.5 w-2.5 opacity-70" />
                              </a>
                            )}
                          </div>

                          {canManage && (
                            <div className="flex items-center gap-1.5">
                              {c.rescheduledInfo && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void reschedules.removeOverride(
                                      c.rescheduledInfo!.overrideId,
                                    )
                                    setToastMsg(`คืนค่าตารางเดิมของวิชา ${c.course_code} แล้ว`)
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-bold text-ink-secondary hover:bg-surface-hover"
                                >
                                  <IconRotateCcw className="h-3 w-3 shrink-0" />
                                  <span>คืนค่าเดิม</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setRescheduleTarget(c)}
                                className="inline-flex items-center gap-1 rounded-lg border border-accent-amber/50 bg-accent-amber-soft px-2.5 py-1 text-[11px] font-bold text-accent-amber-fg transition hover:opacity-90"
                              >
                                <IconRefreshCw className="h-3 w-3 shrink-0" />
                                <span>ย้ายคาบ/งดคลาส</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* แสดงรายการคาบเรียนของวันนี้ที่ถูกย้ายไปวันอื่นหรืองดคลาส */}
              {movedAwayOrCanceled.length > 0 && (
                <div className="mt-3 space-y-2 rounded-xl border border-dashed border-accent-amber bg-accent-amber-soft/25 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-accent-amber-fg">
                    <IconRefreshCw className="h-3.5 w-3.5 shrink-0" />
                    <span>คาบเรียนปกติวันนี้ที่ถูกย้ายหรืองดคลาส ({movedAwayOrCanceled.length})</span>
                  </p>
                  {movedAwayOrCanceled.map((ov) => (
                    <div
                      key={ov.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-2.5 py-2 text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-primary">
                          {ov.course_code}
                        </span>{' '}
                        <span className="font-semibold text-ink">{ov.course_name}</span>
                        <div className="flex items-center gap-1 text-[11px] text-ink-muted">
                          {ov.canceled ? (
                            <span className="inline-flex items-center gap-1 text-accent-pink">
                              <IconPauseCircle className="h-3 w-3 shrink-0" />
                              <span>งดคลาสวันนี้ ({ov.original_start}–{ov.original_end})</span>
                            </span>
                          ) : (
                            <span>
                              ย้ายไปวัน{DAY_NAMES[ov.new_day]} ({ov.new_date}) เวลา {ov.new_start}–{ov.new_end}
                            </span>
                          )}
                          {ov.reason ? ` • ${ov.reason}` : ''}
                        </div>
                      </div>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => {
                            void reschedules.removeOverride(ov.id)
                            setToastMsg(`คืนค่าตารางเดิมของวิชา ${ov.course_code} แล้ว`)
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-alt px-2 py-1 text-[11px] font-bold text-ink hover:bg-surface-hover"
                        >
                          <IconRotateCcw className="h-3 w-3 shrink-0" />
                          <span>คืนค่าเดิม</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {todayRoutines.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-ink-secondary uppercase">
                  <IconClock className="h-3.5 w-3.5 text-accent-mint-fg shrink-0" />
                  <span>ตารางชีวิตวันนี้ ({todayRoutines.length})</span>
                </h3>
                <div className="mt-2 space-y-2">
                  {todayRoutines.slice(0, 3).map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg bg-surface-alt px-3 py-2 text-xs"
                    >
                      <span className="font-semibold text-ink">{r.title}</span>
                      <span className="font-mono text-ink-muted">
                        {r.start_time}–{r.end_time}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 border-t border-line pt-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-ink-secondary uppercase">
                  <IconHandshake className="h-3.5 w-3.5 text-accent-amber-fg shrink-0" />
                  <span>นัดหมายวันนี้ ({todayAppts.length})</span>
                </h3>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setApptDialog({ open: true, item: null })}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary transition hover:bg-primary hover:text-ink-inverted"
                  >
                    <IconPlus className="h-3 w-3 shrink-0" />
                    <span>เพิ่มนัดวันนี้</span>
                  </button>
                )}
              </div>
              {todayAppts.length === 0 ? (
                <p className="mt-1.5 text-xs text-ink-muted">ไม่มีนัดหมายในวันนี้</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {todayAppts.map((a) => (
                    <button
                      key={`today-appt-${a.id}`}
                      type="button"
                      onClick={() => setApptDialog({ open: true, item: a })}
                      className="block w-full rounded-lg border-l-4 border-accent-amber bg-accent-amber-soft/60 px-3 py-2 text-left text-xs transition hover:opacity-90"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-ink">{a.title}</span>
                        <span className="shrink-0 font-mono text-[11px] text-ink-secondary">
                          {formatApptTimeLabel(a)}
                        </span>
                      </div>
                      {a.location && (
                        <p className="mt-0.5 flex items-center gap-1 text-ink-secondary">
                          <IconMapPin className="h-3 w-3 shrink-0" />
                          <span>{a.location}</span>
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-ink-secondary uppercase">
                  <IconCalendar className="h-3.5 w-3.5 text-accent-sky-fg shrink-0" />
                  <span>Google Calendar วันนี้ ({todayGcalEvents.length})</span>
                </h3>
                <button
                  type="button"
                  disabled={gcal.syncing}
                  onClick={() => void gcal.syncNow()}
                  className="text-[11px] font-bold text-primary hover:underline disabled:opacity-50"
                >
                  {gcal.syncing ? (
                    'กำลังซิงก์...'
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <IconRefreshCw className="h-3 w-3 shrink-0" />
                      <span>ซิงก์ตอนนี้</span>
                    </span>
                  )}
                </button>
              </div>
              {todayGcalEvents.length === 0 ? (
                <p className="mt-1.5 text-xs text-ink-muted">
                  {gcal.lastSyncedAt
                    ? 'ไม่มีอีเวนต์ Google Calendar ในวันนี้'
                    : 'ยังไม่ได้ซิงก์ปฏิทิน Google (กดซิงก์ตอนนี้เพื่อดึงข้อมูล)'}
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {todayGcalEvents.slice(0, 4).map((ev, gIdx) => (
                    <div
                      key={`today-gcal-${ev.id}-${gIdx}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-accent-sky bg-accent-sky-soft/60 px-3 py-2 text-xs"
                    >
                      <div>
                        <span className="font-bold text-ink">{ev.summary}</span>
                        <span className="ml-2 font-mono text-[11px] text-ink-secondary">
                          {ev.isAllDay ? '(ทั้งวัน)' : `${ev.startTime}–${ev.endTime}`}
                        </span>
                      </div>
                      <a
                        href={ev.htmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-[11px] font-bold text-primary underline"
                      >
                        แก้ไขใน Google ↗
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-line flex justify-end">
            <Link to="/schedule" className="text-xs font-semibold text-primary hover:underline">
              เปิดหน้าตารางเรียนเต็ม →
            </Link>
          </div>
        </Card>

        {/* คอลัมน์ 2: งานและการบ้านใกล้ส่ง */}
        <Card className="lg:col-span-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-ink">
                  <IconFileText className="h-4 w-4 text-accent-amber-fg shrink-0" />
                  <span>งาน/การบ้านใกล้ส่ง</span>
                </h2>
                <p className="text-xs text-ink-muted">รายการงานที่ยังรอดำเนินการหรือกำลังทำ</p>
              </div>
              <Badge tone="amber">{upcomingAssignments.length} งาน</Badge>
            </div>

            <div className="mt-4">
              {upcomingAssignments.length === 0 ? (
                <EmptyState
                  mood="happy"
                  title="ไม่มีงานค้างส่งในตอนนี้"
                  description="เคลียร์งานครบหมดแล้ว หรือสามารถเพิ่มงาน/การบ้านใหม่ได้ในหน้างาน"
                  action={
                    <Link to="/tasks">
                      <Button variant="secondary" size="sm">
                        ไปหน้างาน/การบ้าน
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {upcomingAssignments.map((t) => {
                    const st = getStatusMeta(t.status)
                    return (
                      <div
                        key={t.id}
                        className="rounded-xl border border-line bg-surface-alt p-3.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <Badge tone={st.tone} className="inline-flex items-center gap-1">
                            {st.icon}
                            <span>{st.label}</span>
                          </Badge>
                          {t.course_code && (
                            <span className="font-mono text-xs font-bold text-primary">
                              {t.course_code}
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-sm font-bold text-ink">{t.title}</p>
                        <p className="mt-1 text-xs text-ink-muted">
                          กำหนดส่ง: {formatDateTimeThai(t.due_date)}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-line flex justify-end">
            <Link to="/tasks" className="text-xs font-semibold text-primary hover:underline">
              จัดการงานทั้งหมด →
            </Link>
          </div>
        </Card>

        {/* คอลัมน์ 3: ตารางสอบใกล้ถึง */}
        <Card className="lg:col-span-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-ink">
                  <IconTarget className="h-4 w-4 text-accent-pink shrink-0" />
                  <span>สอบใกล้ถึง</span>
                </h2>
                <p className="text-xs text-ink-muted">รายการนัดสอบและวันสอบสำคัญ</p>
              </div>
              <Badge tone="pink">{upcomingExams.length} รายการ</Badge>
            </div>

            <div className="mt-4">
              {upcomingExams.length === 0 ? (
                <EmptyState
                  mood="idle"
                  title="ยังไม่มีตารางสอบเร็วๆ นี้"
                  description="รายวิชาปี 4 เทอม 1 (2569/1) ส่วนใหญ่เป็นรูปแบบโครงงาน/ไม่จัดสอบปลายภาค"
                  action={
                    <Link to="/tasks">
                      <Button variant="outline" size="sm">
                        เพิ่มนัดสอบใหม่
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {upcomingExams.map((ex) => {
                    const st = getStatusMeta(ex.status)
                    return (
                      <div
                        key={ex.id}
                        className="rounded-xl border border-accent-pink bg-accent-pink-soft/35 p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge tone="pink" className="inline-flex items-center gap-1">
                            <IconTarget className="h-3 w-3 shrink-0" />
                            <span>สอบ</span>
                          </Badge>
                          <Badge tone={st.tone} className="inline-flex items-center gap-1">
                            {st.icon}
                            <span>{st.label}</span>
                          </Badge>
                        </div>
                        <p className="mt-1.5 text-sm font-bold text-ink">{ex.title}</p>
                        <p className="mt-1 text-xs font-medium text-ink-secondary">
                          วันสอบ: {formatDateTimeThai(ex.due_date)}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-line flex justify-end">
            <Link to="/tasks" className="text-xs font-semibold text-primary hover:underline">
              ดูตารางสอบทั้งหมด →
            </Link>
          </div>
        </Card>
      </div>

      {/* ป็อปอัพเพิ่ม/แก้ไขนัดหมายบนหน้าวันนี้โดยตรง */}
      <AppointmentDialog
        open={apptDialog.open}
        appointment={apptDialog.item}
        defaultDate={todayDateKey}
        courseCodes={courseCodes}
        canManage={appts.canManage}
        canDelete={
          apptDialog.item ? appts.canDeleteAppointment(apptDialog.item) : appts.canManage
        }
        onSave={appts.saveAppointment}
        onDelete={appts.deleteAppointment}
        onClose={() => setApptDialog({ open: false, item: null })}
      />

      {/* ป็อปอัพย้ายคาบเรียน/งดคลาส */}
      <RescheduleDialog
        open={Boolean(rescheduleTarget)}
        session={rescheduleTarget}
        originalDate={
          rescheduleTarget?.rescheduledInfo?.originalDate ?? todayDateKey
        }
        canManage={canManage}
        onClose={() => setRescheduleTarget(null)}
        onSubmit={handleRescheduleSubmit}
        onRestoreOriginal={async (overrideId) => {
          await reschedules.removeOverride(overrideId)
          setToastMsg('คืนค่าคาบเรียนเดิมเรียบร้อยแล้ว')
        }}
      />
    </div>
  )
}

export default TodayPage
