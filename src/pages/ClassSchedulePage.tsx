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
import { useAuth } from '../lib/auth'
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
import type { CourseScheduleItem, DayOfWeek } from '../types'

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

const DAY_INFO: Record<
  DayOfWeek,
  { short: string; full: string; singleCode: string; badgeClass: string }
> = {
  MON: {
    short: 'จ.',
    full: 'จันทร์',
    singleCode: 'M',
    badgeClass: 'bg-yellow-400 text-slate-900',
  },
  TUE: {
    short: 'อ.',
    full: 'อังคาร',
    singleCode: 'T',
    badgeClass: 'bg-pink-500 text-white',
  },
  WED: {
    short: 'พ.',
    full: 'พุธ',
    singleCode: 'W',
    badgeClass: 'bg-emerald-500 text-white',
  },
  THU: {
    short: 'พฤ.',
    full: 'พฤหัสบดี',
    singleCode: 'H',
    badgeClass: 'bg-orange-500 text-white',
  },
  FRI: {
    short: 'ศ.',
    full: 'ศุกร์',
    singleCode: 'F',
    badgeClass: 'bg-blue-500 text-white',
  },
  SAT: {
    short: 'ส.',
    full: 'เสาร์',
    singleCode: 'S',
    badgeClass: 'bg-purple-500 text-white',
  },
  SUN: {
    short: 'อา.',
    full: 'อาทิตย์',
    singleCode: 'U',
    badgeClass: 'bg-rose-500 text-white',
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

const COURSE_COLOR_PALETTE = [
  {
    bg: 'bg-teal-100/95 hover:bg-teal-200/90',
    border: 'border-teal-500',
    bar: 'bg-teal-500',
    text: 'text-teal-950',
    sub: 'text-teal-800',
    badge: 'bg-teal-600 text-white',
  },
  {
    bg: 'bg-purple-100/95 hover:bg-purple-200/90',
    border: 'border-purple-500',
    bar: 'bg-purple-500',
    text: 'text-purple-950',
    sub: 'text-purple-800',
    badge: 'bg-purple-600 text-white',
  },
  {
    bg: 'bg-amber-100/95 hover:bg-amber-200/90',
    border: 'border-amber-500',
    bar: 'bg-amber-500',
    text: 'text-amber-950',
    sub: 'text-amber-800',
    badge: 'bg-amber-600 text-white',
  },
  {
    bg: 'bg-emerald-100/95 hover:bg-emerald-200/90',
    border: 'border-emerald-500',
    bar: 'bg-emerald-500',
    text: 'text-emerald-950',
    sub: 'text-emerald-800',
    badge: 'bg-emerald-600 text-white',
  },
  {
    bg: 'bg-rose-100/95 hover:bg-rose-200/90',
    border: 'border-rose-500',
    bar: 'bg-rose-500',
    text: 'text-rose-950',
    sub: 'text-rose-800',
    badge: 'bg-rose-600 text-white',
  },
  {
    bg: 'bg-indigo-100/95 hover:bg-indigo-200/90',
    border: 'border-indigo-500',
    bar: 'bg-indigo-500',
    text: 'text-indigo-950',
    sub: 'text-indigo-800',
    badge: 'bg-indigo-600 text-white',
  },
]

const CLEARED_SEMESTER_KEY_PREFIX = 'lsp:cleared_semester:'

export function ClassSchedulePage() {
  const { user, activeGroup, currentRole, refreshGroupContext } = useAuth()

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

  // ตรวจสอบสิทธิ์ตามหลักการสิทธิ์:
  // - ผู้ชม / ล็อกอินแต่ไม่มีรหัส: อ่านอย่างเดียว
  // - ผู้แก้ไข (member): นำเข้าและแก้ไขได้
  // - เฉพาะ owner / admin: ล้างตารางได้
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

      // หากเปิดภาคการศึกษาหลัก (ปี 4 เทอม 1 - 2569/1) ครั้งแรกและยังไม่มีข้อมูล (และไม่ได้เพิ่งกดล้างตาราง)
      // โหลดตารางเรียนปี 4 เทอม 1 จาก sample-data/schedule.csv ให้อัตโนมัติทันที
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

  // สร้างแผนผังสีตามรหัสวิชาเพื่อให้แต่ละวิชามีสีต่างกันอย่างชัดเจน
  const courseColorMap = useMemo(() => {
    const map = new Map<string, (typeof COURSE_COLOR_PALETTE)[number]>()
    const uniqueCodes = Array.from(
      new Set(sessions.map((s) => s.course_code.toUpperCase())),
    )
    uniqueCodes.forEach((code, idx) => {
      map.set(code, COURSE_COLOR_PALETTE[idx % COURSE_COLOR_PALETTE.length])
    })
    return map
  }, [sessions])

  // คำนวณสรุปจำนวนวิชาและหน่วยกิตรวม (นับหน่วยกิตตามรหัสวิชาที่ไม่ซ้ำ)
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

  // 1. ปุ่ม "โหลดตารางตัวอย่าง" อ่านจาก sample-data/schedule.csv แล้วบันทึกลงกลุ่ม
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

  // 2. ปุ่ม "นำเข้า CSV" เลือกไฟล์จากเครื่อง ตรวจคอลัมน์และรูปแบบเวลา
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

  // ยืนยันการนำเข้า CSV หลังตรวจสอบตัวอย่างรายการ
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

  // เพิ่มหรือแก้ไขวิชาเรียนผ่านฟอร์ม
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

  // ล้างตารางเรียน (เฉพาะ owner / admin)
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

  return (
    <div className="space-y-6">
      {/* ส่วนหัว: ข้อมูลรายวิชาที่ลงทะเบียน ปี 4 เทอม 1 (2569/1) + ตัวเลือกภาคการศึกษา */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
                รายวิชาที่ลงทะเบียน:{' '}
                <span className="text-rose-600">{currentSemesterInfo.code}</span>
              </h1>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-0.5 text-xs font-bold text-slate-700">
                📚 {summaryStats.courseCount} วิชา
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-0.5 text-xs font-bold text-slate-700">
                ⚡ {summaryStats.totalCredits} หน่วยกิต
              </span>
            </div>
            <p className="mt-1 text-xs font-medium text-slate-500">
              68067967 — ราเวน อาร์เนสัน • ช่วงเรียนปกติ ({currentSemesterInfo.period})
            </p>
          </div>

          {/* ตัวเลือกภาคการศึกษา + สลับมุมมอง Week / ตาราง */}
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="semester-select" className="text-xs font-semibold text-slate-600">
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
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none"
            >
              {SEMESTER_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.code} — {opt.label} ({opt.period})
                </option>
              ))}
            </select>

            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('weekly')}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                  activeTab === 'weekly'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📅 Week (ตารางรายสัปดาห์)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                  activeTab === 'list'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📋 ตาราง (รายการวิชา)
              </button>
            </div>
          </div>
        </div>

        {/* ปุ่มจัดการข้อมูล (ซ่อนสำหรับผู้ชม) */}
        {canEdit && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
            <span className="text-xs text-slate-500">
              จัดการข้อมูลตารางเรียน (บันทึกผ่านตาราง <code className="font-mono">courses</code> และ <code className="font-mono">class_sessions</code>)
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleLoadSampleSchedule()}
                className="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700 disabled:opacity-50"
              >
                โหลดตารางตัวอย่าง
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => void handleFileChange(e)}
                className="hidden"
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-indigo-300 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                นำเข้า CSV
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() => setShowEditForm((prev) => !prev)}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {showEditForm ? 'ปิดฟอร์มเพิ่ม/แก้ไขวิชา' : '+ เพิ่ม/แก้ไขวิชา'}
              </button>

              {canClearSchedule && sessions.length > 0 && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setShowClearConfirm(true)}
                  className="rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  ล้างตาราง
                </button>
              )}
            </div>
          </div>
        )}

        {/* แจ้งเตือนสำหรับผู้ชมที่ล็อกอินแต่ยังไม่มีรหัสเชิญ */}
        {isLoggedInViewer && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-900">
            <span className="font-bold">กรอกรหัสเชิญเพื่อแก้ไข</span> — ขณะนี้คุณอยู่ในโหมดผู้ชม (อ่านอย่างเดียว)
            จึงไม่เห็นปุ่มนำเข้าหรือแก้ไขตารางเรียน กรุณาไปที่หน้า{' '}
            <Link to="/group" className="font-semibold text-indigo-700 underline">
              จัดการกลุ่ม (/group)
            </Link>{' '}
            เพื่อกรอกรหัสเชิญหรือสร้างกลุ่มของคุณเอง
          </div>
        )}

        {/* แจ้งเตือนสถานะสำเร็จ / ข้อผิดพลาด */}
        {statusMessage && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {statusMessage}
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 whitespace-pre-line rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}

        {/* กล่องแสดงตัวอย่างรายการก่อนยืนยันนำเข้า CSV (Preview Confirmation) */}
        {csvPreviewItems && canEdit && (
          <div className="mt-4 rounded-xl border-2 border-indigo-400 bg-indigo-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-indigo-950">
                  ตรวจสอบตัวอย่างรายการก่อนนำเข้าไฟล์ &ldquo;{csvFileName}&rdquo; ({csvPreviewItems.length} รายการ)
                </h2>
                <p className="text-xs text-indigo-800">
                  หากมีรหัสวิชา วัน และเวลาตรงกับที่มีอยู่แล้ว ระบบจะอัปเดตข้อมูลแถวเดิมโดยไม่สร้างแถวซ้ำ
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleConfirmCsvImport()}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? 'กำลังบันทึก...' : 'ยืนยันการนำเข้า'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setCsvPreviewItems(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  ยกเลิก
                </button>
              </div>
            </div>

            <div className="mt-3 max-h-60 overflow-auto rounded-lg border border-indigo-200 bg-white">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-indigo-50 text-indigo-900">
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
                <tbody className="divide-y divide-slate-100">
                  {csvPreviewItems.map((item, idx) => {
                    const isExisting = existingKeysSet.has(makeSessionDedupeKey(item))
                    return (
                      <tr key={`${item.course_code}-${item.day}-${item.start}-${idx}`}>
                        <td className="p-2">
                          {isExisting ? (
                            <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                              อัปเดตวิชาเดิม
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                              เพิ่มใหม่
                            </span>
                          )}
                        </td>
                        <td className="p-2 font-mono font-bold">{item.course_code}</td>
                        <td className="p-2">{item.course_name}</td>
                        <td className="p-2">{item.credits}</td>
                        <td className="p-2">
                          {DAY_INFO[item.day]?.full ?? item.day} {item.start}-{item.end}
                        </td>
                        <td className="p-2">{item.room || '-'}</td>
                        <td className="p-2">{item.instructor || '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* กล่องยืนยันการล้างตาราง (เฉพาะ owner / admin) */}
        {showClearConfirm && canClearSchedule && (
          <div
            role="dialog"
            aria-modal="true"
            className="mt-4 rounded-xl border-2 border-rose-400 bg-rose-50 p-4"
          >
            <h2 className="text-sm font-bold text-rose-900">
              ยืนยันการล้างตารางเรียนทั้งหมดใน {currentSemesterInfo.label}?
            </h2>
            <p className="mt-1 text-xs text-rose-800">
              ข้อมูลรายวิชาและคาบเรียนทั้งหมดในภาคการศึกษานี้จะถูกลบออกจากกลุ่ม คุณต้องการดำเนินการต่อหรือไม่?
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleConfirmClearSchedule()}
                className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {saving ? 'กำลังล้างข้อมูล...' : 'ยืนยันล้างตาราง'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowClearConfirm(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}

        {/* ฟอร์มเพิ่ม/แก้ไขรายวิชาด้วยตนเอง */}
        {showEditForm && canEdit && (
          <form
            onSubmit={(e) => void handleSaveManualCourse(e)}
            className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-6"
          >
            <div>
              <label className="block text-xs font-medium text-slate-700">รหัสวิชา *</label>
              <input
                type="text"
                required
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                placeholder="ICT35467"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs uppercase"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">ชื่อรายวิชา *</label>
              <input
                type="text"
                required
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="การบริหารโครงการเทคโนโลยีสารสนเทศ"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">วันเรียน *</label>
              <select
                value={day}
                onChange={(e) => setDay(e.target.value as DayOfWeek)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              >
                {DAYS_ORDER.map((d) => (
                  <option key={d} value={d}>
                    {DAY_INFO[d].full} ({d})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">เวลาเริ่ม - เลิก *</label>
              <div className="mt-1 flex items-center gap-1">
                <input
                  type="time"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                />
                <span>-</span>
                <input
                  type="time"
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                />
              </div>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึกรายวิชา'}
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">หน่วยกิต</label>
              <input
                type="number"
                min="1"
                max="12"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">ทฤษฎี / ตอนเรียน</label>
              <input
                type="text"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="001"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">ห้องเรียน</label>
              <input
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="05-0704"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">อาจารย์ผู้สอน</label>
              <input
                type="text"
                value={instructor}
                onChange={(e) => setInstructor(e.target.value)}
                placeholder="ชื่อ-นามสกุลอาจารย์"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
              />
            </div>

            <div className="flex items-end pb-1">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={onlineLink}
                  onChange={(e) => setOnlineLink(e.target.checked)}
                  className="rounded border-slate-300"
                />
                มีเรียนออนไลน์
              </label>
            </div>
          </form>
        )}
      </section>

      {/* เนื้อหาหลักตามมุมมองที่เลือก */}
      {loading ? (
        <section className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xs">
          <p className="text-sm text-slate-500">กำลังโหลดข้อมูลตารางเรียน...</p>
        </section>
      ) : activeTab === 'weekly' ? (
        /* มุมมองที่ 1: ตารางรายสัปดาห์ จันทร์-อาทิตย์ แกนเวลา 07:00-20:00 ด้วย CSS Grid */
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">
              ตารางเรียนรายสัปดาห์ (จันทร์–อาทิตย์ เวลา 07:00–20:00)
            </h2>
            <span className="text-xs text-slate-500">
              เลื่อนแนวนอนเพื่อดูเวลาทั้งหมดบนหน้าจอมือถือ
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <div className="min-w-[980px]">
              {/* แถวหัวตารางแสดงแกนเวลา 07:00 - 20:00 ด้วย CSS Grid */}
              <div
                className="grid border-b border-slate-200 bg-slate-100 text-[11px] font-semibold text-slate-600"
                style={{
                  gridTemplateColumns: `110px repeat(${TOTAL_HALF_HOUR_SLOTS}, minmax(0, 1fr))`,
                }}
              >
                <div className="sticky left-0 z-10 border-r border-slate-200 bg-slate-100 px-3 py-2.5 text-left font-bold text-slate-700">
                  วัน / เวลา
                </div>
                {HOURS_AXIS.slice(0, -1).map((hourLabel) => (
                  <div
                    key={hourLabel}
                    style={{ gridColumn: 'span 2 / span 2' }}
                    className="border-r border-slate-200/80 px-1.5 py-2.5 text-left font-mono"
                  >
                    {hourLabel}
                  </div>
                ))}
              </div>

              {/* แถวแต่ละวัน จันทร์ - อาทิตย์ */}
              <div className="divide-y divide-slate-200">
                {DAYS_ORDER.map((dayCode) => {
                  const daySessions = sessions.filter((s) => s.day === dayCode)
                  return (
                    <div
                      key={dayCode}
                      className="grid min-h-[88px] items-stretch bg-white transition-colors hover:bg-slate-50/50"
                      style={{
                        gridTemplateColumns: `110px repeat(${TOTAL_HALF_HOUR_SLOTS}, minmax(0, 1fr))`,
                      }}
                    >
                      {/* คอลัมน์ชื่อวัน */}
                      <div className="sticky left-0 z-10 flex items-center gap-2 border-r border-slate-200 bg-slate-50 px-3 py-2">
                        <span
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-extrabold ${DAY_INFO[dayCode].badgeClass}`}
                        >
                          {DAY_INFO[dayCode].singleCode}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-slate-800">
                            {DAY_INFO[dayCode].full}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {dayCode}
                          </div>
                        </div>
                      </div>

                      {/* พื้นที่ CSS Grid 26 ช่อง (07:00 - 20:00 ช่องละ 30 นาที) */}
                      <div
                        className="relative grid items-center py-1.5"
                        style={{
                          gridColumn: `2 / span ${TOTAL_HALF_HOUR_SLOTS}`,
                          gridTemplateColumns: `repeat(${TOTAL_HALF_HOUR_SLOTS}, minmax(0, 1fr))`,
                        }}
                      >
                        {/* เส้นแบ่งชั่วโมงพื้นหลัง */}
                        {Array.from({ length: 13 }).map((_, hIdx) => (
                          <div
                            key={`line-${dayCode}-${hIdx}`}
                            style={{
                              gridColumn: `${hIdx * 2 + 1} / span 2`,
                              gridRow: 1,
                            }}
                            className="pointer-events-none h-full border-r border-dashed border-slate-100"
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
                            COURSE_COLOR_PALETTE[0]

                          return (
                            <div
                              key={`${sess.course_code}-${sess.day}-${sess.start}-${sIdx}`}
                              style={{
                                gridColumn: `${startSlot} / span ${spanSlots}`,
                                gridRow: 1,
                              }}
                              onClick={() => handleSelectForEdit(sess)}
                              title={`${sess.course_code} ${sess.course_name} (${sess.start}-${sess.end}) ห้อง ${sess.room}`}
                              className={`z-10 mx-0.5 flex flex-col justify-between rounded-lg border-l-4 p-2 text-xs shadow-2xs transition ${colorTheme.bg} ${colorTheme.border} ${colorTheme.text} ${
                                canEdit ? 'cursor-pointer' : ''
                              }`}
                            >
                              <div>
                                <div className="flex flex-wrap items-center justify-between gap-1">
                                  <span className="font-mono text-xs font-extrabold">
                                    {sess.course_code}
                                  </span>
                                  {sess.online_link && (
                                    <span className="rounded bg-white/85 px-1.5 py-0.2 text-[10px] font-semibold text-rose-600">
                                      มีเรียนออนไลน์
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 line-clamp-1 font-semibold leading-snug">
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
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      ) : (
        /* มุมมองที่ 2: ตารางรายวิชาที่ลงทะเบียน (ตรงตามรูปแบบตารางเรียน ปี 4 เทอม 1) */
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="bg-orange-500 px-5 py-3 text-sm font-bold text-white">
            📖 ช่วงเรียนปกติ ({currentSemesterInfo.period})
          </div>

          {sessions.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-500">
                ยังไม่มีรายวิชาในภาคการศึกษานี้ กดปุ่ม &ldquo;โหลดตารางตัวอย่าง&rdquo; หรือ &ldquo;นำเข้า CSV&rdquo; ด้านบนเพื่อเริ่มต้น
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase">
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
                <tbody className="divide-y divide-slate-100">
                  {sessions.map((s, idx) => {
                    const colorTheme =
                      courseColorMap.get(s.course_code.toUpperCase()) ??
                      COURSE_COLOR_PALETTE[0]
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
                        className={`transition hover:bg-slate-50/80 ${
                          canEdit ? 'cursor-pointer' : ''
                        }`}
                      >
                        <td className="py-4 pl-5 pr-2 font-mono text-slate-500">
                          {idx + 1}.
                        </td>
                        <td className="py-4 px-3">
                          <div className="flex items-stretch gap-2.5">
                            <span className={`w-1 shrink-0 rounded-full ${colorTheme.bar}`} />
                            <div>
                              <div className="font-mono text-xs font-extrabold text-rose-600">
                                {s.course_code}
                              </div>
                              <div className="mt-0.5 text-sm font-bold text-slate-900">
                                {s.course_name}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-2 text-center font-mono text-sm font-extrabold text-indigo-600">
                          {s.credits}
                        </td>
                        <td className="py-4 px-2 text-center font-mono text-slate-600">
                          {s.section}
                        </td>
                        <td className="py-4 px-2 text-center text-slate-400">–</td>
                        <td className="py-4 px-2 text-center">
                          <span
                            title={dayMeta.full}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-extrabold shadow-2xs ${dayMeta.badgeClass}`}
                          >
                            {dayMeta.singleCode}
                          </span>
                        </td>
                        <td className="py-4 px-3 font-mono text-xs font-bold text-slate-800 whitespace-nowrap">
                          {s.start}–{s.end}
                        </td>
                        <td className="py-4 px-3">
                          <div className="font-mono text-xs font-bold text-slate-900">
                            📍 {s.room || '-'}
                          </div>
                          {roomDetail && (
                            <div className="mt-0.5 text-[11px] text-slate-500">
                              {roomDetail}
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-3 text-xs font-medium text-slate-800">
                          {instructorText}
                        </td>
                        <td className="py-4 px-3">
                          {s.online_link ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                                มีเรียนออนไลน์
                              </span>
                              <div className="text-[11px] font-semibold text-rose-600">
                                Click online classes
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-300">–</span>
                          )}
                        </td>
                        <td className="py-4 pr-5 text-center">
                          <span className="inline-block rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                            ไม่จัดสอบ
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ส่วนสรุปด้านล่างหน้า: จำนวนวิชา หน่วยกิตรวม และคำอธิบายอักษรย่อ */}
      <footer className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-xs">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-xs font-medium text-slate-500">จำนวนวิชา</span>
            <p className="text-xl font-extrabold text-rose-600">{summaryStats.courseCount}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500">หน่วยกิตรวม</span>
            <p className="text-xl font-extrabold text-rose-600">
              {summaryStats.totalCredits}
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          <strong>คำอธิบายเพิ่มเติม:</strong> • ภาค S หมายถึง ภาคฤดูร้อน | อักษรย่อวันเรียน:{' '}
          <strong>M</strong>=จันทร์ <strong>T</strong>=อังคาร <strong>W</strong>=พุธ{' '}
          <strong>H</strong>=พฤหัสบดี <strong>F</strong>=ศุกร์ <strong>S</strong>=เสาร์{' '}
          <strong>U</strong>=อาทิตย์
        </p>
      </footer>
    </div>
  )
}

export default ClassSchedulePage
