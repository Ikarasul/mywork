import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PixelCat from '../components/PixelCat'
import { Badge, Button, Card, EmptyState, Skeleton } from '../components/ui'
import { useAuth } from '../lib/auth'
import {
  formatDateTimeThai,
  formatFullDateThai,
  getCurrentMinutesOfDay,
  getTodayDayOfWeek,
} from '../lib/dateThai'
import { useGoogleCalendar } from '../lib/googleCalendar'
import {
  DEFAULT_SEMESTER,
  KNOWN_COURSE_LINKS,
  getSampleScheduleFromCsv,
  mergeScheduleWithoutDuplicates,
  storage,
  timeToMinutes,
} from '../lib/storage'
import type {
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
      return { icon: '✓', label: 'เสร็จแล้ว', tone: 'success' as const }
    case 'in_progress':
      return { icon: '⚡', label: 'กำลังทำ', tone: 'sky' as const }
    case 'todo':
    default:
      return { icon: '⏳', label: 'รอดำเนินการ', tone: 'warning' as const }
  }
}

export function TodayPage() {
  const { user, displayName, activeGroup, currentRole } = useAuth()
  const gcal = useGoogleCalendar()
  const [sessions, setSessions] = useState<CourseScheduleItem[]>([])
  const [routines, setRoutines] = useState<RoutineItem[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)

  const todayCode = useMemo(() => getTodayDayOfWeek(), [])
  const todayThaiDate = useMemo(() => formatFullDateThai(new Date()), [])
  const nowMinutes = useMemo(() => getCurrentMinutesOfDay(), [])

  const isViewer = Boolean(user && currentRole === 'viewer')
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

  const todayClasses = useMemo(() => {
    return sessions
      .filter((s) => s.day === todayCode)
      .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
  }, [sessions, todayCode])

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
              {isViewer && <Badge tone="warning">👁️ โหมดดูอย่างเดียว</Badge>}
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* คอลัมน์ 1: คาบเรียนวันนี้ + กิจวัตรวันนี้ */}
        <Card className="lg:col-span-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
              <div>
                <h2 className="text-base font-bold text-ink">
                  📚 คาบเรียนวันนี้ (วัน{DAY_NAMES[todayCode]})
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
                  description="วันนี้ไม่มีตารางเรียนในระบบ พักผ่อนหรือทบทวนบทเรียนได้ตามสบายเลยเหมียว"
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
                            : 'border-line bg-surface-alt'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-extrabold text-primary">
                            {c.course_code}
                          </span>
                          <Badge tone={isOngoing ? 'mint' : 'neutral'}>
                            {isOngoing ? '● กำลังเรียนอยู่' : `${c.start} – ${c.end}`}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm font-bold text-ink">{c.course_name}</p>
                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                          <span>📍 ห้อง {c.room || '-'}</span>
                          {c.online_link && (
                            <Badge tone="mint">มีเรียนออนไลน์</Badge>
                          )}
                        </div>

                        {(c.online_url || c.contact_url) && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line/40 pt-2">
                            {c.online_url && (
                              <a
                                href={c.online_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg bg-surface px-2.5 py-1 text-xs font-bold text-accent-pink shadow-2xs hover:underline"
                              >
                                <span>🔗 Click online classes ↗</span>
                              </a>
                            )}
                            {c.contact_url && (
                              <a
                                href={c.contact_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg bg-surface px-2.5 py-1 text-xs font-bold text-status-success shadow-2xs hover:underline"
                              >
                                <span>💬 Contact (LINE กลุ่ม) ↗</span>
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {todayRoutines.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="text-xs font-bold text-ink-secondary uppercase">
                  ⏰ ตารางชีวิตวันนี้ ({todayRoutines.length})
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
                <h3 className="text-xs font-bold text-ink-secondary uppercase">
                  📆 Google Calendar วันนี้ ({todayGcalEvents.length})
                </h3>
                <button
                  type="button"
                  disabled={gcal.syncing}
                  onClick={() => void gcal.syncNow()}
                  className="text-[11px] font-bold text-primary hover:underline disabled:opacity-50"
                >
                  {gcal.syncing ? 'กำลังซิงก์...' : '🔄 ซิงก์ตอนนี้'}
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
                <h2 className="text-base font-bold text-ink">📝 งาน/การบ้านใกล้ส่ง</h2>
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
                          <Badge tone={st.tone}>
                            <span>{st.icon}</span>
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
                <h2 className="text-base font-bold text-ink">🎯 สอบใกล้ถึง</h2>
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
                          <Badge tone="pink">🎯 สอบ</Badge>
                          <Badge tone={st.tone}>
                            {st.icon} {st.label}
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
    </div>
  )
}

export default TodayPage
