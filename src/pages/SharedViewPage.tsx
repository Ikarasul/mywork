import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import CourseDialog from '../components/CourseDialog'
import { Badge, Card, EmptyState, Skeleton } from '../components/ui'
import { formatSupabaseErrorThai } from '../lib/auth'
import { formatDateTimeThai } from '../lib/dateThai'
import {
  COURSE_COLOR_PALETTE,
  buildCourseColorMap,
  resolveLocationText,
} from '../lib/storage'
import { supabase } from '../lib/supabase'
import type {
  CourseScheduleItem,
  DayOfWeek,
  SharedViewPayload,
  TaskItem,
  TaskStatus,
  TaskType,
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

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  homework: '📘 การบ้าน',
  work: '🛠️ งานกลุ่ม/โปรเจกต์',
  exam: '🎯 สอบ',
}

const STATUS_META: Record<
  TaskStatus,
  { icon: string; label: string; tone: 'warning' | 'sky' | 'success' }
> = {
  todo: { icon: '⏳', label: 'รอดำเนินการ', tone: 'warning' },
  in_progress: { icon: '⚡', label: 'กำลังทำ', tone: 'sky' },
  done: { icon: '✓', label: 'เสร็จแล้ว', tone: 'success' },
}

export function SharedViewPage() {
  const { token } = useParams<{ token: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [payload, setPayload] = useState<SharedViewPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [triggerElement, setTriggerElement] = useState<HTMLElement | null>(null)

  useEffect(() => {
    async function fetchSharedData() {
      if (!supabase) {
        setErrorMessage('ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล Supabase')
        setLoading(false)
        return
      }
      if (!token) {
        setErrorMessage('ไม่พบรหัสลิงก์แชร์')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage(null)

      try {
        const { data, error } = await supabase.rpc('get_shared_view', {
          token,
        })

        if (error) throw error
        setPayload(data as SharedViewPayload)
      } catch (err) {
        setErrorMessage(formatSupabaseErrorThai(err))
      } finally {
        setLoading(false)
      }
    }

    void fetchSharedData()
  }, [token])

  // แปลงข้อมูลจาก get_shared_view (ซึ่งไม่มี links และ notes) เป็น CourseScheduleItem สำหรับป็อปอัพรายวิชาแบบดูอย่างเดียว
  const sharedSessions = useMemo<CourseScheduleItem[]>(() => {
    if (!payload?.class_sessions) return []
    const courseMetaByCode = new Map<
      string,
      NonNullable<SharedViewPayload['courses']>[number]
    >()
    for (const c of payload.courses ?? []) {
      courseMetaByCode.set(c.course_code.toUpperCase(), c)
    }

    return payload.class_sessions.map((s) => {
      const meta = courseMetaByCode.get(s.course_code.toUpperCase())
      return {
        course_id: s.course_id,
        course_code: s.course_code,
        course_name: s.course_name,
        credits: s.credits,
        section: s.section.split('#')[0] || '001',
        day: s.day,
        start: s.start_time,
        end: s.end_time,
        room: s.room || '',
        instructor: s.instructor || '',
        online_link: Boolean(s.online_link),
        color: meta?.color,
        location_text: resolveLocationText(s.room || '', meta?.location_text),
        // get_shared_view ไม่ส่ง links และ notes คืนมาสำหรับผู้ไม่ล็อกอิน
        links: [],
        notes: '',
      }
    })
  }, [payload])

  const sharedTasks = useMemo<TaskItem[]>(() => {
    return (payload?.tasks ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      task_type: t.task_type,
      course_code: t.course_code,
      due_date: t.due_date,
      status: t.status,
      assignee_ids: [],
      exam_room: t.exam_room,
      exam_topics: t.exam_topics,
      created_at: new Date().toISOString(),
    }))
  }, [payload])

  const sharedAssigneeNamesMap = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    for (const t of payload?.tasks ?? []) {
      if (t.assignee_names && t.assignee_names.length > 0) {
        map[t.id] = t.assignee_names
      }
    }
    return map
  }, [payload])

  const courseColorMap = useMemo(
    () => buildCourseColorMap(sharedSessions),
    [sharedSessions],
  )

  const selectedCourseParam = (searchParams.get('course') ?? '').trim().toUpperCase()
  const selectedCourseSessions = useMemo(() => {
    if (!selectedCourseParam) return []
    return sharedSessions.filter(
      (s) =>
        s.course_code.toUpperCase() === selectedCourseParam ||
        (s.course_id && s.course_id.toUpperCase() === selectedCourseParam),
    )
  }, [sharedSessions, selectedCourseParam])
  const selectedCourseItem = selectedCourseSessions[0] ?? null

  function handleOpenCoursePopup(
    item: CourseScheduleItem,
    e?: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>,
  ) {
    if (e?.currentTarget) {
      setTriggerElement(e.currentTarget)
    }
    const next = new URLSearchParams(searchParams)
    next.set('course', item.course_code)
    setSearchParams(next)
  }

  function handleCloseCoursePopup() {
    if (!searchParams.has('course')) return
    const next = new URLSearchParams(searchParams)
    next.delete('course')
    setSearchParams(next, { replace: true })
  }

  if (loading) {
    return <Skeleton lines={4} label="กำลังโหลดข้อมูลลิงก์แชร์ดูอย่างเดียว..." />
  }

  if (errorMessage || !payload) {
    return (
      <Card>
        <EmptyState
          mood="confused"
          title="ไม่สามารถเปิดลิงก์แชร์นี้ได้"
          description={
            errorMessage ?? 'ลิงก์แชร์ไม่ถูกต้องหรือถูกยกเลิกโดยเจ้าของกลุ่มแล้ว'
          }
        />
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <CourseDialog
        open={Boolean(selectedCourseItem)}
        courseCode={selectedCourseItem ? selectedCourseItem.course_code : null}
        sessions={selectedCourseSessions}
        semesterLabel="ภาคการศึกษาปัจจุบัน"
        colorTheme={
          selectedCourseItem
            ? (courseColorMap.get(selectedCourseItem.course_code.toUpperCase()) ??
              COURSE_COLOR_PALETTE[0])
            : COURSE_COLOR_PALETTE[0]
        }
        tasks={sharedTasks}
        members={[]}
        sharedAssigneeNamesMap={sharedAssigneeNamesMap}
        canEditCourse={false}
        canCreateTaskOrExam={false}
        canToggleTask={() => false}
        isReadOnlyViewer={true}
        isSharedAnonView={true}
        triggerElement={triggerElement}
        onClose={handleCloseCoursePopup}
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">ลิงก์แชร์สาธารณะ</Badge>
              <Badge tone="warning">👁️ โหมดดูอย่างเดียว</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-bold text-ink">
              กลุ่ม: {payload.group?.name}
            </h1>
            {payload.group?.description && (
              <p className="mt-1 text-sm text-ink-secondary">{payload.group.description}</p>
            )}
          </div>
        </div>
      </Card>

      {/* ตารางเรียนของกลุ่ม (อ่านอย่างเดียว คลิกดูป็อปอัพรายวิชาได้โดยไม่มี links/notes) */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-ink">
            ตารางเรียน ({sharedSessions.length} คาบเรียน)
          </h2>
          <span className="text-xs text-ink-muted">
            คลิกที่รายวิชาเพื่อดูรายละเอียดคาบเรียน (ซ่อนลิงก์และโน้ตส่วนตัว)
          </span>
        </div>
        {sharedSessions.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              mood="sleep"
              title="ยังไม่มีข้อมูลตารางเรียนในกลุ่มนี้"
            />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs font-semibold text-ink-muted uppercase">
                  <th className="py-2 pr-3">วัน/เวลา</th>
                  <th className="py-2 pr-3">รหัสวิชา</th>
                  <th className="py-2 pr-3">ชื่อรายวิชา</th>
                  <th className="py-2 pr-3">ตอนเรียน</th>
                  <th className="py-2 pr-3">ห้องเรียน</th>
                  <th className="py-2">ผู้สอน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sharedSessions.map((s, idx) => (
                  <tr
                    key={`${s.course_code}-${s.day}-${s.start}-${idx}`}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleOpenCoursePopup(s, e)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleOpenCoursePopup(s, e)
                      }
                    }}
                    className="cursor-pointer transition hover:bg-surface-hover focus:bg-surface-hover focus:outline-none"
                  >
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <Badge tone="primary">{DAY_NAMES[s.day] ?? s.day}</Badge>{' '}
                      <span className="font-mono text-xs text-ink-secondary">
                        {s.start} - {s.end}
                      </span>
                    </td>
                    <td className="py-3 pr-3 font-mono font-bold text-primary underline-offset-2 hover:underline">
                      {s.course_code}
                    </td>
                    <td className="py-3 pr-3 font-medium text-ink">{s.course_name}</td>
                    <td className="py-3 pr-3 text-xs text-ink-secondary">
                      Sec {s.section}
                    </td>
                    <td className="py-3 pr-3 text-xs text-ink-secondary">
                      <div>{s.room || '-'}</div>
                      {s.location_text && s.location_text !== s.room && (
                        <div className="text-[11px] text-ink-muted">{s.location_text}</div>
                      )}
                    </td>
                    <td className="py-3 text-xs text-ink-secondary">{s.instructor || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* รายการงาน/การบ้าน/สอบ (อ่านอย่างเดียว ไม่แสดงอีเมลสมาชิก) */}
      <Card>
        <h2 className="text-lg font-bold text-ink">
          งาน/การบ้าน/สอบ ({payload.tasks?.length ?? 0} รายการ)
        </h2>
        {!payload.tasks || payload.tasks.length === 0 ? (
          <div className="mt-4">
            <EmptyState mood="happy" title="ยังไม่มีรายการงานในกลุ่มนี้" />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {payload.tasks.map((t) => {
              const st = STATUS_META[t.status] ?? STATUS_META.todo
              return (
                <div
                  key={t.id}
                  className="flex flex-col justify-between gap-2 rounded-2xl border border-line bg-surface-alt p-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="primary">
                        {TASK_TYPE_LABELS[t.task_type] ?? t.task_type}
                      </Badge>
                      {t.course_code && (
                        <span className="rounded border border-line bg-surface px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                          {t.course_code}
                        </span>
                      )}
                      <h3 className="font-bold text-ink">{t.title}</h3>
                    </div>
                    {t.description && (
                      <p className="mt-1 text-xs text-ink-secondary">{t.description}</p>
                    )}
                    {t.task_type === 'exam' && (t.exam_room || t.exam_topics) && (
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-secondary">
                        {t.exam_room && <span>📍 ห้องสอบ: {t.exam_room}</span>}
                        {t.exam_topics && <span>📖 หัวข้อสอบ: {t.exam_topics}</span>}
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-muted">
                      <span>
                        กำหนดส่ง: <strong>{formatDateTimeThai(t.due_date)}</strong>
                      </span>
                      {t.assignee_names && t.assignee_names.length > 0 && (
                        <span>ผู้รับผิดชอบ: {t.assignee_names.join(', ')}</span>
                      )}
                    </div>
                  </div>

                  <Badge tone={st.tone}>
                    <span>{st.icon}</span>
                    <span>{st.label}</span>
                  </Badge>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

export default SharedViewPage
