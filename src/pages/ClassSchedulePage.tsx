import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import {
  DEFAULT_SAMPLE_SCHEDULE,
  formatStorageErrorThai,
  storage,
} from '../lib/storage'
import type { CourseScheduleItem, DayOfWeek } from '../types'

const DAY_NAMES: Record<DayOfWeek, string> = {
  MON: 'จันทร์',
  TUE: 'อังคาร',
  WED: 'พุธ',
  THU: 'พฤหัสบดี',
  FRI: 'ศุกร์',
  SAT: 'เสาร์',
  SUN: 'อาทิตย์',
}

export function ClassSchedulePage() {
  const { user, activeGroup, currentRole } = useAuth()
  const [sessions, setSessions] = useState<CourseScheduleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ฟอร์มเพิ่มรายวิชา
  const [courseCode, setCourseCode] = useState('')
  const [courseName, setCourseName] = useState('')
  const [credits, setCredits] = useState('3')
  const [section, setSection] = useState('001')
  const [day, setDay] = useState<DayOfWeek>('MON')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('11:30')
  const [room, setRoom] = useState('')
  const [instructor, setInstructor] = useState('')
  const [onlineLink, setOnlineLink] = useState(false)

  // สิทธิ์แก้ไข: ถ้าไม่ได้ล็อกอิน (ใช้ localStorage) แก้ไขในเครื่องได้ แต่ถ้าล็อกอินแล้วต้องมี role เป็น owner/admin/member
  const isLoggedInViewer = Boolean(user && currentRole === 'viewer')
  const canEdit = !user || currentRole === 'owner' || currentRole === 'admin' || currentRole === 'member'

  const storageKey = activeGroup ? `class_sessions:${activeGroup.id}` : 'class_sessions'

  const loadSchedule = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const data = await storage.get<CourseScheduleItem[]>(storageKey)
      setSessions(data ?? [])
    } catch (err) {
      setErrorMessage(formatStorageErrorThai(err))
    } finally {
      setLoading(false)
    }
  }, [storageKey, user?.id])

  useEffect(() => {
    void loadSchedule()
  }, [loadSchedule])

  async function handleLoadSampleSchedule() {
    if (!canEdit) return
    setSaving(true)
    setErrorMessage(null)
    try {
      await storage.set(storageKey, DEFAULT_SAMPLE_SCHEDULE)
      await loadSchedule()
    } catch (err) {
      setErrorMessage(formatStorageErrorThai(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleAddCourse(e: FormEvent) {
    e.preventDefault()
    if (!canEdit || !courseCode.trim() || !courseName.trim()) return

    setSaving(true)
    setErrorMessage(null)

    const newItem: CourseScheduleItem = {
      course_code: courseCode.trim().toUpperCase(),
      course_name: courseName.trim(),
      credits: Number(credits) || 3,
      section: section.trim() || '001',
      day,
      start,
      end,
      room: room.trim(),
      instructor: instructor.trim(),
      online_link: onlineLink,
    }

    const updated = [...sessions, newItem]
    try {
      await storage.set(storageKey, updated)
      setCourseCode('')
      setCourseName('')
      setRoom('')
      setInstructor('')
      setOnlineLink(false)
      await loadSchedule()
    } catch (err) {
      setErrorMessage(formatStorageErrorThai(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveSession(index: number) {
    if (!canEdit) return
    setErrorMessage(null)
    const updated = sessions.filter((_, idx) => idx !== index)
    try {
      await storage.set(storageKey, updated)
      await loadSchedule()
    } catch (err) {
      setErrorMessage(formatStorageErrorThai(err))
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">ตารางเรียน</h1>
            <p className="mt-1 text-sm text-slate-500">
              {activeGroup
                ? `ตารางเรียนของกลุ่ม "${activeGroup.name}"`
                : 'ตารางเรียนรายวิชาประจำสัปดาห์'}
            </p>
          </div>

          {canEdit && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleLoadSampleSchedule()}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              นำเข้าตารางเรียนตัวอย่าง (schedule.csv)
            </button>
          )}
        </div>

        {isLoggedInViewer && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-900">
            <span className="font-bold">กรอกรหัสเชิญเพื่อแก้ไข</span> — ขณะนี้คุณอยู่ในโหมดผู้ชม (อ่านอย่างเดียว)
            คุณสามารถไปที่หน้า{' '}
            <Link to="/group" className="font-semibold text-indigo-700 underline">
              จัดการกลุ่ม (/group)
            </Link>{' '}
            เพื่อกรอกรหัสเชิญหรือสร้างกลุ่มใหม่
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}

        {canEdit && (
          <form onSubmit={(e) => void handleAddCourse(e)} className="mt-5 grid gap-3 sm:grid-cols-6">
            <div>
              <label className="block text-xs font-medium text-slate-700">รหัสวิชา</label>
              <input
                type="text"
                required
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                placeholder="ICT35467"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">ชื่อรายวิชา</label>
              <input
                type="text"
                required
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="การบริหารโครงการเทคโนโลยีสารสนเทศ"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">วันเรียน</label>
              <select
                value={day}
                onChange={(e) => setDay(e.target.value as DayOfWeek)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {Object.entries(DAY_NAMES).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label} ({k})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">เวลาเริ่ม - เลิก</label>
              <div className="mt-1 flex items-center gap-1">
                <input
                  type="time"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs"
                />
                <span>-</span>
                <input
                  type="time"
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                + เพิ่มวิชา
              </button>
            </div>

            <div>
              <input
                type="text"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="กลุ่มเรียน (001)"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <input
                type="number"
                min="1"
                max="6"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                placeholder="หน่วยกิต (3)"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <input
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="ห้องเรียน (05-0704)"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <input
                type="text"
                value={instructor}
                onChange={(e) => setInstructor(e.target.value)}
                placeholder="อาจารย์ผู้สอน"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={onlineLink}
                onChange={(e) => setOnlineLink(e.target.checked)}
                className="rounded border-slate-300"
              />
              เรียนออนไลน์
            </label>
          </form>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-slate-900">รายวิชาในตารางเรียน ({sessions.length})</h2>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">กำลังโหลดตารางเรียน...</p>
        ) : sessions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            ยังไม่มีข้อมูลตารางเรียน สามารถกดปุ่ม &ldquo;นำเข้าตารางเรียนตัวอย่าง (schedule.csv)&rdquo; ด้านบนได้
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                  <th className="py-2 pr-3">วัน/เวลา</th>
                  <th className="py-2 pr-3">รหัสวิชา</th>
                  <th className="py-2 pr-3">ชื่อรายวิชา</th>
                  <th className="py-2 pr-3">ตอนเรียน</th>
                  <th className="py-2 pr-3">ห้องเรียน</th>
                  <th className="py-2 pr-3">ผู้สอน</th>
                  {canEdit && <th className="py-2 text-right">จัดการ</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((s, idx) => (
                  <tr key={`${s.course_code}-${s.day}-${s.start}-${idx}`}>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                        {DAY_NAMES[s.day] ?? s.day}
                      </span>{' '}
                      <span className="font-mono text-xs text-slate-600">
                        {s.start} - {s.end}
                      </span>
                    </td>
                    <td className="py-3 pr-3 font-mono font-semibold text-slate-900">
                      {s.course_code}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="font-medium text-slate-900">{s.course_name}</div>
                      <div className="text-xs text-slate-400">{s.credits} หน่วยกิต</div>
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-600">Sec {s.section}</td>
                    <td className="py-3 pr-3 text-xs text-slate-600">
                      {s.room || '-'}{' '}
                      {s.online_link && (
                        <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                          ออนไลน์
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-600">{s.instructor || '-'}</td>
                    {canEdit && (
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void handleRemoveSession(idx)}
                          className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                        >
                          ลบ
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default ClassSchedulePage
