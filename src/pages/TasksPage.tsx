import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
  Toast,
} from '../components/ui'
import { formatSupabaseErrorThai, useAuth } from '../lib/auth'
import { formatDateTimeThai, getRelativeCountdownThai } from '../lib/dateThai'
import { formatStorageErrorThai, localStore, storage } from '../lib/storage'
import { supabase } from '../lib/supabase'
import type { TaskItem, TaskStatus, TaskType } from '../types'

const TASK_TYPE_META: Record<
  TaskType,
  { icon: string; label: string; tone: 'sky' | 'primary' | 'pink' }
> = {
  homework: { icon: '📘', label: 'การบ้าน', tone: 'sky' },
  work: { icon: '🛠️', label: 'งานกลุ่ม/โปรเจกต์', tone: 'primary' },
  exam: { icon: '🎯', label: 'สอบ', tone: 'pink' },
}

const STATUS_META: Record<
  TaskStatus,
  { icon: string; label: string; tone: 'warning' | 'sky' | 'success' }
> = {
  todo: { icon: '⏳', label: 'รอดำเนินการ', tone: 'warning' },
  in_progress: { icon: '⚡', label: 'กำลังทำ', tone: 'sky' },
  done: { icon: '✓', label: 'เสร็จแล้ว', tone: 'success' },
}

export function TasksPage() {
  const { user, activeGroup, members, currentRole } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)

  // ฟอร์มสร้างงานใหม่ (เฉพาะ owner/admin หรือโหมด localStorage)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [taskType, setTaskType] = useState<TaskType>('homework')
  const [courseCode, setCourseCode] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [examRoom, setExamRoom] = useState('')
  const [examTopics, setExamTopics] = useState('')
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])

  const isLoggedInViewer = Boolean(user && currentRole === 'viewer')
  const isOwnerOrAdmin = !user || currentRole === 'owner' || currentRole === 'admin'

  const filterCourseParam = (searchParams.get('course') ?? '').trim().toUpperCase()
  const prefillTypeParam = searchParams.get('type') as TaskType | null

  // เมื่อเปิดมาจากป็อปอัพรายวิชา (?course=<code>&type=<homework|exam>) ให้เลือกวิชานั้นให้อัตโนมัติ
  useEffect(() => {
    if (filterCourseParam) {
      setCourseCode(filterCourseParam)
      if (
        prefillTypeParam === 'homework' ||
        prefillTypeParam === 'work' ||
        prefillTypeParam === 'exam'
      ) {
        setTaskType(prefillTypeParam)
      }
      if (isOwnerOrAdmin) {
        setShowCreateForm(true)
      }
    }
  }, [filterCourseParam, prefillTypeParam, isOwnerOrAdmin])

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
          exam_room: taskType === 'exam' ? examRoom.trim() : '',
          exam_topics: taskType === 'exam' ? examTopics.trim() : '',
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

        const baseInsert = {
          group_id: activeGroup.id,
          title: title.trim(),
          description: description.trim(),
          task_type: taskType,
          course_code: courseCode.trim().toUpperCase(),
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          status: 'todo' as const,
          assignee_ids: assignees,
          created_by: user.id,
        }

        const { error } = await supabase.from('tasks').insert({
          ...baseInsert,
          exam_room: taskType === 'exam' ? examRoom.trim() : '',
          exam_topics: taskType === 'exam' ? examTopics.trim() : '',
        })

        if (error) {
          if (error.message?.includes('exam_room') || error.message?.includes('column')) {
            const { error: fallbackError } = await supabase
              .from('tasks')
              .insert(baseInsert)
            if (fallbackError) throw fallbackError
          } else {
            throw error
          }
        }
        await loadTasks()
      }

      setTitle('')
      setDescription('')
      setCourseCode(filterCourseParam || '')
      setDueDate('')
      setExamRoom('')
      setExamTopics('')
      setSelectedAssignees([])
      setShowCreateForm(false)
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

  const filteredTasks = filterCourseParam
    ? tasks.filter(
        (t) => (t.course_code || '').trim().toUpperCase() === filterCourseParam,
      )
    : tasks

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-ink sm:text-2xl">งาน/การบ้าน/สอบ</h1>
              {filterCourseParam && (
                <Badge tone="primary">กรองวิชา: {filterCourseParam}</Badge>
              )}
              {isLoggedInViewer && <Badge tone="warning">👁️ โหมดดูอย่างเดียว</Badge>}
            </div>
            <p className="mt-1 text-xs text-ink-muted sm:text-sm">
              ติดตามงานที่ได้รับมอบหมาย กำหนดส่งแบบไทย (พ.ศ.) ห้องสอบ และผู้รับผิดชอบต่องาน
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {filterCourseParam && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchParams({})}
              >
                แสดงทุกวิชา
              </Button>
            )}
            {isOwnerOrAdmin && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowCreateForm((prev) => !prev)}
              >
                {showCreateForm ? 'ซ่อนฟอร์มสร้างงาน' : '+ สร้างงาน/นัดสอบใหม่'}
              </Button>
            )}
          </div>
        </div>

        {isLoggedInViewer && (
          <div className="mt-4 rounded-xl border border-status-warning bg-status-warning-soft p-3.5 text-sm text-status-warning-fg">
            <span className="font-bold">โหมดดูอย่างเดียว (กรอกรหัสเชิญเพื่อแก้ไข)</span> —
            คุณสามารถดูรายการงานและกำหนดส่งได้ แต่ไม่สามารถเพิ่มหรือแก้ไขสถานะงาน ไปที่หน้า{' '}
            <Link to="/group" className="font-bold underline">
              จัดการกลุ่ม (/group)
            </Link>{' '}
            เพื่อกรอกรหัสเชิญเข้ากลุ่ม
          </div>
        )}

        {user && currentRole === 'member' && (
          <div className="mt-4 rounded-xl border border-status-success bg-status-success-soft p-3 text-xs text-status-success-fg">
            สิทธิ์ของคุณคือ <strong>ผู้แก้ไข (Member)</strong>: คุณสามารถเปลี่ยนสถานะของงานที่คุณเป็นผู้รับผิดชอบได้
            (การสร้างงานใหม่และแก้กำหนดส่งสงวนไว้สำหรับผู้ดูแลและเจ้าของกลุ่ม)
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

        {isOwnerOrAdmin && showCreateForm && (
          <form
            onSubmit={(e) => void handleCreateTask(e)}
            className="mt-5 space-y-3 rounded-2xl border border-line bg-surface-alt p-4"
          >
            <h2 className="text-sm font-bold text-ink">
              สร้างและมอบหมายงานใหม่ (สำหรับเจ้าของกลุ่ม / ผู้ดูแล)
            </h2>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-ink-secondary">
                  หัวข้องาน/การบ้าน/สอบ *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น ส่งรายงานบทที่ 3 / สอบกลางภาค"
                  className="mt-1 min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm text-ink"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-secondary">ประเภท</label>
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as TaskType)}
                  className="mt-1 min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm text-ink"
                >
                  <option value="homework">📘 การบ้าน</option>
                  <option value="work">🛠️ งานกลุ่ม/โปรเจกต์</option>
                  <option value="exam">🎯 สอบ</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-secondary">
                  รหัสวิชา (ถ้ามี)
                </label>
                <input
                  type="text"
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  placeholder="ICT35467"
                  className="mt-1 min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm text-ink uppercase"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-ink-secondary">
                  รายละเอียดเพิ่มเติม
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="รายละเอียดการส่งงานหรือข้อกำหนด"
                  className="mt-1 min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm text-ink"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-secondary">
                  กำหนดส่ง / วันสอบ
                </label>
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 min-h-[44px] sm:min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-xs text-ink"
                />
              </div>

              <div className="flex items-end">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={saving}
                  className="w-full"
                >
                  {saving ? 'กำลังสร้าง...' : 'บันทึกงาน'}
                </Button>
              </div>
            </div>

            {taskType === 'exam' && (
              <div className="grid gap-3 rounded-xl border border-accent-pink/50 bg-accent-pink-soft/20 p-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-accent-pink-fg">
                    📍 ห้องสอบ (exam_room)
                  </label>
                  <input
                    type="text"
                    value={examRoom}
                    onChange={(e) => setExamRoom(e.target.value)}
                    placeholder="เช่น 05-0704 อาคาร 5 ชั้น 7"
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-accent-pink-fg">
                    📖 หัวข้อที่ออกสอบ (exam_topics)
                  </label>
                  <input
                    type="text"
                    value={examTopics}
                    onChange={(e) => setExamTopics(e.target.value)}
                    placeholder="เช่น บทที่ 1–5 การบริหารโครงการ, CPM/PERT"
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink"
                  />
                </div>
              </div>
            )}

            {members.length > 0 && (
              <div className="pt-1">
                <span className="block text-xs font-medium text-ink-secondary">
                  มอบหมายผู้รับผิดชอบ (เลือกได้หลายคน):
                </span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {members.map((m) => {
                    const checked = selectedAssignees.includes(m.user_id)
                    return (
                      <label
                        key={m.user_id}
                        className={`inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                          checked
                            ? 'border-primary bg-primary-soft text-primary-fg'
                            : 'border-line bg-surface text-ink-secondary hover:bg-surface-hover'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAssignee(m.user_id)}
                          className="rounded border-line-strong"
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
      </Card>

      {loading ? (
        <Skeleton lines={4} label="อีกาตัวน้อยกำลังดึงรายการงานให้คุณ..." />
      ) : filteredTasks.length === 0 ? (
        <Card>
          <EmptyState
            mood="happy"
            title={
              filterCourseParam
                ? `ไม่มีรายการงานหรือสอบของวิชา ${filterCourseParam}`
                : 'ยังไม่มีรายการงาน การบ้าน หรือตารางสอบ'
            }
            description="เมื่อมีการสร้างงานใหม่ในกลุ่ม รายการงานและกำหนดส่งจะแสดงที่นี่ทันที"
            action={
              isOwnerOrAdmin ? (
                <Button variant="primary" size="sm" onClick={() => setShowCreateForm(true)}>
                  + สร้างงาน/นัดสอบใหม่
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card>
          <h2 className="text-base font-bold text-ink">
            รายการงานทั้งหมด ({filteredTasks.length})
          </h2>
          <div className="mt-4 space-y-3">
            {filteredTasks.map((t) => {
              const isAssignedToMe = Boolean(user && t.assignee_ids?.includes(user.id))
              const canChangeStatus =
                isOwnerOrAdmin || (currentRole === 'member' && isAssignedToMe)
              const typeMeta = TASK_TYPE_META[t.task_type] ?? TASK_TYPE_META.homework
              const statusMeta = STATUS_META[t.status] ?? STATUS_META.todo
              const countdown = getRelativeCountdownThai(t.due_date)

              return (
                <div
                  key={t.id}
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-line bg-surface-alt p-4 sm:flex-row sm:items-center"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={typeMeta.tone}>
                        <span>{typeMeta.icon}</span>
                        <span>{typeMeta.label}</span>
                      </Badge>
                      <Badge tone={statusMeta.tone}>
                        <span>{statusMeta.icon}</span>
                        <span>{statusMeta.label}</span>
                      </Badge>
                      {t.due_date && t.status !== 'done' && (
                        <Badge
                          tone={
                            countdown.isOverdue
                              ? 'danger'
                              : countdown.isUrgent
                                ? 'warning'
                                : 'sky'
                          }
                        >
                          ⏰ {countdown.text}
                        </Badge>
                      )}
                      {t.course_code && (
                        <Link
                          to={`/schedule?course=${encodeURIComponent(t.course_code)}`}
                          className="rounded-lg border border-line bg-surface px-2 py-0.5 font-mono text-xs font-bold text-primary hover:underline"
                          title="คลิกเพื่อเปิดป็อปอัพรายวิชานี้"
                        >
                          {t.course_code}
                        </Link>
                      )}
                      <h3 className="font-bold text-ink">{t.title}</h3>
                    </div>

                    {t.description && (
                      <p className="text-xs text-ink-secondary">{t.description}</p>
                    )}

                    {t.task_type === 'exam' && (t.exam_room || t.exam_topics) && (
                      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs">
                        {t.exam_room && (
                          <span className="font-semibold text-ink">
                            📍 ห้องสอบ: <span className="text-primary">{t.exam_room}</span>
                          </span>
                        )}
                        {t.exam_topics && (
                          <span className="text-ink-secondary">
                            📖 หัวข้อสอบ: <strong>{t.exam_topics}</strong>
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-ink-muted">
                      <span>
                        📅 กำหนดส่ง:{' '}
                        <strong className="text-ink-secondary">
                          {formatDateTimeThai(t.due_date)}
                        </strong>
                      </span>

                      {t.assignee_ids && t.assignee_ids.length > 0 && (
                        <span>
                          👤 ผู้รับผิดชอบ:{' '}
                          <strong className="text-ink-secondary">
                            {t.assignee_ids
                              .map((uid) => memberNameMap.get(uid) ?? 'สมาชิก')
                              .join(', ')}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {canChangeStatus && (
                      <select
                        aria-label={`สถานะของงาน ${t.title}`}
                        value={t.status}
                        onChange={(e) =>
                          void handleUpdateStatus(t, e.target.value as TaskStatus)
                        }
                        className="min-h-[44px] sm:min-h-[36px] rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-xs font-semibold text-ink"
                      >
                        <option value="todo">⏳ รอดำเนินการ</option>
                        <option value="in_progress">⚡ กำลังทำ</option>
                        <option value="done">✓ เสร็จแล้ว</option>
                      </select>
                    )}

                    {isOwnerOrAdmin && (
                      <>
                        <input
                          type="date"
                          aria-label={`แก้กำหนดส่งของ ${t.title}`}
                          value={t.due_date ? t.due_date.slice(0, 10) : ''}
                          onChange={(e) => void handleUpdateDueDate(t, e.target.value)}
                          className="min-h-[44px] sm:min-h-[36px] rounded-xl border border-line-strong bg-surface px-2.5 py-1 text-xs text-ink"
                          title="แก้ไขกำหนดส่ง (เฉพาะผู้ดูแล/เจ้าของ)"
                        />
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => void handleDeleteTask(t.id)}
                        >
                          ลบ
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ปุ่มเพิ่มเร็วลอยมุมล่างขวาบนมือถือ (เฉพาะผู้ที่มีสิทธิ์สร้างงาน) */}
      {isOwnerOrAdmin && (
        <button
          type="button"
          onClick={() => {
            setShowCreateForm(true)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          aria-label="สร้างงานด่วน"
          className="fixed right-4 bottom-20 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl font-bold text-ink-inverted shadow-lg transition hover:bg-primary-hover sm:hidden"
        >
          +
        </button>
      )}
    </div>
  )
}

export default TasksPage
