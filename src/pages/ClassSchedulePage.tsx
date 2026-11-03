import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'
import GoogleCalendarSyncBar, {
  GoogleCalendarEventModal,
} from '../components/GoogleCalendarSyncBar'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
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
import {
  DEFAULT_SEMESTER,
  formatStorageErrorThai,
  getSampleScheduleFromCsv,
  makeSessionDedupeKey,
  mergeScheduleWithoutDuplicates,
  parseScheduleCsvText,
  storage,
  timeToMinutes,
} from '../lib/storage'
import type { CourseScheduleItem, DayOfWeek, GoogleCalendarEventItem } from '../types'

interface SemesterOption {
  id: string
  code: string
  label: string
  period: string
}

const SEMESTER_OPTIONS: SemesterOption[] = [
  {
    id: DEFAULT_SEMESTER,
    code: '2569/1',
    label: 'ปี 4 เทอม 1 (2569/1)',
    period: '24 ส.ค. 2569 – 14 ธ.ค. 2569',
  },
  {
    id: '2-2569',
    code: '2569/2',
    label: 'ปี 4 เทอม 2 (2569/2)',
    period: '11 ม.ค. 2570 – 9 พ.ค. 2570',
  },
  {
    id: 's-2569',
    code: '2569/S',
    label: 'ภาคฤดูร้อน (2569/S)',
    period: '1 มิ.ย. 2570 – 31 ก.ค. 2570',
  },
]

const DAYS_ORDER: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const TABLET_WEEKDAYS: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI']

const DAY_INFO: Record<
  DayOfWeek,
  { short: string; full: string; singleCode: string; badgeClass: string }
> = {
  MON: {
    short: 'จ.',
    full: 'จันทร์',
    singleCode: 'M',
    badgeClass: 'bg-accent-amber text-ink-inverted',
  },
  TUE: {
    short: 'อ.',
    full: 'อังคาร',
    singleCode: 'T',
    badgeClass: 'bg-accent-pink text-ink-inverted',
  },
  WED: {
    short: 'พ.',
    full: 'พุธ',
    singleCode: 'W',
    badgeClass: 'bg-accent-mint text-ink-inverted',
  },
  THU: {
    short: 'พฤ.',
    full: 'พฤหัสบดี',
    singleCode: 'H',
    badgeClass: 'bg-status-warning text-ink-inverted',
  },
  FRI: {
    short: 'ศ.',
    full: 'ศุกร์',
    singleCode: 'F',
    badgeClass: 'bg-accent-sky text-ink-inverted',
  },
  SAT: {
    short: 'ส.',
    full: 'เสาร์',
    singleCode: 'S',
    badgeClass: 'bg-primary text-ink-inverted',
  },
  SUN: {
    short: 'อา.',
    full: 'อาทิตย์',
    singleCode: 'U',
    badgeClass: 'bg-status-danger text-ink-inverted',
  },
}

function getBuildingRoomDetail(room: string): string | null {
  const match = /^05-(\d{2})(\d{2})$/.exec(room.trim())
  if (match) {
    const floor = match[1]
    const roomNo = `${match[1]}${match[2]}`
    return `อาคาร 5 - สยามบรมราชกุมารี ชั้น ${floor} ห้อง ${roomNo}`
  }
  return null
}

const HOURS_AXIS = [
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
]

const GRID_START_MIN = 7 * 60 // 07:00 = 420
const GRID_END_MIN = 20 * 60 // 20:00 = 1200
const TOTAL_HALF_HOUR_SLOTS = 26 // 13 ชั่วโมง * 2 (ช่องละ 30 นาที)

const COURSE_TOKEN_PALETTE = [
  {
    bg: 'bg-accent-mint-soft hover:opacity-95',
    border: 'border-accent-mint',
    bar: 'bg-accent-mint',
    text: 'text-accent-mint-fg',
    sub: 'text-ink-secondary',
  },
  {
    bg: 'bg-primary-soft hover:opacity-95',
    border: 'border-primary',
    bar: 'bg-primary',
    text: 'text-primary-fg',
    sub: 'text-ink-secondary',
  },
  {
    bg: 'bg-accent-amber-soft hover:opacity-95',
    border: 'border-accent-amber',
    bar: 'bg-accent-amber',
    text: 'text-accent-amber-fg',
    sub: 'text-ink-secondary',
  },
  {
    bg: 'bg-accent-sky-soft hover:opacity-95',
    border: 'border-accent-sky',
    bar: 'bg-accent-sky',
    text: 'text-accent-sky-fg',
    sub: 'text-ink-secondary',
  },
  {
    bg: 'bg-accent-pink-soft hover:opacity-95',
    border: 'border-accent-pink',
    bar: 'bg-accent-pink',
    text: 'text-accent-pink-fg',
    sub: 'text-ink-secondary',
  },
  {
    bg: 'bg-status-success-soft hover:opacity-95',
    border: 'border-status-success',
    bar: 'bg-status-success',
    text: 'text-status-success-fg',
    sub: 'text-ink-secondary',
  },
]

const CLEARED_SEMESTER_KEY_PREFIX = 'lsp:cleared_semester:'

export function ClassSchedulePage() {
  const { user, activeGroup, currentRole, refreshGroupContext } = useAuth()
  const gcal = useGoogleCalendar()
  const [selectedGcalEvent, setSelectedGcalEvent] = useState<GoogleCalendarEventItem | null>(
    null,
  )

  const todayCode = useMemo(() => getTodayDayOfWeek(), [])
  const [selectedMobileDay, setSelectedMobileDay] = useState<DayOfWeek>(todayCode)
  const [nowMinutes, setNowMinutes] = useState<number>(() => getCurrentMinutesOfDay())

  // อัปเดตเส้นเวลาปัจจุบันทุก 1 นาที
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMinutes(getCurrentMinutesOfDay())
    }, 60000)
    return () => window.clearInterval(timer)
  }, [])

  // ภาคการศึกษาที่เลือก (ค่าเริ่มต้น: ปี 4 เทอม 1 - 2569/1, 24 ส.ค. 2569 - 14 ธ.ค. 2569)
  const [semester, setSemester] = useState<string>(DEFAULT_SEMESTER)
  // มุมมองที่แสดง: 'weekly' (มุมมองที่ 1: ตารางรายสัปดาห์ CSS Grid) หรือ 'list' (มุมมองที่ 2: รายการวิชา)
  const [activeTab, setActiveTab] = useState<'weekly' | 'list'>('weekly')

  const [sessions, setSessions] = useState<CourseScheduleItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  // ตัวอย่างก่อนนำเข้า CSV (Preview Modal)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [csvPreviewItems, setCsvPreviewItems] = useState<CourseScheduleItem[] | null>(null)
  const [csvFileName, setCsvFileName] = useState<string>('')

  // กล่องยืนยันการล้างตาราง
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false)

  // ฟอร์มเพิ่ม/แก้ไขรายวิชา
  const [showEditForm, setShowEditForm] = useState<boolean>(false)
  const [courseCode, setCourseCode] = useState('')
  const [courseName, setCourseName] = useState('')
  const [credits, setCredits] = useState('3')
  const [section, setSection] = useState('001')
  const [day, setDay] = useState<DayOfWeek>('TUE')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('11:30')
  const [room, setRoom] = useState('')
  const [instructor, setInstructor] = useState('')
  const [onlineLink, setOnlineLink] = useState(false)

  const isLoggedInViewer = Boolean(user && currentRole === 'viewer')
  const canEdit =
    !user ||
    currentRole === 'owner' ||
    currentRole === 'admin' ||
    currentRole === 'member'
  const canClearSchedule =
    !user || currentRole === 'owner' || currentRole === 'admin'

  const groupKeyPart = activeGroup?.id ?? 'local'
  const storageKey = `class_sessions:${groupKeyPart}:${semester}`

  const currentSemesterInfo =
    SEMESTER_OPTIONS.find((s) => s.id === semester) ?? SEMESTER_OPTIONS[0]

  const loadSchedule = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const data = await storage.get<CourseScheduleItem[]>(storageKey)
      const list = data ?? []

      const wasCleared =
        window.localStorage.getItem(`${CLEARED_SEMESTER_KEY_PREFIX}${storageKey}`) ===
        'true'

      if (list.length === 0 && semester === DEFAULT_SEMESTER && !wasCleared && canEdit) {
        const sample = getSampleScheduleFromCsv()
        await storage.set(storageKey, sample)
        setSessions(sample)
      } else {
        setSessions(list)
      }
    } catch (err) {
      setErrorMessage(formatStorageErrorThai(err))
    } finally {
      setLoading(false)
    }
  }, [storageKey, semester, canEdit, user?.id])

  useEffect(() => {
    void loadSchedule()
  }, [loadSchedule])

  const courseColorMap = useMemo(() => {
    const map = new Map<string, (typeof COURSE_TOKEN_PALETTE)[number]>()
    const uniqueCodes = Array.from(
      new Set(sessions.map((s) => s.course_code.toUpperCase())),
    )
    uniqueCodes.forEach((code, idx) => {
      map.set(code, COURSE_TOKEN_PALETTE[idx % COURSE_TOKEN_PALETTE.length])
    })
    return map
  }, [sessions])

  const summaryStats = useMemo(() => {
    const uniqueCourses = new Map<string, number>()
    for (const s of sessions) {
      const code = s.course_code.toUpperCase()
      if (!uniqueCourses.has(code)) {
        uniqueCourses.set(code, Number(s.credits) || 0)
      }
    }
    let totalCredits = 0
    for (const cr of uniqueCourses.values()) {
      totalCredits += cr
    }
    return {
      courseCount: uniqueCourses.size,
      sessionCount: sessions.length,
      totalCredits,
    }
  }, [sessions])

  const existingKeysSet = useMemo(() => {
    return new Set(sessions.map((s) => makeSessionDedupeKey(s)))
  }, [sessions])

  // ตำแหน่งเส้นเวลาปัจจุบัน (%) บนแกน 07:00 - 20:00
  const currentTimeLinePercent = useMemo(() => {
    if (nowMinutes < GRID_START_MIN || nowMinutes > GRID_END_MIN) return null
    return ((nowMinutes - GRID_START_MIN) / (GRID_END_MIN - GRID_START_MIN)) * 100
  }, [nowMinutes])

  async function handleLoadSampleSchedule() {
    if (!canEdit) return
    setSaving(true)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      window.localStorage.removeItem(`${CLEARED_SEMESTER_KEY_PREFIX}${storageKey}`)
      const sampleItems = getSampleScheduleFromCsv()
      const { merged, addedCount, updatedCount } = mergeScheduleWithoutDuplicates(
        sessions,
        sampleItems,
      )
      await storage.set(storageKey, merged)
      if (user && !activeGroup) {
        await refreshGroupContext()
      }
      await loadSchedule()
      setStatusMessage(
        `โหลดตารางเรียน ปี 4 เทอม 1 (2569/1) สำเร็จ! (เพิ่มใหม่ ${addedCount} คาบ, อัปเดตข้อมูลเดิม ${updatedCount} คาบ — รวม ${merged.length} วิชา 18 หน่วยกิต)`,
      )
    } catch (err) {
      setErrorMessage(formatStorageErrorThai(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !canEdit) return

    setErrorMessage(null)
    setStatusMessage(null)
    setCsvPreviewItems(null)

    try {
      const text = await file.text()
      const { items, errors } = parseScheduleCsvText(text)

      if (errors.length > 0) {
        setErrorMessage(`ไม่สามารถนำเข้าไฟล์ "${file.name}" ได้:\n• ${errors.join('\n• ')}`)
        return
      }

      if (items.length === 0) {
        setErrorMessage(`ไม่พบรายการวิชาในไฟล์ "${file.name}"`)
        return
      }

      setCsvFileName(file.name)
      setCsvPreviewItems(items)
    } catch {
      setErrorMessage('ไม่สามารถอ่านไฟล์ CSV ที่เลือกได้ กรุณาตรวจสอบการเข้ารหัสไฟล์ (UTF-8)')
    }
  }

  async function handleConfirmCsvImport() {
    if (!csvPreviewItems || !canEdit) return
    setSaving(true)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      window.localStorage.removeItem(`${CLEARED_SEMESTER_KEY_PREFIX}${storageKey}`)
      const { merged, addedCount, updatedCount } = mergeScheduleWithoutDuplicates(
        sessions,
        csvPreviewItems,
      )
      await storage.set(storageKey, merged)
      if (user && !activeGroup) {
        await refreshGroupContext()
      }
      setCsvPreviewItems(null)
      await loadSchedule()
      setStatusMessage(
        `นำเข้าไฟล์ "${csvFileName}" สำเร็จ! (เพิ่มวิชาใหม่ ${addedCount} รายการ, อัปเดตรายการเดิม ${updatedCount} รายการโดยไม่เกิดแถวซ้ำ)`,
      )
    } catch (err) {
      setErrorMessage(formatStorageErrorThai(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveManualCourse(e: FormEvent) {
    e.preventDefault()
    if (!canEdit) return

    setErrorMessage(null)
    setStatusMessage(null)

    const csvLine = [
      'course_code,course_name,credits,section,day,start,end,room,instructor,online_link',
      `${courseCode.trim()},${courseName.trim()},${credits.trim()},${section.trim() || '001'},${day},${start},${end},${room.trim()},${instructor.trim()},${onlineLink}`,
    ].join('\n')

    const validated = parseScheduleCsvText(csvLine)
    if (validated.errors.length > 0) {
      setErrorMessage(validated.errors.join(' / '))
      return
    }

    setSaving(true)
    try {
      window.localStorage.removeItem(`${CLEARED_SEMESTER_KEY_PREFIX}${storageKey}`)
      const { merged, addedCount, updatedCount } = mergeScheduleWithoutDuplicates(
        sessions,
        validated.items,
      )
      await storage.set(storageKey, merged)
      if (user && !activeGroup) {
        await refreshGroupContext()
      }
      await loadSchedule()
      setCourseCode('')
      setCourseName('')
      setRoom('')
      setInstructor('')
      setOnlineLink(false)
      setShowEditForm(false)
      setStatusMessage(
        addedCount > 0
          ? 'เพิ่มรายวิชาลงในตารางเรียนเรียบร้อยแล้ว'
          : `อัปเดตข้อมูลรายวิชาเดิม (${updatedCount} รายการ) เรียบร้อยแล้ว`,
      )
    } catch (err) {
      setErrorMessage(formatStorageErrorThai(err))
    } finally {
      setSaving(false)
    }
  }

  function handleSelectForEdit(item: CourseScheduleItem) {
    if (!canEdit) return
    setCourseCode(item.course_code)
    setCourseName(item.course_name)
    setCredits(String(item.credits))
    setSection(item.section)
    setDay(item.day)
    setStart(item.start)
    setEnd(item.end)
    setRoom(item.room)
    setInstructor(item.instructor)
    setOnlineLink(item.online_link)
    setShowEditForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleConfirmClearSchedule() {
    if (!canClearSchedule) return
    setSaving(true)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      window.localStorage.setItem(`${CLEARED_SEMESTER_KEY_PREFIX}${storageKey}`, 'true')
      await storage.remove(storageKey)
      setShowClearConfirm(false)
      setSessions([])
      setStatusMessage(`ล้างข้อมูลตารางเรียนของ ${currentSemesterInfo.label} เรียบร้อยแล้ว`)
    } catch (err) {
      setErrorMessage(formatStorageErrorThai(err))
    } finally {
      setSaving(false)
    }
  }

  function renderScheduleGrid(daysToShow: DayOfWeek[]) {
    return (
      <div className="overflow-x-auto rounded-xl border border-line">
        <div className="min-w-[920px]">
          {/* แถวหัวตารางแสดงแกนเวลา 07:00 - 20:00 ด้วย CSS Grid */}
          <div
            className="grid border-b border-line bg-surface-alt text-[11px] font-semibold text-ink-secondary"
            style={{
              gridTemplateColumns: `110px repeat(${TOTAL_HALF_HOUR_SLOTS}, minmax(0, 1fr))`,
            }}
          >
            <div className="sticky left-0 z-10 border-r border-line bg-surface-alt px-3 py-2.5 text-left font-bold text-ink">
              วัน / เวลา
            </div>
            {HOURS_AXIS.slice(0, -1).map((hourLabel) => (
              <div
                key={hourLabel}
                style={{ gridColumn: 'span 2 / span 2' }}
                className="border-r border-line px-1.5 py-2.5 text-left font-mono"
              >
                {hourLabel}
              </div>
            ))}
          </div>

          {/* แถวแต่ละวัน */}
          <div className="divide-y divide-line">
            {daysToShow.map((dayCode) => {
              const daySessions = sessions.filter((s) => s.day === dayCode)
              const dayGcalEvents = gcal.overlayVisible
                ? gcal.events.filter((ev) => ev.day === dayCode)
                : []
              const isToday = dayCode === todayCode

              return (
                <div
                  key={dayCode}
                  className={`grid min-h-[88px] items-stretch transition-colors ${
                    isToday ? 'bg-primary-soft/20' : 'bg-surface hover:bg-surface-hover/60'
                  }`}
                  style={{
                    gridTemplateColumns: `110px repeat(${TOTAL_HALF_HOUR_SLOTS}, minmax(0, 1fr))`,
                  }}
                >
                  {/* คอลัมน์ชื่อวัน + ไฮไลต์วันนี้ */}
                  <div
                    className={`sticky left-0 z-10 flex items-center gap-2 border-r border-line px-3 py-2 ${
                      isToday ? 'bg-primary-soft/60' : 'bg-surface-alt'
                    }`}
                  >
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-extrabold ${DAY_INFO[dayCode].badgeClass}`}
                    >
                      {DAY_INFO[dayCode].singleCode}
                    </span>
                    <div>
                      <div className="flex items-center gap-1 text-xs font-bold text-ink">
                        <span>{DAY_INFO[dayCode].full}</span>
                      </div>
                      <div className="font-mono text-[10px] text-ink-muted">
                        {isToday ? '● วันนี้' : dayCode}
                      </div>
                    </div>
                  </div>

                  {/* พื้นที่ CSS Grid 26 ช่อง (07:00 - 20:00 ช่องละ 30 นาที) */}
                  <div
                    className="relative grid items-center gap-y-1 py-1.5"
                    style={{
                      gridColumn: `2 / span ${TOTAL_HALF_HOUR_SLOTS}`,
                      gridTemplateColumns: `repeat(${TOTAL_HALF_HOUR_SLOTS}, minmax(0, 1fr))`,
                    }}
                  >
                    {/* เส้นเวลาปัจจุบัน (แสดงเฉพาะเมื่ออยู่ในช่วง 07:00-20:00) */}
                    {currentTimeLinePercent !== null && (
                      <div
                        aria-hidden="true"
                        style={{ left: `${currentTimeLinePercent}%` }}
                        className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-status-danger"
                      />
                    )}

                    {/* เส้นแบ่งชั่วโมงพื้นหลัง */}
                    {Array.from({ length: 13 }).map((_, hIdx) => (
                      <div
                        key={`line-${dayCode}-${hIdx}`}
                        style={{
                          gridColumn: `${hIdx * 2 + 1} / span 2`,
                          gridRow: '1 / span 2',
                        }}
                        className="pointer-events-none h-full border-r border-dashed border-line"
                      />
                    ))}

                    {/* กล่องรายวิชาที่วางตามตำแหน่งเวลาบน CSS Grid */}
                    {daySessions.map((sess, sIdx) => {
                      const startMin = Math.max(
                        GRID_START_MIN,
                        Math.min(GRID_END_MIN - 30, timeToMinutes(sess.start)),
                      )
                      const endMin = Math.max(
                        startMin + 30,
                        Math.min(GRID_END_MIN, timeToMinutes(sess.end)),
                      )

                      const startSlot =
                        Math.floor((startMin - GRID_START_MIN) / 30) + 1
                      const spanSlots = Math.max(
                        1,
                        Math.ceil((endMin - startMin) / 30),
                      )

                      const colorTheme =
                        courseColorMap.get(sess.course_code.toUpperCase()) ??
                        COURSE_TOKEN_PALETTE[0]

                      return (
                        <div
                          key={`${sess.course_code}-${sess.day}-${sess.start}-${sIdx}`}
                          style={{
                            gridColumn: `${startSlot} / span ${spanSlots}`,
                            gridRow: 1,
                          }}
                          onClick={() => handleSelectForEdit(sess)}
                          title={`${sess.course_code} ${sess.course_name} (${sess.start}-${sess.end}) ห้อง ${sess.room}`}
                          className={`z-10 mx-0.5 flex flex-col justify-between rounded-xl border-l-4 p-2 text-xs shadow-2xs transition ${colorTheme.bg} ${colorTheme.border} ${colorTheme.text} ${
                            canEdit ? 'cursor-pointer' : ''
                          }`}
                        >
                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <span className="font-mono text-xs font-extrabold">
                                {sess.course_code}
                              </span>
                              {sess.online_link && (
                                <span className="rounded bg-surface px-1.5 py-0.2 text-[10px] font-bold text-accent-mint">
                                  มีเรียนออนไลน์
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 line-clamp-1 font-bold leading-snug">
                              {sess.course_name}
                            </p>
                          </div>

                          <div
                            className={`mt-1 flex flex-wrap items-center justify-between gap-1 text-[11px] font-medium ${colorTheme.sub}`}
                          >
                            <span>📍 {sess.room || '-'}</span>
                            <span className="font-mono">
                              {sess.start}–{sess.end}
                            </span>
                          </div>
                        </div>
                      )
                    })}

                    {/* กล่องอีเวนต์ Google Calendar ที่ซ้อนทับแบบอ่านอย่างเดียว (แถวที่ 2 ในวันเดียวกัน) */}
                    {dayGcalEvents.map((ev, gIdx) => {
                      const startMin = Math.max(
                        GRID_START_MIN,
                        Math.min(GRID_END_MIN - 30, timeToMinutes(ev.startTime)),
                      )
                      const endMin = Math.max(
                        startMin + 30,
                        Math.min(GRID_END_MIN, timeToMinutes(ev.endTime)),
                      )

                      const startSlot =
                        Math.floor((startMin - GRID_START_MIN) / 30) + 1
                      const spanSlots = Math.max(
                        1,
                        Math.ceil((endMin - startMin) / 30),
                      )

                      return (
                        <div
                          key={`gcal-${ev.id}-${gIdx}`}
                          style={{
                            gridColumn: `${startSlot} / span ${spanSlots}`,
                            gridRow: 2,
                          }}
                          onClick={() => setSelectedGcalEvent(ev)}
                          title={`[Google Calendar] ${ev.summary} (${ev.isAllDay ? 'ทั้งวัน' : `${ev.startTime}-${ev.endTime}`}) — คลิกเพื่อดูหรือแก้ไขใน Google Calendar`}
                          className="z-10 mx-0.5 cursor-pointer rounded-xl border border-dashed border-accent-sky bg-accent-sky-soft/75 p-1.5 text-[11px] text-accent-sky-fg shadow-2xs transition hover:opacity-95"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold">📆 {ev.summary}</span>
                            <span className="font-mono text-[10px]">
                              {ev.isAllDay ? 'ทั้งวัน' : `${ev.startTime}–${ev.endTime}`}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ส่วนหัว: ข้อมูลรายวิชาที่ลงทะเบียน ปี 4 เทอม 1 (2569/1) + ตัวเลือกภาคการศึกษา */}
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-ink sm:text-2xl">
                รายวิชาที่ลงทะเบียน:{' '}
                <span className="font-pixel text-primary">{currentSemesterInfo.code}</span>
              </h1>
              <Badge tone="primary">📚 {summaryStats.courseCount} วิชา</Badge>
              <Badge tone="amber">⚡ {summaryStats.totalCredits} หน่วยกิต</Badge>
              {isLoggedInViewer && <Badge tone="warning">👁️ โหมดดูอย่างเดียว</Badge>}
            </div>
            <p className="mt-1 text-xs font-medium text-ink-muted">
              68067967 — ราเวน อาร์เนสัน • ช่วงเรียนปกติ ({currentSemesterInfo.period}) • วันนี้:{' '}
              {formatFullDateThai()}
            </p>
          </div>

          {/* ตัวเลือกภาคการศึกษา + สลับมุมมอง Week / ตาราง */}
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="semester-select" className="text-xs font-semibold text-ink-secondary">
              เลือกภาคการศึกษา:
            </label>
            <select
              id="semester-select"
              value={semester}
              onChange={(e) => {
                setSemester(e.target.value)
                setStatusMessage(null)
                setErrorMessage(null)
              }}
              className="min-h-[44px] sm:min-h-[38px] rounded-xl border border-line-strong bg-surface-alt px-3 py-1.5 text-xs font-bold text-ink focus:border-primary focus:outline-none"
            >
              {SEMESTER_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.code} — {opt.label} ({opt.period})
                </option>
              ))}
            </select>

            <div className="inline-flex rounded-xl border border-line bg-surface-alt p-1">
              <button
                type="button"
                onClick={() => setActiveTab('weekly')}
                className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  activeTab === 'weekly'
                    ? 'bg-primary text-ink-inverted shadow-2xs'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                📅 Week (ตารางรายสัปดาห์)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  activeTab === 'list'
                    ? 'bg-primary text-ink-inverted shadow-2xs'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                📋 ตาราง (รายการวิชา)
              </button>
            </div>
          </div>
        </div>

        {/* ปุ่มจัดการข้อมูล (ซ่อนสำหรับผู้ชม) */}
        {canEdit && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
            <span className="text-xs text-ink-muted">
              จัดการข้อมูลตารางเรียน (บันทึกผ่านตาราง <code className="font-mono">courses</code> และ{' '}
              <code className="font-mono">class_sessions</code>)
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={saving}
                onClick={() => void handleLoadSampleSchedule()}
              >
                โหลดตารางตัวอย่าง
              </Button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => void handleFileChange(e)}
                className="hidden"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={saving}
                onClick={() => fileInputRef.current?.click()}
              >
                นำเข้า CSV
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => setShowEditForm((prev) => !prev)}
              >
                {showEditForm ? 'ปิดฟอร์มเพิ่ม/แก้ไขวิชา' : '+ เพิ่ม/แก้ไขวิชา'}
              </Button>

              {canClearSchedule && sessions.length > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={saving}
                  onClick={() => setShowClearConfirm(true)}
                >
                  ล้างตาราง
                </Button>
              )}
            </div>
          </div>
        )}

        {/* แถบซิงก์ปฏิทิน Google Calendar แบบอ่านอย่างเดียว (G3) */}
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

        {/* แจ้งเตือนสำหรับผู้ชมที่ล็อกอินแต่ยังไม่มีรหัสเชิญ */}
        {isLoggedInViewer && (
          <div className="mt-4 rounded-xl border border-status-warning bg-status-warning-soft p-3.5 text-sm text-status-warning-fg">
            <span className="font-bold">โหมดดูอย่างเดียว (กรอกรหัสเชิญเพื่อแก้ไข)</span> —
            ขณะนี้คุณอยู่ในโหมดผู้ชม จึงไม่เห็นปุ่มนำเข้าหรือแก้ไขตารางเรียน กรุณาไปที่หน้า{' '}
            <Link to="/group" className="font-bold underline">
              จัดการกลุ่ม (/group)
            </Link>{' '}
            เพื่อกรอกรหัสเชิญหรือสร้างกลุ่มของคุณเอง
          </div>
        )}

        {statusMessage && (
          <div className="mt-4">
            <Toast
              tone="success"
              message={statusMessage}
              onClose={() => setStatusMessage(null)}
            />
          </div>
        )}

        {errorMessage && (
          <div className="mt-4">
            <Toast
              tone="danger"
              message={errorMessage}
              onClose={() => setErrorMessage(null)}
            />
          </div>
        )}

        {/* กล่องแสดงตัวอย่างรายการก่อนยืนยันนำเข้า CSV (Preview Confirmation) */}
        {csvPreviewItems && canEdit && (
          <div className="mt-4 rounded-2xl border-2 border-primary bg-primary-soft/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-ink">
                  ตรวจสอบตัวอย่างรายการก่อนนำเข้าไฟล์ &ldquo;{csvFileName}&rdquo; ({csvPreviewItems.length} รายการ)
                </h2>
                <p className="text-xs text-ink-secondary">
                  หากมีรหัสวิชา วัน และเวลาตรงกับที่มีอยู่แล้ว ระบบจะอัปเดตข้อมูลแถวเดิมโดยไม่สร้างแถวซ้ำ
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="mint"
                  size="sm"
                  disabled={saving}
                  onClick={() => void handleConfirmCsvImport()}
                >
                  {saving ? 'กำลังบันทึก...' : 'ยืนยันการนำเข้า'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => setCsvPreviewItems(null)}
                >
                  ยกเลิก
                </Button>
              </div>
            </div>

            <div className="mt-3 max-h-60 overflow-auto rounded-xl border border-line bg-surface">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-surface-alt text-ink-secondary">
                  <tr>
                    <th className="p-2">สถานะ</th>
                    <th className="p-2">รหัสวิชา</th>
                    <th className="p-2">ชื่อวิชา</th>
                    <th className="p-2">หน่วยกิต</th>
                    <th className="p-2">วัน/เวลา</th>
                    <th className="p-2">ห้อง</th>
                    <th className="p-2">อาจารย์</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {csvPreviewItems.map((item, idx) => {
                    const isExisting = existingKeysSet.has(makeSessionDedupeKey(item))
                    return (
                      <tr key={`${item.course_code}-${item.day}-${item.start}-${idx}`}>
                        <td className="p-2">
                          <Badge tone={isExisting ? 'warning' : 'success'}>
                            {isExisting ? 'อัปเดตวิชาเดิม' : 'เพิ่มใหม่'}
                          </Badge>
                        </td>
                        <td className="p-2 font-mono font-bold text-ink">{item.course_code}</td>
                        <td className="p-2 text-ink">{item.course_name}</td>
                        <td className="p-2 text-ink">{item.credits}</td>
                        <td className="p-2 text-ink-secondary">
                          {DAY_INFO[item.day]?.full ?? item.day} {item.start}-{item.end}
                        </td>
                        <td className="p-2 text-ink-secondary">{item.room || '-'}</td>
                        <td className="p-2 text-ink-secondary">{item.instructor || '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ฟอร์มเพิ่ม/แก้ไขรายวิชาด้วยตนเอง */}
        {showEditForm && canEdit && (
          <form
            onSubmit={(e) => void handleSaveManualCourse(e)}
            className="mt-4 grid gap-3 rounded-2xl border border-line bg-surface-alt p-4 sm:grid-cols-6"
          >
            <div>
              <label className="block text-xs font-medium text-ink-secondary">รหัสวิชา *</label>
              <input
                type="text"
                required
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                placeholder="ICT35467"
                className="mt-1 min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink uppercase"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-ink-secondary">ชื่อรายวิชา *</label>
              <input
                type="text"
                required
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="การบริหารโครงการเทคโนโลยีสารสนเทศ"
                className="mt-1 min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-secondary">วันเรียน *</label>
              <select
                value={day}
                onChange={(e) => setDay(e.target.value as DayOfWeek)}
                className="mt-1 min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-2.5 py-1.5 text-xs text-ink"
              >
                {DAYS_ORDER.map((d) => (
                  <option key={d} value={d}>
                    {DAY_INFO[d].full} ({d})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-secondary">เวลาเริ่ม - เลิก *</label>
              <div className="mt-1 flex items-center gap-1">
                <input
                  type="time"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-2 py-1.5 text-xs text-ink"
                />
                <span>-</span>
                <input
                  type="time"
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-2 py-1.5 text-xs text-ink"
                />
              </div>
            </div>

            <div className="flex items-end">
              <Button type="submit" variant="primary" size="sm" disabled={saving} className="w-full">
                {saving ? 'กำลังบันทึก...' : 'บันทึกรายวิชา'}
              </Button>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-secondary">หน่วยกิต</label>
              <input
                type="number"
                min="1"
                max="12"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                className="mt-1 min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-secondary">ทฤษฎี / ตอนเรียน</label>
              <input
                type="text"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="001"
                className="mt-1 min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-secondary">ห้องเรียน</label>
              <input
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="05-0704"
                className="mt-1 min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-ink-secondary">อาจารย์ผู้สอน</label>
              <input
                type="text"
                value={instructor}
                onChange={(e) => setInstructor(e.target.value)}
                placeholder="ชื่อ-นามสกุลอาจารย์"
                className="mt-1 min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink"
              />
            </div>

            <div className="flex items-end pb-1">
              <label className="inline-flex min-h-[44px] sm:min-h-[38px] cursor-pointer items-center gap-2 text-xs font-medium text-ink-secondary">
                <input
                  type="checkbox"
                  checked={onlineLink}
                  onChange={(e) => setOnlineLink(e.target.checked)}
                  className="rounded border-line-strong"
                />
                มีเรียนออนไลน์
              </label>
            </div>
          </form>
        )}
      </Card>

      {/* กล่องแสดงรายละเอียดอีเวนต์ Google Calendar + ปุ่มแก้ไขใน Google Calendar */}
      <GoogleCalendarEventModal
        event={selectedGcalEvent}
        onClose={() => setSelectedGcalEvent(null)}
      />

      {/* กล่องยืนยันการล้างตาราง */}
      <ConfirmDialog
        open={showClearConfirm && canClearSchedule}
        title={`ยืนยันการล้างตารางเรียนทั้งหมดใน ${currentSemesterInfo.label}?`}
        description="ข้อมูลรายวิชาและคาบเรียนทั้งหมดในภาคการศึกษานี้จะถูกลบออกจากกลุ่ม คุณต้องการดำเนินการต่อหรือไม่?"
        confirmLabel="ยืนยันล้างตาราง"
        loading={saving}
        onConfirm={() => void handleConfirmClearSchedule()}
        onCancel={() => setShowClearConfirm(false)}
      />

      {/* เนื้อหาหลักตามมุมมองที่เลือก */}
      {loading ? (
        <Skeleton lines={5} label="อีกาตัวน้อยกำลังโหลดตารางเรียน..." />
      ) : activeTab === 'weekly' ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-ink">
                ตารางเรียนรายสัปดาห์ (เวลา 07:00–20:00)
              </h2>
              <p className="text-xs text-ink-muted">
                มือถือแสดงทีละวัน • แท็บเล็ตแสดง 5 วันทำการ • คอมพิวเตอร์แสดงครบ 7 วัน พร้อมเส้นเวลาปัจจุบันสีแดง
              </p>
            </div>
            <Badge tone="mint">● วันนี้: วัน{DAY_INFO[todayCode].full}</Badge>
          </div>

          {/* 1) มือถือ (<640px): แสดงทีละวันพร้อมแท็บ จ-อา */}
          <div className="sm:hidden space-y-4">
            <div className="grid grid-cols-7 gap-1 rounded-xl border border-line bg-surface-alt p-1">
              {DAYS_ORDER.map((d) => {
                const isSelected = selectedMobileDay === d
                const isToday = d === todayCode
                const count = sessions.filter((s) => s.day === d).length
                return (
                  <button
                    key={`mob-tab-${d}`}
                    type="button"
                    onClick={() => setSelectedMobileDay(d)}
                    className={`flex min-h-[48px] flex-col items-center justify-center rounded-lg px-1 py-1 text-xs font-bold transition ${
                      isSelected
                        ? 'bg-primary text-ink-inverted shadow-2xs'
                        : isToday
                          ? 'border border-primary text-primary'
                          : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    <span>{DAY_INFO[d].short}</span>
                    <span className="font-pixel text-[9px] opacity-80">{count}</span>
                  </button>
                )
              })}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-ink">
                  วัน{DAY_INFO[selectedMobileDay].full}{' '}
                  {selectedMobileDay === todayCode && (
                    <span className="text-xs font-semibold text-primary">(วันนี้)</span>
                  )}
                </h3>
                <span className="text-xs text-ink-muted">
                  {sessions.filter((s) => s.day === selectedMobileDay).length} คาบเรียน
                </span>
              </div>

              {sessions.filter((s) => s.day === selectedMobileDay).length === 0 ? (
                <EmptyState
                  mood="sleep"
                  title={`ไม่มีคาบเรียนในวัน${DAY_INFO[selectedMobileDay].full}`}
                  description="เลือกดูวันอื่นจากแท็บด้านบน หรือกดปุ่ม + มุมล่างขวาเพื่อเพิ่มวิชาเรียน"
                />
              ) : (
                sessions
                  .filter((s) => s.day === selectedMobileDay)
                  .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
                  .map((sess, idx) => {
                    const colorTheme =
                      courseColorMap.get(sess.course_code.toUpperCase()) ??
                      COURSE_TOKEN_PALETTE[0]
                    return (
                      <div
                        key={`mob-card-${sess.course_code}-${idx}`}
                        onClick={() => handleSelectForEdit(sess)}
                        className={`rounded-xl border-l-4 p-4 shadow-2xs ${colorTheme.bg} ${colorTheme.border} ${colorTheme.text}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-sm font-extrabold">
                            {sess.course_code}
                          </span>
                          <span className="font-mono text-xs font-bold">
                            {sess.start} – {sess.end}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-bold">{sess.course_name}</p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span>📍 ห้อง {sess.room || '-'} (Sec {sess.section})</span>
                          {sess.online_link && (
                            <Badge tone="mint">มีเรียนออนไลน์</Badge>
                          )}
                        </div>
                      </div>
                    )
                  })
              )}

              {/* อีเวนต์จาก Google Calendar ของวันที่เลือกบนมือถือ */}
              {gcal.overlayVisible &&
                gcal.events
                  .filter((ev) => ev.day === selectedMobileDay)
                  .map((ev, gIdx) => (
                    <div
                      key={`mob-gcal-${ev.id}-${gIdx}`}
                      onClick={() => setSelectedGcalEvent(ev)}
                      className="cursor-pointer rounded-xl border border-dashed border-accent-sky bg-accent-sky-soft/70 p-3.5 text-accent-sky-fg shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge tone="sky">📆 Google Calendar</Badge>
                        <span className="font-mono text-xs font-bold">
                          {ev.isAllDay ? 'ตลอดทั้งวัน' : `${ev.startTime} – ${ev.endTime}`}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-bold text-ink">{ev.summary}</p>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-ink-secondary">
                          {ev.location ? `📍 ${ev.location}` : 'อ่านอย่างเดียว'}
                        </span>
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

          {/* 2) แท็บเล็ต (640-1024px): แสดง 5 วัน (จันทร์-ศุกร์) */}
          <div className="hidden sm:block lg:hidden">
            {renderScheduleGrid(TABLET_WEEKDAYS)}
          </div>

          {/* 3) คอมพิวเตอร์ (>1024px): แสดงครบ 7 วัน (จันทร์-อาทิตย์) */}
          <div className="hidden lg:block">{renderScheduleGrid(DAYS_ORDER)}</div>
        </Card>
      ) : (
        /* มุมมองที่ 2: ตารางรายวิชาที่ลงทะเบียน */
        <Card padding="none" className="overflow-hidden">
          <div className="bg-accent-amber px-5 py-3 text-sm font-bold text-ink-inverted">
            📖 ช่วงเรียนปกติ ({currentSemesterInfo.period})
          </div>

          {sessions.length === 0 ? (
            <div className="p-6">
              <EmptyState
                mood="idle"
                title="ยังไม่มีรายวิชาในภาคการศึกษานี้"
                description="กดปุ่ม โหลดตารางตัวอย่าง หรือ นำเข้า CSV ด้านบนเพื่อเพิ่มตารางเรียน"
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-line bg-surface-alt text-[11px] font-bold text-ink-muted uppercase">
                    <th className="py-3 pl-5 pr-2">NO.</th>
                    <th className="py-3 px-3">รหัสวิชา / ชื่อวิชา</th>
                    <th className="py-3 px-2 text-center">หน่วยกิต</th>
                    <th className="py-3 px-2 text-center">ทฤษฎี</th>
                    <th className="py-3 px-2 text-center">ปฏิบัติ</th>
                    <th className="py-3 px-2 text-center">วัน</th>
                    <th className="py-3 px-3">เวลาเรียน</th>
                    <th className="py-3 px-3">ห้องเรียน</th>
                    <th className="py-3 px-3">ผู้สอน</th>
                    <th className="py-3 px-3">ONLINE CLASSES</th>
                    <th className="py-3 pr-5 text-center">รูปแบบการสอบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sessions.map((s, idx) => {
                    const colorTheme =
                      courseColorMap.get(s.course_code.toUpperCase()) ??
                      COURSE_TOKEN_PALETTE[0]
                    const dayMeta = DAY_INFO[s.day] ?? DAY_INFO.MON
                    const roomDetail = getBuildingRoomDetail(s.room)
                    const instructorText = s.instructor
                      ? s.instructor.startsWith('อาจารย์')
                        ? s.instructor
                        : `อาจารย์ ${s.instructor}`
                      : '-'

                    return (
                      <tr
                        key={`row-${s.course_code}-${s.day}-${s.start}-${idx}`}
                        onClick={() => handleSelectForEdit(s)}
                        className={`transition hover:bg-surface-hover ${
                          canEdit ? 'cursor-pointer' : ''
                        }`}
                      >
                        <td className="py-4 pl-5 pr-2 font-mono text-ink-muted">
                          {idx + 1}.
                        </td>
                        <td className="py-4 px-3">
                          <div className="flex items-stretch gap-2.5">
                            <span className={`w-1 shrink-0 rounded-full ${colorTheme.bar}`} />
                            <div>
                              <div className="font-mono text-xs font-extrabold text-accent-pink">
                                {s.course_code}
                              </div>
                              <div className="mt-0.5 text-sm font-bold text-ink">
                                {s.course_name}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-2 text-center font-pixel text-sm font-bold text-primary">
                          {s.credits}
                        </td>
                        <td className="py-4 px-2 text-center font-mono text-ink-secondary">
                          {s.section}
                        </td>
                        <td className="py-4 px-2 text-center text-ink-muted">–</td>
                        <td className="py-4 px-2 text-center">
                          <span
                            title={dayMeta.full}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-extrabold shadow-2xs ${dayMeta.badgeClass}`}
                          >
                            {dayMeta.singleCode}
                          </span>
                        </td>
                        <td className="py-4 px-3 font-mono text-xs font-bold text-ink whitespace-nowrap">
                          {s.start}–{s.end}
                        </td>
                        <td className="py-4 px-3">
                          <div className="font-mono text-xs font-bold text-ink">
                            📍 {s.room || '-'}
                          </div>
                          {roomDetail && (
                            <div className="mt-0.5 text-[11px] text-ink-muted">
                              {roomDetail}
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-3 text-xs font-medium text-ink-secondary">
                          {instructorText}
                        </td>
                        <td className="py-4 px-3">
                          {s.online_link ? (
                            <div className="space-y-1">
                              <Badge tone="mint">มีเรียนออนไลน์</Badge>
                              <div className="text-[11px] font-semibold text-accent-pink">
                                Click online classes
                              </div>
                            </div>
                          ) : (
                            <span className="text-ink-muted">–</span>
                          )}
                        </td>
                        <td className="py-4 pr-5 text-center">
                          <Badge tone="neutral">ไม่จัดสอบ</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ส่วนสรุปด้านล่างหน้า: จำนวนวิชา หน่วยกิตรวม */}
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-xs font-medium text-ink-muted">จำนวนวิชา</span>
            <p className="font-pixel text-xl font-bold text-accent-pink">
              {summaryStats.courseCount}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-ink-muted">หน่วยกิตรวม</span>
            <p className="font-pixel text-xl font-bold text-primary">
              {summaryStats.totalCredits}
            </p>
          </div>
        </div>

        <p className="text-xs text-ink-muted">
          <strong>คำอธิบายเพิ่มเติม:</strong> • ภาค S หมายถึง ภาคฤดูร้อน | อักษรย่อวันเรียน:{' '}
          <strong>M</strong>=จันทร์ <strong>T</strong>=อังคาร <strong>W</strong>=พุธ{' '}
          <strong>H</strong>=พฤหัสบดี <strong>F</strong>=ศุกร์ <strong>S</strong>=เสาร์{' '}
          <strong>U</strong>=อาทิตย์
        </p>
      </Card>

      {/* ปุ่มเพิ่มเร็วลอยมุมล่างขวาบนมือถือ (เฉพาะผู้ที่มีสิทธิ์แก้ไข) */}
      {canEdit && (
        <button
          type="button"
          onClick={() => {
            setShowEditForm(true)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          aria-label="เพิ่มรายวิชาด่วน"
          className="fixed right-4 bottom-20 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl font-bold text-ink-inverted shadow-lg transition hover:bg-primary-hover sm:hidden"
        >
          +
        </button>
      )}
    </div>
  )
}

export default ClassSchedulePage
