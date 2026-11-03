import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatStorageErrorThai, storage } from '../lib/storage'
import { useAuth } from '../lib/auth'
import type { RoutineDay, RoutineItem } from '../types'

const DAY_LABELS: Record<RoutineDay, string> = {
  ALL: 'ทุกวัน',
  MON: 'จันทร์',
  TUE: 'อังคาร',
  WED: 'พุธ',
  THU: 'พฤหัสบดี',
  FRI: 'ศุกร์',
  SAT: 'เสาร์',
  SUN: 'อาทิตย์',
}

export function LifeSchedulePage() {
  const { user } = useAuth()
  const [items, setItems] = useState<RoutineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [day, setDay] = useState<RoutineDay>('ALL')
  const [startTime, setStartTime] = useState('07:00')
  const [endTime, setEndTime] = useState('08:00')
  const [category, setCategory] = useState('กิจวัตรประจำวัน')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const loadRoutine = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const data = await storage.get<RoutineItem[]>('routine_items')
      setItems(data ?? [])
    } catch (err) {
      setErrorMessage(formatStorageErrorThai(err))
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void loadRoutine()
  }, [loadRoutine])

  async function handleAddRoutine(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    setSaving(true)
    setErrorMessage(null)

    const newItem: RoutineItem = {
      id: window.crypto.randomUUID(),
      title: title.trim(),
      day,
      start_time: startTime,
      end_time: endTime,
      category: category.trim() || 'ทั่วไป',
      notes: notes.trim(),
    }

    const updated = [...items, newItem].sort((a, b) =>
      a.start_time.localeCompare(b.start_time),
    )

    try {
      await storage.set('routine_items', updated)
      setTitle('')
      setNotes('')
      await loadRoutine()
    } catch (err) {
      setErrorMessage(formatStorageErrorThai(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveRoutine(id: string) {
    setErrorMessage(null)
    const updated = items.filter((item) => item.id !== id)
    try {
      await storage.set('routine_items', updated)
      setItems(updated)
    } catch (err) {
      setErrorMessage(formatStorageErrorThai(err))
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">ตารางชีวิต</h1>
            <p className="mt-1 text-sm text-slate-500">
              จัดการกิจวัตรประจำวันและตารางเวลาส่วนตัว (ข้อมูลส่วนนี้เป็นส่วนตัวเฉพาะบัญชีของคุณเท่านั้น)
            </p>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
            {user ? 'ซิงค์กับบัญชีส่วนตัว (Supabase RLS)' : 'โหมดบันทึกในเครื่อง (localStorage)'}
          </span>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}

        <form onSubmit={(e) => void handleAddRoutine(e)} className="mt-5 grid gap-3 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700">กิจกรรม</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น ออกกำลังกาย / ทบทวนบทเรียน"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">วัน</label>
            <select
              value={day}
              onChange={(e) => setDay(e.target.value as RoutineDay)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {Object.entries(DAY_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">เริ่ม</label>
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">สิ้นสุด</label>
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก...' : '+ เพิ่มกิจกรรม'}
            </button>
          </div>

          <div className="sm:col-span-3">
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="หมวดหมู่ (เช่น สุขภาพ, การเรียน, พักผ่อน)"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
            />
          </div>
          <div className="sm:col-span-3">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
            />
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-slate-900">รายการตารางชีวิตของคุณ ({items.length})</h2>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">กำลังโหลดข้อมูล...</p>
        ) : items.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            ยังไม่มีรายการตารางชีวิต เริ่มเพิ่มกิจกรรมด้านบนได้เลย
          </p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                      {DAY_LABELS[item.day] ?? item.day}
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-600">
                      {item.start_time} - {item.end_time}
                    </span>
                    <span className="font-semibold text-slate-900">{item.title}</span>
                    {item.category && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {item.category}
                      </span>
                    )}
                  </div>
                  {item.notes && <p className="mt-1 text-xs text-slate-500">{item.notes}</p>}
                </div>

                <button
                  type="button"
                  onClick={() => void handleRemoveRoutine(item.id)}
                  className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                >
                  ลบ
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default LifeSchedulePage
