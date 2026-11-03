import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { formatSupabaseErrorThai } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { DayOfWeek, SharedViewPayload, TaskStatus, TaskType } from '../types'

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
  homework: 'การบ้าน',
  work: 'งานกลุ่ม/โปรเจกต์',
  exam: 'สอบ',
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'รอดำเนินการ',
  in_progress: 'กำลังทำ',
  done: 'เสร็จแล้ว',
}

export function SharedViewPage() {
  const { token } = useParams<{ token: string }>()
  const [payload, setPayload] = useState<SharedViewPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <p className="text-sm text-slate-600">กำลังโหลดข้อมูลลิงก์แชร์...</p>
      </section>
    )
  }

  if (errorMessage || !payload) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-6 shadow-xs">
        <h1 className="text-xl font-bold text-rose-900">ไม่สามารถเปิดลิงก์แชร์นี้ได้</h1>
        <p className="mt-2 text-sm text-rose-700">
          {errorMessage ?? 'ลิงก์แชร์ไม่ถูกต้องหรือถูกยกเลิกโดยเจ้าของกลุ่มแล้ว'}
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="rounded-full bg-indigo-600 px-3 py-0.5 text-xs font-semibold text-white">
              ลิงก์แชร์ดูอย่างเดียว (ไม่ต้องล็อกอิน)
            </span>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              กลุ่ม: {payload.group?.name}
            </h1>
            {payload.group?.description && (
              <p className="mt-1 text-sm text-slate-600">{payload.group.description}</p>
            )}
          </div>
          <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            สิทธิ์: ผู้ชม (อ่านอย่างเดียว)
          </span>
        </div>
      </section>

      {/* ตารางเรียนของกลุ่ม (อ่านอย่างเดียว) */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-slate-900">
          ตารางเรียน ({payload.class_sessions?.length ?? 0} คาบเรียน)
        </h2>
        {!payload.class_sessions || payload.class_sessions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">ยังไม่มีข้อมูลตารางเรียนในกลุ่มนี้</p>
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
                  <th className="py-2">ผู้สอน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payload.class_sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                        {DAY_NAMES[s.day] ?? s.day}
                      </span>{' '}
                      <span className="font-mono text-xs text-slate-600">
                        {s.start_time} - {s.end_time}
                      </span>
                    </td>
                    <td className="py-3 pr-3 font-mono font-semibold text-slate-900">
                      {s.course_code}
                    </td>
                    <td className="py-3 pr-3 font-medium text-slate-900">{s.course_name}</td>
                    <td className="py-3 pr-3 text-xs text-slate-600">Sec {s.section}</td>
                    <td className="py-3 pr-3 text-xs text-slate-600">{s.room || '-'}</td>
                    <td className="py-3 text-xs text-slate-600">{s.instructor || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* รายการงาน/การบ้าน/สอบ (อ่านอย่างเดียว ไม่แสดงอีเมลสมาชิก) */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-slate-900">
          งาน/การบ้าน/สอบ ({payload.tasks?.length ?? 0} รายการ)
        </h2>
        {!payload.tasks || payload.tasks.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">ยังไม่มีรายการงานในกลุ่มนี้</p>
        ) : (
          <div className="mt-4 space-y-3">
            {payload.tasks.map((t) => (
              <div
                key={t.id}
                className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                      {TASK_TYPE_LABELS[t.task_type] ?? t.task_type}
                    </span>
                    {t.course_code && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                        {t.course_code}
                      </span>
                    )}
                    <h3 className="font-bold text-slate-900">{t.title}</h3>
                  </div>
                  {t.description && (
                    <p className="mt-1 text-xs text-slate-600">{t.description}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>
                      กำหนดส่ง:{' '}
                      <strong>
                        {t.due_date
                          ? new Date(t.due_date).toLocaleString('th-TH')
                          : 'ไม่ระบุ'}
                      </strong>
                    </span>
                    {t.assignee_names && t.assignee_names.length > 0 && (
                      <span>ผู้รับผิดชอบ: {t.assignee_names.join(', ')}</span>
                    )}
                  </div>
                </div>

                <span className="self-start rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 sm:self-center">
                  {STATUS_LABELS[t.status] ?? t.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default SharedViewPage
