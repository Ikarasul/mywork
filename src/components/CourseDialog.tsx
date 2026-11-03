import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import { Link } from 'react-router-dom'
import PixelCat from './PixelCat'
import { Badge, Button } from './ui'
import {
  formatDateTimeThai,
  getNextClassSessionInfo,
  getRelativeCountdownThai,
} from '../lib/dateThai'
import {
  COURSE_COLOR_PALETTE,
  buildDefaultCourseLinks,
  resolveLocationText,
  validateHttpsCourseUrl,
  type CourseColorTheme,
} from '../lib/storage'
import type {
  CourseColorId,
  CourseLinkItem,
  CourseLinkType,
  CourseScheduleItem,
  DayOfWeek,
  GroupMemberWithProfile,
  TaskItem,
  TaskStatus,
  TaskType,
} from '../types'

const DAY_NAMES_THAI: Record<DayOfWeek, string> = {
  MON: 'วันจันทร์',
  TUE: 'วันอังคาร',
  WED: 'วันพุธ',
  THU: 'วันพฤหัสบดี',
  FRI: 'วันศุกร์',
  SAT: 'วันเสาร์',
  SUN: 'วันอาทิตย์',
}

const LINK_TYPE_META: Record<
  CourseLinkType,
  { icon: string; label: string; badgeTone: 'pink' | 'success' | 'sky' | 'amber' | 'primary' }
> = {
  meet: { icon: '🎥', label: 'Google Meet / เรียนออนไลน์', badgeTone: 'pink' },
  line: { icon: '💬', label: 'กลุ่ม LINE รายวิชา', badgeTone: 'success' },
  contact: { icon: '📞', label: 'ช่องทางติดต่ออาจารย์/TA', badgeTone: 'sky' },
  lms: { icon: '🎓', label: 'ระบบ LMS / เอกสารประกอบการเรียน', badgeTone: 'primary' },
  other: { icon: '🔗', label: 'ลิงก์อื่นๆ', badgeTone: 'amber' },
}

const TASK_STATUS_META: Record<
  TaskStatus,
  { icon: string; label: string; tone: 'warning' | 'sky' | 'success' }
> = {
  todo: { icon: '⏳', label: 'รอดำเนินการ', tone: 'warning' },
  in_progress: { icon: '⚡', label: 'กำลังทำ', tone: 'sky' },
  done: { icon: '✓', label: 'เสร็จแล้ว', tone: 'success' },
}

export interface CourseDialogProps {
  open: boolean
  courseCode: string | null
  sessions: CourseScheduleItem[]
  semesterLabel: string
  colorTheme: CourseColorTheme
  tasks: TaskItem[]
  members?: GroupMemberWithProfile[]
  sharedAssigneeNamesMap?: Record<string, string[]>
  canEditCourse: boolean
  canCreateTaskOrExam: boolean
  canToggleTask: (task: TaskItem) => boolean
  isReadOnlyViewer: boolean
  /**
   * เมื่อเปิดผ่านลิงก์แชร์สาธารณะ (/share/:token) ข้อมูล links และ notes จะไม่ถูกส่งมาจากฐานข้อมูล
   */
  isSharedAnonView?: boolean
  onClose: () => void
  onSaveCourseDetails?: (params: {
    courseCode: string
    color: string
    notes: string
    locationText: string
    links: CourseLinkItem[]
  }) => Promise<void>
  onToggleTaskStatus?: (task: TaskItem) => Promise<void>
  onQuickCreateTaskOrExam?: (params: {
    title: string
    task_type: TaskType
    course_code: string
    due_date: string | null
    description: string
    exam_room: string
    exam_topics: string
  }) => Promise<void>
  triggerElement?: HTMLElement | null
}

export function CourseDialog({
  open,
  courseCode,
  sessions,
  semesterLabel,
  colorTheme,
  tasks,
  members = [],
  sharedAssigneeNamesMap,
  canEditCourse,
  canCreateTaskOrExam,
  canToggleTask,
  isReadOnlyViewer,
  isSharedAnonView = false,
  onClose,
  onSaveCourseDetails,
  onToggleTaskStatus,
  onQuickCreateTaskOrExam,
  triggerElement,
}: CourseDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  // สำหรับปัดลง (Swipe down) บนมือถือเพื่อปิด Bottom Sheet
  const touchStartYRef = useRef<number | null>(null)
  const [dragOffsetY, setDragOffsetY] = useState(0)

  // โหมดแก้ไขสี ลิงก์ โน้ต และสถานที่เต็มของวิชา
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [editColor, setEditColor] = useState<CourseColorId>(colorTheme.id)
  const [editNotes, setEditNotes] = useState('')
  const [editLocationText, setEditLocationText] = useState('')
  const [editLinks, setEditLinks] = useState<CourseLinkItem[]>([])
  const [newLinkType, setNewLinkType] = useState<CourseLinkType>('meet')
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [linkValidationError, setLinkValidationError] = useState<string | null>(null)
  const [savingDetails, setSavingDetails] = useState(false)
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null)

  // โหมดเพิ่มงานหรือเพิ่มสอบด่วนในป็อปอัพ
  const [quickAddMode, setQuickAddMode] = useState<'homework' | 'exam' | null>(null)
  const [quickTitle, setQuickTitle] = useState('')
  const [quickDueDate, setQuickDueDate] = useState('')
  const [quickDescription, setQuickDescription] = useState('')
  const [quickExamRoom, setQuickExamRoom] = useState('')
  const [quickExamTopics, setQuickExamTopics] = useState('')
  const [savingQuickTask, setSavingQuickTask] = useState(false)
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null)

  const courseSessions = useMemo(() => {
    if (!courseCode) return []
    const clean = courseCode.trim().toUpperCase()
    return sessions.filter((s) => s.course_code.trim().toUpperCase() === clean)
  }, [courseCode, sessions])

  const primarySession = courseSessions[0] ?? null

  const activeLinks = useMemo(() => {
    if (isSharedAnonView || !primarySession) return []
    if (Array.isArray(primarySession.links) && primarySession.links.length > 0) {
      return primarySession.links.filter((l) => validateHttpsCourseUrl(l.url).valid)
    }
    return buildDefaultCourseLinks(primarySession)
  }, [isSharedAnonView, primarySession])

  const nextSessionInfo = useMemo(() => {
    return getNextClassSessionInfo(courseSessions)
  }, [courseSessions])

  const fullLocationText = useMemo(() => {
    if (!primarySession) return '-'
    return resolveLocationText(primarySession.room, primarySession.location_text)
  }, [primarySession])

  // กรองงานค้าง (homework / work) ของวิชานี้ เรียงตามกำหนดส่ง
  const courseHomeworkTasks = useMemo(() => {
    if (!courseCode) return []
    const clean = courseCode.trim().toUpperCase()
    return tasks
      .filter(
        (t) =>
          (t.course_code || '').trim().toUpperCase() === clean &&
          t.task_type !== 'exam',
      )
      .sort((a, b) => {
        if (a.status === 'done' && b.status !== 'done') return 1
        if (a.status !== 'done' && b.status === 'done') return -1
        const da = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER
        const db = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER
        return da - db
      })
  }, [courseCode, tasks])

  const pendingHomeworkTasks = useMemo(
    () => courseHomeworkTasks.filter((t) => t.status !== 'done'),
    [courseHomeworkTasks],
  )

  // กรองรายการสอบ (exam) ของวิชานี้ เรียงตามวันสอบ
  const courseExams = useMemo(() => {
    if (!courseCode) return []
    const clean = courseCode.trim().toUpperCase()
    return tasks
      .filter(
        (t) =>
          (t.course_code || '').trim().toUpperCase() === clean &&
          t.task_type === 'exam',
      )
      .sort((a, b) => {
        const da = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER
        const db = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER
        return da - db
      })
  }, [courseCode, tasks])

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of members) {
      map.set(m.user_id, m.display_name)
    }
    return map
  }, [members])

  // ซิงค์ค่าเริ่มต้นเมื่อเปิดป็อปอัพวิชาใหม่
  useEffect(() => {
    if (open && primarySession) {
      setIsEditingDetails(false)
      setQuickAddMode(null)
      setLinkValidationError(null)
      setFeedbackToast(null)
      setEditColor((primarySession.color as CourseColorId) || colorTheme.id)
      setEditNotes(primarySession.notes ?? '')
      setEditLocationText(
        primarySession.location_text || resolveLocationText(primarySession.room),
      )
      setEditLinks(activeLinks)
      setNewLinkLabel('')
      setNewLinkUrl('')
    }
  }, [open, primarySession?.course_code, colorTheme.id, activeLinks])

  // จัดการโฟกัส (Focus Trap) + ปุ่ม Esc + คืนโฟกัสให้บล็อกวิชาเดิมเมื่อปิด
  useEffect(() => {
    if (!open) return

    previousActiveElementRef.current =
      triggerElement ?? (document.activeElement as HTMLElement | null)

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus()
    }, 30)

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null)

        if (focusables.length === 0) return

        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement as HTMLElement

        if (e.shiftKey) {
          if (active === first || !dialogRef.current.contains(active)) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (active === last || !dialogRef.current.contains(active)) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      const targetToRestore = triggerElement ?? previousActiveElementRef.current
      if (targetToRestore && typeof targetToRestore.focus === 'function') {
        window.setTimeout(() => {
          targetToRestore.focus()
        }, 20)
      }
    }
  }, [open, onClose, triggerElement])

  if (!open || !primarySession) return null

  const activeColorTheme =
    COURSE_COLOR_PALETTE.find(
      (c) => c.id === (isEditingDetails ? editColor : primarySession.color || colorTheme.id),
    ) ?? colorTheme

  function handleTouchStart(e: ReactTouchEvent<HTMLDivElement>) {
    touchStartYRef.current = e.touches[0]?.clientY ?? null
  }

  function handleTouchMove(e: ReactTouchEvent<HTMLDivElement>) {
    if (touchStartYRef.current === null) return
    const currentY = e.touches[0]?.clientY ?? touchStartYRef.current
    const delta = currentY - touchStartYRef.current
    if (delta > 0) {
      setDragOffsetY(Math.min(delta, 220))
    }
  }

  function handleTouchEnd() {
    if (dragOffsetY > 90) {
      setDragOffsetY(0)
      touchStartYRef.current = null
      onClose()
    } else {
      setDragOffsetY(0)
      touchStartYRef.current = null
    }
  }

  async function handleCopyUrl(url: string, label: string) {
    try {
      await navigator.clipboard.writeText(url)
      setFeedbackToast(`คัดลอกลิงก์ "${label}" เรียบร้อยแล้ว`)
      window.setTimeout(() => setFeedbackToast(null), 2600)
    } catch {
      setFeedbackToast('ไม่สามารถคัดลอกลิงก์อัตโนมัติได้ กรุณาคัดลอกจากปุ่มเปิดลิงก์')
    }
  }

  function handleAddLinkToDraft() {
    setLinkValidationError(null)
    const label =
      newLinkLabel.trim() || LINK_TYPE_META[newLinkType]?.label || 'ลิงก์รายวิชา'
    const check = validateHttpsCourseUrl(newLinkUrl)
    if (!check.valid || !check.cleanUrl) {
      setLinkValidationError(
        check.error || 'ลิงก์ไม่ถูกต้อง: ต้องขึ้นต้นด้วย https:// เท่านั้น',
      )
      return
    }

    setEditLinks((prev) => [
      ...prev,
      {
        type: newLinkType,
        label,
        url: check.cleanUrl!,
      },
    ])
    setNewLinkLabel('')
    setNewLinkUrl('')
  }

  function handleUpdateDraftLinkUrl(index: number, nextUrl: string) {
    setLinkValidationError(null)
    setEditLinks((prev) =>
      prev.map((item, i) => (i === index ? { ...item, url: nextUrl } : item)),
    )
  }

  function handleUpdateDraftLinkLabel(index: number, nextLabel: string) {
    setEditLinks((prev) =>
      prev.map((item, i) => (i === index ? { ...item, label: nextLabel } : item)),
    )
  }

  function handleUpdateDraftLinkType(index: number, nextType: CourseLinkType) {
    setEditLinks((prev) =>
      prev.map((item, i) => (i === index ? { ...item, type: nextType } : item)),
    )
  }

  function handleRemoveDraftLink(index: number) {
    setEditLinks((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmitCourseDetails(e: FormEvent) {
    e.preventDefault()
    if (!canEditCourse || !onSaveCourseDetails || !primarySession) return

    setLinkValidationError(null)

    // หากผู้ใช้พิมพ์ค้างไว้ในช่องเพิ่มลิงก์ใหม่ ให้ตรวจสอบและเพิ่มเข้าชุดข้อมูลก่อนบันทึก
    const finalLinks = [...editLinks]
    if (newLinkUrl.trim().length > 0) {
      const checkNew = validateHttpsCourseUrl(newLinkUrl)
      if (!checkNew.valid || !checkNew.cleanUrl) {
        setLinkValidationError(
          checkNew.error || 'ลิงก์ไม่ถูกต้อง: ต้องขึ้นต้นด้วย https:// เท่านั้น',
        )
        return
      }
      finalLinks.push({
        type: newLinkType,
        label: newLinkLabel.trim() || LINK_TYPE_META[newLinkType].label,
        url: checkNew.cleanUrl,
      })
    }

    // ตรวจสอบทุกลิงก์ในรายการว่าต้องเป็น https:// เท่านั้น
    for (const item of finalLinks) {
      const check = validateHttpsCourseUrl(item.url)
      if (!check.valid) {
        setLinkValidationError(
          `ลิงก์ "${item.label || item.url}": ${check.error}`,
        )
        return
      }
    }

    setSavingDetails(true)
    try {
      await onSaveCourseDetails({
        courseCode: primarySession.course_code,
        color: editColor,
        notes: editNotes,
        locationText: editLocationText,
        links: finalLinks,
      })
      setNewLinkLabel('')
      setNewLinkUrl('')
      setIsEditingDetails(false)
      setFeedbackToast('บันทึกรายละเอียดรายวิชาเรียบร้อยแล้ว')
      window.setTimeout(() => setFeedbackToast(null), 2600)
    } catch (err) {
      setLinkValidationError(
        err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลได้',
      )
    } finally {
      setSavingDetails(false)
    }
  }

  async function handleQuickAddSubmit(e: FormEvent) {
    e.preventDefault()
    if (!quickAddMode || !onQuickCreateTaskOrExam || !primarySession) return
    if (!quickTitle.trim()) return

    setSavingQuickTask(true)
    try {
      await onQuickCreateTaskOrExam({
        title: quickTitle.trim(),
        task_type: quickAddMode,
        course_code: primarySession.course_code,
        due_date: quickDueDate ? new Date(quickDueDate).toISOString() : null,
        description: quickDescription.trim(),
        exam_room: quickAddMode === 'exam' ? quickExamRoom.trim() : '',
        exam_topics: quickAddMode === 'exam' ? quickExamTopics.trim() : '',
      })
      setQuickTitle('')
      setQuickDueDate('')
      setQuickDescription('')
      setQuickExamRoom('')
      setQuickExamTopics('')
      setQuickAddMode(null)
      setFeedbackToast(
        quickAddMode === 'exam'
          ? 'เพิ่มตารางสอบของวิชานี้เรียบร้อยแล้ว'
          : 'เพิ่มงานของวิชานี้เรียบร้อยแล้ว',
      )
      window.setTimeout(() => setFeedbackToast(null), 2600)
    } catch (err) {
      setLinkValidationError(
        err instanceof Error ? err.message : 'ไม่สามารถสร้างรายการได้',
      )
    } finally {
      setSavingQuickTask(false)
    }
  }

  async function handleToggleTaskClick(task: TaskItem) {
    if (!onToggleTaskStatus || !canToggleTask(task)) return
    setTogglingTaskId(task.id)
    try {
      await onToggleTaskClickInternal(task)
    } finally {
      setTogglingTaskId(null)
    }
  }

  async function onToggleTaskClickInternal(task: TaskItem) {
    if (!onToggleTaskStatus) return
    await onToggleTaskStatus(task)
  }

  function resolveAssigneeNames(task: TaskItem): string {
    if (sharedAssigneeNamesMap && sharedAssigneeNamesMap[task.id]?.length) {
      return sharedAssigneeNamesMap[task.id].join(', ')
    }
    if (!task.assignee_ids || task.assignee_ids.length === 0) {
      return 'ทุกคนในกลุ่ม'
    }
    const names = task.assignee_ids.map(
      (uid) => memberNameById.get(uid) || 'สมาชิกในกลุ่ม',
    )
    return names.join(', ')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-dialog-title"
        style={
          dragOffsetY > 0
            ? { transform: `translateY(${dragOffsetY}px)`, transition: 'none' }
            : undefined
        }
        className="flex h-[90vh] max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-2xl transition-transform sm:h-auto sm:max-h-[88vh] sm:max-w-[560px] sm:rounded-3xl"
      >
        {/* แถบสีประจำวิชาด้านบนสุด */}
        <div className={`h-2.5 w-full shrink-0 ${activeColorTheme.bar}`} />

        {/* แถบจับสำหรับปัดลงปิดบนมือถือ (Bottom Sheet Handle) */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="flex shrink-0 cursor-grab items-center justify-center py-2 sm:hidden"
          aria-hidden="true"
        >
          <span className="h-1.5 w-12 rounded-full bg-line-strong" />
        </div>

        {/* ส่วนหัวป็อปอัพ (Header): รหัสวิชา ชื่อเต็ม หน่วยกิต ตอนเรียน ภาคการศึกษา */}
        <div className="shrink-0 border-b border-line px-5 pt-2 pb-4 sm:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-lg px-2.5 py-0.5 font-mono text-xs font-extrabold ${activeColorTheme.bg} ${activeColorTheme.text} border ${activeColorTheme.border}`}
                >
                  {primarySession.course_code}
                </span>
                <Badge tone="primary">{primarySession.credits} หน่วยกิต</Badge>
                <Badge tone="neutral">กลุ่มเรียน {primarySession.section}</Badge>
                <Badge tone="amber">{semesterLabel}</Badge>
                {isReadOnlyViewer && (
                  <Badge tone="warning">👁️ โหมดดูอย่างเดียว</Badge>
                )}
              </div>

              <h2
                id="course-dialog-title"
                className="mt-2 text-lg font-extrabold text-ink sm:text-xl leading-snug"
              >
                {primarySession.course_name}
              </h2>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่างรายละเอียดวิชา"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-alt text-sm font-bold text-ink-secondary transition hover:bg-surface-hover hover:text-ink"
            >
              ✕
            </button>
          </div>

          {/* แถบปุ่มลัดด้านบน */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {canCreateTaskOrExam && onQuickCreateTaskOrExam && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setQuickAddMode((prev) =>
                        prev === 'homework' ? null : 'homework',
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-xl border border-primary/40 bg-primary-soft px-2.5 py-1.5 text-xs font-bold text-primary transition hover:bg-primary hover:text-ink-inverted"
                  >
                    <span>+ เพิ่มงานวิชานี้</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setQuickAddMode((prev) => (prev === 'exam' ? null : 'exam'))
                    }
                    className="inline-flex items-center gap-1 rounded-xl border border-accent-pink/40 bg-accent-pink-soft px-2.5 py-1.5 text-xs font-bold text-accent-pink-fg transition hover:bg-accent-pink hover:text-ink-inverted"
                  >
                    <span>🎯 + เพิ่มสอบ</span>
                  </button>
                </>
              )}

              {!isSharedAnonView && (
                <Link
                  to={`/chat?course=${encodeURIComponent(primarySession.course_code)}`}
                  className="inline-flex items-center gap-1 rounded-xl border border-line-strong bg-surface-alt px-2.5 py-1.5 text-xs font-bold text-ink-secondary transition hover:bg-surface-hover hover:text-ink"
                >
                  <span>💬 ห้องแชทวิชา</span>
                </Link>
              )}
            </div>

            {canEditCourse && onSaveCourseDetails && !isSharedAnonView && (
              <button
                type="button"
                onClick={() => {
                  setIsEditingDetails((prev) => !prev)
                  setLinkValidationError(null)
                }}
                className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                  isEditingDetails
                    ? 'border-status-warning bg-status-warning-soft text-status-warning-fg'
                    : 'border-line-strong bg-surface-alt text-ink hover:bg-surface-hover'
                }`}
              >
                <span>{isEditingDetails ? '✕ ปิดโหมดแก้ไข' : '✏️ แก้ไขสี/ลิงก์/โน้ต'}</span>
              </button>
            )}
          </div>
        </div>

        {/* เนื้อหาหลักที่เลื่อนได้ภายในกรอบตัวเอง */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {feedbackToast && (
            <div
              role="status"
              className="rounded-xl border border-status-success bg-status-success-soft px-3.5 py-2 text-xs font-bold text-status-success-fg"
            >
              ✓ {feedbackToast}
            </div>
          )}

          {linkValidationError && (
            <div
              role="alert"
              className="rounded-xl border border-status-danger bg-status-danger-soft px-3.5 py-2.5 text-xs font-bold text-status-danger-fg"
            >
              ⚠️ {linkValidationError}
            </div>
          )}

          {/* ฟอร์มเพิ่มงาน/สอบด่วน (เลือกวิชานี้ให้อัตโนมัติ) */}
          {quickAddMode && canCreateTaskOrExam && (
            <form
              onSubmit={(e) => void handleQuickAddSubmit(e)}
              className="space-y-3 rounded-2xl border-2 border-primary bg-surface-alt p-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-primary">
                  {quickAddMode === 'exam'
                    ? `🎯 เพิ่มตารางสอบวิชา ${primarySession.course_code}`
                    : `📘 เพิ่มงาน/การบ้านวิชา ${primarySession.course_code}`}
                </h3>
                <button
                  type="button"
                  onClick={() => setQuickAddMode(null)}
                  className="text-xs font-bold text-ink-muted hover:text-ink"
                >
                  ยกเลิก
                </button>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-ink-secondary">
                    {quickAddMode === 'exam' ? 'ชื่อการสอบ *' : 'ชื่องาน / การบ้าน *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    placeholder={
                      quickAddMode === 'exam'
                        ? 'เช่น สอบกลางภาค (Midterm)'
                        : 'เช่น สรุปกรณีศึกษาบทที่ 4'
                    }
                    className="mt-1 w-full rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-ink-secondary">
                    {quickAddMode === 'exam' ? 'วันและเวลาสอบ' : 'กำหนดส่ง'}
                  </label>
                  <input
                    type="datetime-local"
                    value={quickDueDate}
                    onChange={(e) => setQuickDueDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink"
                  />
                </div>

                {quickAddMode === 'exam' ? (
                  <div>
                    <label className="block text-[11px] font-bold text-ink-secondary">
                      ห้องสอบ (exam_room)
                    </label>
                    <input
                      type="text"
                      value={quickExamRoom}
                      onChange={(e) => setQuickExamRoom(e.target.value)}
                      placeholder="เช่น 05-0704 หรือ อาคาร 5 ชั้น 7"
                      className="mt-1 w-full rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-bold text-ink-secondary">
                      รหัสวิชา (เลือกอัตโนมัติ)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={primarySession.course_code}
                      className="mt-1 w-full rounded-xl border border-line bg-surface-alt px-3 py-1.5 font-mono text-xs font-bold text-ink-muted"
                    />
                  </div>
                )}

                {quickAddMode === 'exam' ? (
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-ink-secondary">
                      หัวข้อที่ออกสอบ (exam_topics)
                    </label>
                    <input
                      type="text"
                      value={quickExamTopics}
                      onChange={(e) => setQuickExamTopics(e.target.value)}
                      placeholder="เช่น บทที่ 1–5 การบริหารโครงการและ Agile"
                      className="mt-1 w-full rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink"
                    />
                  </div>
                ) : (
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-ink-secondary">
                      รายละเอียดเพิ่มเติม
                    </label>
                    <input
                      type="text"
                      value={quickDescription}
                      onChange={(e) => setQuickDescription(e.target.value)}
                      placeholder="ระบุเงื่อนไขการส่งงานหรือหมายเหตุ"
                      className="mt-1 w-full rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={savingQuickTask}
                >
                  {savingQuickTask ? 'กำลังบันทึก...' : 'บันทึกรายการ'}
                </Button>
              </div>
            </form>
          )}

          {/* โหมดแก้ไขสี ลิงก์ โน้ต และข้อความห้องเต็ม (สำหรับผู้แก้ไขขึ้นไป) */}
          {isEditingDetails && canEditCourse && !isSharedAnonView && (
            <form
              onSubmit={(e) => void handleSubmitCourseDetails(e)}
              className="space-y-4 rounded-2xl border-2 border-primary bg-surface-alt p-4"
            >
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-primary">
                ✏️ แก้ไขสีวิชา ลิงก์ ห้องเรียนเต็ม และโน้ต
              </h3>

              {/* 1) เลือกสีประจำวิชา */}
              <div>
                <label className="block text-xs font-bold text-ink-secondary">
                  สีประจำวิชา (ผ่านเกณฑ์ Contrast ทั้ง 3 ธีม)
                </label>
                <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {COURSE_COLOR_PALETTE.map((swatch) => {
                    const isSelected = editColor === swatch.id
                    return (
                      <button
                        key={swatch.id}
                        type="button"
                        onClick={() => setEditColor(swatch.id)}
                        className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-[10px] font-bold transition ${
                          isSelected
                            ? 'border-2 border-ink bg-surface shadow-xs'
                            : 'border-line bg-surface/60 hover:bg-surface'
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full ${swatch.swatchBg} text-xs text-ink-inverted font-extrabold`}
                        >
                          {isSelected ? '✓' : ''}
                        </span>
                        <span className="truncate text-ink">{swatch.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 2) ข้อความห้องเรียนเต็ม */}
              <div>
                <label className="block text-xs font-bold text-ink-secondary">
                  ข้อความห้องเรียนเต็ม (location_text)
                </label>
                <input
                  type="text"
                  value={editLocationText}
                  onChange={(e) => setEditLocationText(e.target.value)}
                  placeholder="อาคาร 5 - สยามบรมราชกุมารี ชั้น 07 ห้อง 0704"
                  className="mt-1 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-xs text-ink"
                />
              </div>

              {/* 3) จัดการลิงก์ของวิชา (เฉพาะ https://) */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-ink-secondary">
                  ลิงก์ของรายวิชา (รับเฉพาะ https:// เท่านั้น)
                </label>

                {editLinks.length > 0 && (
                  <div className="space-y-2">
                    {editLinks.map((lnk, idx) => (
                      <div
                        key={`edit-link-${idx}`}
                        className="grid gap-1.5 rounded-xl border border-line bg-surface p-2.5 sm:grid-cols-12"
                      >
                        <select
                          value={lnk.type}
                          onChange={(e) =>
                            handleUpdateDraftLinkType(
                              idx,
                              e.target.value as CourseLinkType,
                            )
                          }
                          aria-label="ประเภทลิงก์"
                          className="rounded-lg border border-line-strong bg-surface-alt px-2 py-1.5 text-xs text-ink sm:col-span-3"
                        >
                          <option value="meet">🎥 Meet</option>
                          <option value="line">💬 LINE</option>
                          <option value="contact">📞 ติดต่อ</option>
                          <option value="lms">🎓 LMS</option>
                          <option value="other">🔗 อื่นๆ</option>
                        </select>
                        <input
                          type="text"
                          value={lnk.label}
                          onChange={(e) =>
                            handleUpdateDraftLinkLabel(idx, e.target.value)
                          }
                          placeholder="ชื่อป้ายลิงก์"
                          className="rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs text-ink sm:col-span-4"
                        />
                        <input
                          type="text"
                          value={lnk.url}
                          onChange={(e) =>
                            handleUpdateDraftLinkUrl(idx, e.target.value)
                          }
                          placeholder="https://..."
                          className="rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 font-mono text-xs text-ink sm:col-span-4"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveDraftLink(idx)}
                          className="rounded-lg bg-status-danger-soft px-2 py-1.5 text-xs font-bold text-status-danger hover:opacity-90 sm:col-span-1"
                          title="ลบลิงก์นี้"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* เพิ่มลิงก์ใหม่ */}
                <div className="rounded-xl border border-dashed border-line-strong bg-surface p-2.5">
                  <span className="block text-[11px] font-bold text-ink-muted">
                    + เพิ่มลิงก์ใหม่ (ต้องขึ้นต้นด้วย https://)
                  </span>
                  <div className="mt-1.5 grid gap-1.5 sm:grid-cols-12">
                    <select
                      value={newLinkType}
                      onChange={(e) =>
                        setNewLinkType(e.target.value as CourseLinkType)
                      }
                      aria-label="ประเภทลิงก์ใหม่"
                      className="rounded-lg border border-line-strong bg-surface-alt px-2 py-1.5 text-xs text-ink sm:col-span-3"
                    >
                      <option value="meet">🎥 Meet</option>
                      <option value="line">💬 LINE</option>
                      <option value="contact">📞 ติดต่อ</option>
                      <option value="lms">🎓 LMS</option>
                      <option value="other">🔗 อื่นๆ</option>
                    </select>
                    <input
                      type="text"
                      value={newLinkLabel}
                      onChange={(e) => setNewLinkLabel(e.target.value)}
                      placeholder="ชื่อป้ายกำกับ (เช่น Google Meet)"
                      className="rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs text-ink sm:col-span-4"
                    />
                    <input
                      type="text"
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      placeholder="https://meet.google.com/..."
                      className="rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 font-mono text-xs text-ink sm:col-span-3"
                    />
                    <button
                      type="button"
                      onClick={handleAddLinkToDraft}
                      className="rounded-lg bg-primary-soft px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary hover:text-ink-inverted sm:col-span-2"
                    >
                      + เพิ่มลิงก์
                    </button>
                  </div>
                </div>
              </div>

              {/* 4) โน้ตของวิชา */}
              <div>
                <label className="block text-xs font-bold text-ink-secondary">
                  โน้ตของวิชา (notes)
                </label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="บันทึกข้อตกลงการเรียน เกณฑ์คะแนน หรือสิ่งที่ต้องเตรียมเข้าเรียน..."
                  className="mt-1 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-xs text-ink"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingDetails(false)}
                >
                  ยกเลิก
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={savingDetails}
                >
                  {savingDetails ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </Button>
              </div>
            </form>
          )}

          {/* 1. ข้อมูลคาบเรียน และ คาบถัดไป */}
          <section className="rounded-2xl border border-line bg-surface-alt/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-ink-muted">
                🕒 ข้อมูลคาบเรียนและสถานที่
              </h3>
              {primarySession.online_link ? (
                <Badge tone="mint">🌐 มีเรียนออนไลน์</Badge>
              ) : (
                <Badge tone="neutral">🏫 เรียนในห้องเรียน</Badge>
              )}
            </div>

            <div className="mt-3 space-y-2.5 text-xs">
              {/* วันและเวลาเรียนทั้งหมดของวิชานี้ */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink-muted">วันและเวลา:</span>
                {courseSessions.map((cs, i) => (
                  <span
                    key={`${cs.day}-${cs.start}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 font-bold text-ink"
                  >
                    <span>{DAY_NAMES_THAI[cs.day] ?? cs.day}</span>
                    <span className="font-mono text-primary">
                      {cs.start}–{cs.end} น.
                    </span>
                  </span>
                ))}
              </div>

              {/* คาบถัดไป (วันที่ + นับถอยหลังแบบไทย) */}
              {nextSessionInfo && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary-soft/40 px-3 py-2">
                  <div>
                    <span className="text-[11px] font-bold text-ink-secondary">
                      ⏳ คาบถัดไป:
                    </span>{' '}
                    <span className="font-bold text-ink">
                      {nextSessionInfo.dateLabelThai}
                    </span>
                  </div>
                  <Badge tone={nextSessionInfo.isOngoing ? 'success' : 'primary'}>
                    {nextSessionInfo.countdownThai}
                  </Badge>
                </div>
              )}

              {/* ห้องเรียนเต็ม */}
              <div className="flex items-start gap-2">
                <span className="shrink-0 font-semibold text-ink-muted">ห้องเรียน:</span>
                <div className="font-bold text-ink">
                  <span className="font-mono text-primary">
                    📍 {primarySession.room || '-'}
                  </span>{' '}
                  <span className="font-medium text-ink-secondary">
                    ({fullLocationText})
                  </span>
                </div>
              </div>

              {/* อาจารย์ผู้สอน */}
              <div className="flex items-start gap-2">
                <span className="shrink-0 font-semibold text-ink-muted">ผู้สอน:</span>
                <span className="font-bold text-ink">
                  {primarySession.instructor
                    ? primarySession.instructor.startsWith('อาจารย์')
                      ? primarySession.instructor
                      : `อาจารย์ ${primarySession.instructor}`
                    : 'ไม่ระบุอาจารย์ผู้สอน'}
                </span>
              </div>
            </div>
          </section>

          {/* 2. ลิงก์ของรายวิชา (ซ่อนอัตโนมัติในโหมดลิงก์แชร์สาธารณะซึ่ง DB ไม่ส่งค่ามา) */}
          {!isSharedAnonView && (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-ink-muted">
                  🔗 ลิงก์เข้าเรียนและช่องทางติดต่อ ({activeLinks.length})
                </h3>
              </div>

              {activeLinks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line bg-surface-alt/40 p-3.5 text-center text-xs text-ink-muted">
                  ยังไม่มีลิงก์ที่บันทึกไว้สำหรับวิชานี้
                </div>
              ) : (
                <div className="space-y-2">
                  {activeLinks.map((lnk, idx) => {
                    const meta = LINK_TYPE_META[lnk.type] ?? LINK_TYPE_META.other
                    return (
                      <div
                        key={`${lnk.url}-${idx}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface-alt/60 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Badge tone={meta.badgeTone}>
                              {meta.icon} {lnk.label || meta.label}
                            </Badge>
                          </div>
                          <p className="mt-1 truncate font-mono text-[11px] text-ink-muted">
                            {lnk.url}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <a
                            href={lnk.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-ink-inverted shadow-2xs transition hover:bg-primary-hover"
                          >
                            <span>เปิดลิงก์</span>
                            <span>↗</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => void handleCopyUrl(lnk.url, lnk.label)}
                            className="inline-flex items-center gap-1 rounded-xl border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-bold text-ink-secondary transition hover:bg-surface-hover hover:text-ink"
                          >
                            <span>📋 คัดลอก</span>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {/* 3. งานค้างของวิชานี้ (เรียงตามกำหนดส่ง ป้ายสถานะ ผู้รับผิดชอบ นับถอยหลัง ติ๊กเสร็จได้) */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-ink-muted">
                📝 งานค้างของวิชานี้ ({pendingHomeworkTasks.length} งานค้าง)
              </h3>
              {!isSharedAnonView && (
                <Link
                  to={`/tasks?course=${encodeURIComponent(primarySession.course_code)}`}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  ดูในหน้างานทั้งหมด →
                </Link>
              )}
            </div>

            {pendingHomeworkTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface-alt/40 py-5 text-center">
                <PixelCat mood="happy" size={52} />
                <p className="mt-2 text-sm font-bold text-ink">ไม่มีงานค้าง</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  จัดการงานของวิชา {primarySession.course_code} ครบเรียบร้อยแล้ว!
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingHomeworkTasks.map((task) => {
                  const statusMeta =
                    TASK_STATUS_META[task.status] ?? TASK_STATUS_META.todo
                  const countdown = getRelativeCountdownThai(task.due_date)
                  const userCanToggle = canToggleTask(task) && Boolean(onToggleTaskStatus)

                  return (
                    <div
                      key={task.id}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-surface-alt/70 p-3.5"
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        {userCanToggle && (
                          <input
                            type="checkbox"
                            checked={task.status === 'done'}
                            disabled={togglingTaskId === task.id}
                            onChange={() => void handleToggleTaskClick(task)}
                            aria-label={`ทำเครื่องหมายว่าเสร็จแล้ว: ${task.title}`}
                            className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-line-strong accent-primary"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={statusMeta.tone}>
                              <span>{statusMeta.icon}</span>
                              <span>{statusMeta.label}</span>
                            </Badge>
                            <Badge
                              tone={
                                countdown.isOverdue
                                  ? 'danger'
                                  : countdown.isUrgent
                                    ? 'warning'
                                    : 'neutral'
                              }
                            >
                              ⏰ {countdown.text}
                            </Badge>
                          </div>

                          <p className="mt-1.5 text-xs sm:text-sm font-bold text-ink">
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="mt-0.5 text-xs text-ink-secondary">
                              {task.description}
                            </p>
                          )}

                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                            <span>กำหนดส่ง: {formatDateTimeThai(task.due_date)}</span>
                            <span>ผู้รับผิดชอบ: {resolveAssigneeNames(task)}</span>
                          </div>
                        </div>
                      </div>

                      {userCanToggle && (
                        <Button
                          variant="mint"
                          size="sm"
                          disabled={togglingTaskId === task.id}
                          onClick={() => void handleToggleTaskClick(task)}
                        >
                          ✓ เสร็จ
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* 4. สอบของวิชานี้ (วัน เวลา ห้อง หัวข้อ นับถอยหลัง) */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-ink-muted">
                🎯 ตารางสอบของวิชานี้ ({courseExams.length})
              </h3>
            </div>

            {courseExams.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-line bg-surface-alt/40 p-4 text-xs text-ink-muted">
                <span>ยังไม่มีสอบที่บันทึกไว้</span>
                {canCreateTaskOrExam && onQuickCreateTaskOrExam ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQuickAddMode('exam')}
                  >
                    + เพิ่มสอบ
                  </Button>
                ) : !isSharedAnonView && canCreateTaskOrExam ? (
                  <Link
                    to={`/tasks?course=${encodeURIComponent(primarySession.course_code)}&type=exam`}
                    className="rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-xs font-bold text-primary hover:bg-surface-hover"
                  >
                    + เพิ่มสอบ
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                {courseExams.map((exam) => {
                  const countdown = getRelativeCountdownThai(exam.due_date)
                  return (
                    <div
                      key={exam.id}
                      className="rounded-2xl border border-accent-pink/40 bg-accent-pink-soft/40 p-3.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-ink text-sm">
                          🎯 {exam.title}
                        </span>
                        <Badge
                          tone={
                            countdown.isOverdue
                              ? 'danger'
                              : countdown.isUrgent
                                ? 'warning'
                                : 'pink'
                          }
                        >
                          ⏳ {countdown.text}
                        </Badge>
                      </div>

                      <div className="mt-2 grid gap-1.5 text-ink-secondary sm:grid-cols-2">
                        <div>
                          <span className="font-semibold text-ink-muted">วันและเวลาสอบ:</span>{' '}
                          <strong className="text-ink">
                            {formatDateTimeThai(exam.due_date)}
                          </strong>
                        </div>
                        <div>
                          <span className="font-semibold text-ink-muted">ห้องสอบ:</span>{' '}
                          <strong className="text-ink">
                            {exam.exam_room || primarySession.room || 'ไม่ระบุห้องสอบ'}
                          </strong>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="font-semibold text-ink-muted">หัวข้อที่ออกสอบ:</span>{' '}
                          <span className="text-ink">
                            {exam.exam_topics || exam.description || 'ไม่ระบุหัวข้อสอบ'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* 5. โน้ตของวิชา (ซ่อนอัตโนมัติในลิงก์แชร์สาธารณะซึ่ง DB ไม่ส่งค่ามา) */}
          {!isSharedAnonView && (
            <section className="space-y-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-ink-muted">
                📒 โน้ตของวิชา
              </h3>
              <div className="rounded-2xl border border-line bg-surface-alt/60 p-3.5 text-xs text-ink whitespace-pre-wrap leading-relaxed">
                {primarySession.notes && primarySession.notes.trim().length > 0
                  ? primarySession.notes
                  : 'ยังไม่มีโน้ตบันทึกไว้สำหรับรายวิชานี้'}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

export default CourseDialog
