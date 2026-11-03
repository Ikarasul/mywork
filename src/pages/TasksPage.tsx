import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { formatSupabaseErrorThai, useAuth } from '../lib/auth'
import { formatStorageErrorThai, localStore, storage } from '../lib/storage'
import { supabase } from '../lib/supabase'
import type { TaskItem, TaskStatus, TaskType } from '../types'

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

export function TasksPage() {
  const { user, activeGroup, members, currentRole } = useAuth()
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ฟอร์มสร้างงานใหม่ (เฉพาะ owner/admin หรือโหมด localStorage)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [taskType, setTaskType] = useState<TaskType>('homework')
  const [courseCode, setCourseCode] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])

  const isLoggedInViewer = Boolean(user && currentRole === 'viewer')
  const isOwnerOrAdmin = !user || currentRole === 'owner' || currentRole === 'admin'

  const storageKey = activeGroup ? `tasks:${activeGroup.id}` : 'tasks'

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const data = await storage.get<TaskItem[]>(storageKey)
      setTasks(data ?? [])
    } catch (err) {
      setErrorMessage(formatStorageErrorThai(err))
    } finally {
      setLoading(false)
    }
  }, [storageKey, user?.id])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  // Subscribe Supabase Realtime สำหรับตาราง tasks
  useEffect(() => {
    const client = supabase
    if (!client || !user || !activeGroup) return
    const channel = client
      .channel(`tasks:${activeGroup.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `group_id=eq.${activeGroup.id}`,
        },
        () => {
          void loadTasks()
        },
      )
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [user, activeGroup, loadTasks])

  function toggleAssignee(userId: string) {
    setSelectedAssignees((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    )
  }

  async function handleCreateTask(e: FormEvent) {
    e.preventDefault()
    if (!isOwnerOrAdmin || !title.trim()) return

    setSaving(true)
    setErrorMessage(null)

    try {
      if (!user || !supabase) {
        const newLocalTask: TaskItem = {
          id: window.crypto.randomUUID(),
          title: title.trim(),
          description: description.trim(),
          task_type: taskType,
          course_code: courseCode.trim().toUpperCase(),
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          status: 'todo',
          assignee_ids: [],
          created_at: new Date().toISOString(),
        }
        const updated = [newLocalTask, ...tasks]
        await localStore.set('tasks', updated)
        setTasks(updated)
      } else {
        if (!activeGroup) {
          throw new Error('กรุณาสร้างหรือเลือกกลุ่มในหน้า /group ก่อนสร้างงาน')
        }
        const assignees =
          selectedAssignees.length > 0 ? selectedAssignees : [user.id]

        const { error } = await supabase.from('tasks').insert({
          group_id: activeGroup.id,
          title: title.trim(),
          description: description.trim(),
          task_type: taskType,
          course_code: courseCode.trim().toUpperCase(),
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          status: 'todo',
          assignee_ids: assignees,
          created_by: user.id,
        })

        if (error) throw error
        await loadTasks()
      }

      setTitle('')
      setDescription('')
      setCourseCode('')
      setDueDate('')
      setSelectedAssignees([])
    } catch (err) {
      setErrorMessage(formatSupabaseErrorThai(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateStatus(task: TaskItem, newStatus: TaskStatus) {
    setErrorMessage(null)
    try {
      if (!user || !supabase) {
        const updated = tasks.map((t) =>
          t.id === task.id ? { ...t, status: newStatus } : t,
        )
        await localStore.set('tasks', updated)
        setTasks(updated)
        return
      }

      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', task.id)

      if (error) throw error
      await loadTasks()
    } catch (err) {
      setErrorMessage(formatSupabaseErrorThai(err))
    }
  }

  async function handleUpdateDueDate(task: TaskItem, newDateStr: string) {
    if (!isOwnerOrAdmin) return
    setErrorMessage(null)
    try {
      const isoDate = newDateStr ? new Date(newDateStr).toISOString() : null
      if (!user || !supabase) {
        const updated = tasks.map((t) =>
          t.id === task.id ? { ...t, due_date: isoDate } : t,
        )
        await localStore.set('tasks', updated)
        setTasks(updated)
        return
      }

      const { error } = await supabase
        .from('tasks')
        .update({ due_date: isoDate })
        .eq('id', task.id)

      if (error) throw error
      await loadTasks()
    } catch (err) {
      setErrorMessage(formatSupabaseErrorThai(err))
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!isOwnerOrAdmin) return
    setErrorMessage(null)
    try {
      if (!user || !supabase) {
        const updated = tasks.filter((t) => t.id !== taskId)
        await localStore.set('tasks', updated)
        setTasks(updated)
        return
      }

      const { error } = await supabase.from('tasks').delete().eq('id', taskId)
      if (error) throw error
      await loadTasks()
    } catch (err) {
      setErrorMessage(formatSupabaseErrorThai(err))
    }
  }

  const memberNameMap = new Map<string, string>()
  for (const m of members) {
    memberNameMap.set(m.user_id, m.display_name)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">งาน/การบ้าน/สอบ</h1>
            <p className="mt-1 text-sm text-slate-500">
              ติดตามงานที่ได้รับมอบหมาย กำหนดส่ง และผู้รับผิดชอบต่องาน
            </p>
          </div>
        </div>

        {isLoggedInViewer && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-900">
            <span className="font-bold">กรอกรหัสเชิญเพื่อแก้ไข</span> — ขณะนี้คุณอยู่ในโหมดผู้ชม (อ่านอย่างเดียว)
            ไปที่หน้า{' '}
            <Link to="/group" className="font-semibold text-indigo-700 underline">
              จัดการกลุ่ม (/group)
            </Link>{' '}
            เพื่อกรอกรหัสเชิญเข้ากลุ่ม
          </div>
        )}

        {user && currentRole === 'member' && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            สิทธิ์ของคุณคือ <strong>ผู้แก้ไข (Member)</strong>: คุณสามารถเปลี่ยนสถานะของงานที่คุณเป็นผู้รับผิดชอบได้
            (การสร้างงานใหม่และแก้กำหนดส่งสงวนไว้สำหรับผู้ดูแลและเจ้าของกลุ่ม)
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}

        {isOwnerOrAdmin && (
          <form onSubmit={(e) => void handleCreateTask(e)} className="mt-5 space-y-3 border-t border-slate-100 pt-4">
            <h2 className="text-sm font-bold text-slate-800">
              สร้างและมอบหมายงานใหม่ (สำหรับเจ้าของกลุ่ม / ผู้ดูแล)
            </h2>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700">หัวข้องาน/การบ้าน/สอบ</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น ส่งรายงานบทที่ 3 / สอบกลางภาค"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">ประเภท</label>
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as TaskType)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="homework">การบ้าน</option>
                  <option value="work">งานกลุ่ม/โปรเจกต์</option>
                  <option value="exam">สอบ</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">รหัสวิชา (ถ้ามี)</label>
                <input
                  type="text"
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  placeholder="ICT35467"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700">รายละเอียดเพิ่มเติม</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="รายละเอียดการส่งงานหรือขอบเขตเนื้อหา"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">กำหนดส่ง / วันสอบ</label>
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'กำลังสร้าง...' : '+ สร้างงาน'}
                </button>
              </div>
            </div>

            {members.length > 0 && (
              <div className="pt-1">
                <span className="block text-xs font-medium text-slate-700">
                  มอบหมายผู้รับผิดชอบ (เลือกได้หลายคน):
                </span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {members.map((m) => {
                    const checked = selectedAssignees.includes(m.user_id)
                    return (
                      <label
                        key={m.user_id}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          checked
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAssignee(m.user_id)}
                          className="rounded border-slate-300"
                        />
                        {m.display_name}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </form>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-slate-900">รายการงานทั้งหมด ({tasks.length})</h2>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">กำลังโหลดรายการงาน...</p>
        ) : tasks.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">ยังไม่มีรายการงานในกลุ่มนี้</p>
        ) : (
          <div className="mt-4 space-y-3">
            {tasks.map((t) => {
              const isAssignedToMe = Boolean(user && t.assignee_ids?.includes(user.id))
              const canChangeStatus =
                isOwnerOrAdmin || (currentRole === 'member' && isAssignedToMe)

              return (
                <div
                  key={t.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center"
                >
                  <div className="space-y-1">
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
                      <p className="text-xs text-slate-600">{t.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-500">
                      <span>
                        กำหนดส่ง:{' '}
                        <strong>
                          {t.due_date
                            ? new Date(t.due_date).toLocaleString('th-TH')
                            : 'ไม่ระบุ'}
                        </strong>
                      </span>

                      {t.assignee_ids && t.assignee_ids.length > 0 && (
                        <span>
                          ผู้รับผิดชอบ:{' '}
                          {t.assignee_ids
                            .map((uid) => memberNameMap.get(uid) ?? 'สมาชิก')
                            .join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {canChangeStatus ? (
                      <select
                        aria-label={`สถานะของงาน ${t.title}`}
                        value={t.status}
                        onChange={(e) =>
                          void handleUpdateStatus(t, e.target.value as TaskStatus)
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                      >
                        <option value="todo">{STATUS_LABELS.todo}</option>
                        <option value="in_progress">{STATUS_LABELS.in_progress}</option>
                        <option value="done">{STATUS_LABELS.done}</option>
                      </select>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {STATUS_LABELS[t.status] ?? t.status}
                      </span>
                    )}

                    {isOwnerOrAdmin && (
                      <>
                        <input
                          type="date"
                          aria-label={`แก้กำหนดส่งของ ${t.title}`}
                          value={t.due_date ? t.due_date.slice(0, 10) : ''}
                          onChange={(e) => void handleUpdateDueDate(t, e.target.value)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs"
                          title="แก้ไขกำหนดส่ง (เฉพาะผู้ดูแล/เจ้าของ)"
                        />
                        <button
                          type="button"
                          onClick={() => void handleDeleteTask(t.id)}
                          className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                        >
                          ลบ
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

export default TasksPage
