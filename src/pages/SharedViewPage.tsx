import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Badge, Card, EmptyState, Skeleton } from '../components/ui'
import { formatSupabaseErrorThai } from '../lib/auth'
import { formatDateTimeThai } from '../lib/dateThai'
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

      {/* ตารางเรียนของกลุ่ม (อ่านอย่างเดียว) */}
      <Card>
        <h2 className="text-lg font-bold text-ink">
          ตารางเรียน ({payload.class_sessions?.length ?? 0} คาบเรียน)
        </h2>
        {!payload.class_sessions || payload.class_sessions.length === 0 ? (
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
                {payload.class_sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <Badge tone="primary">{DAY_NAMES[s.day] ?? s.day}</Badge>{' '}
                      <span className="font-mono text-xs text-ink-secondary">
                        {s.start_time} - {s.end_time}
                      </span>
                    </td>
                    <td className="py-3 pr-3 font-mono font-bold text-ink">
                      {s.course_code}
                    </td>
                    <td className="py-3 pr-3 font-medium text-ink">{s.course_name}</td>
                    <td className="py-3 pr-3 text-xs text-ink-secondary">
                      Sec {s.section.split('#')[0]}
                    </td>
                    <td className="py-3 pr-3 text-xs text-ink-secondary">{s.room || '-'}</td>
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
