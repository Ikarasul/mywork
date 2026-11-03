import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  IconEye,
  IconMessageCircle,
  IconPin,
} from '../components/icons'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
  Toast,
} from '../components/ui'
import { formatSupabaseErrorThai, useAuth } from '../lib/auth'
import { formatTimeThai } from '../lib/dateThai'
import { supabase } from '../lib/supabase'
import type { ChatMessageItem } from '../types'

export function GroupChatPage() {
  const { user, displayName, activeGroup, currentRole } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const courseTagParam = (searchParams.get('course') ?? '').trim().toUpperCase()

  const isLoggedInViewer = Boolean(user && currentRole === 'viewer')
  const canChat =
    Boolean(user && activeGroup) &&
    (currentRole === 'owner' || currentRole === 'admin' || currentRole === 'member')

  const loadMessages = useCallback(async () => {
    if (!supabase || !user || !activeGroup) {
      setMessages([])
      return
    }
    setLoading(true)
    setErrorMessage(null)
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('group_id', activeGroup.id)
        .order('created_at', { ascending: true })

      if (error) throw error
      setMessages((data ?? []) as ChatMessageItem[])
    } catch (err) {
      setErrorMessage(formatSupabaseErrorThai(err))
    } finally {
      setLoading(false)
    }
  }, [user, activeGroup])

  useEffect(() => {
    void loadMessages()
  }, [loadMessages])

  // Supabase Realtime subscription สำหรับข้อความแชทกลุ่ม
  useEffect(() => {
    const client = supabase
    if (!client || !user || !activeGroup) return

    const channel = client
      .channel(`messages:${activeGroup.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `group_id=eq.${activeGroup.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new as ChatMessageItem
            setMessages((prev) =>
              prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg],
            )
          } else if (payload.eventType === 'UPDATE') {
            const updatedMsg = payload.new as ChatMessageItem
            setMessages((prev) =>
              prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m)),
            )
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id?: string }).id
            if (oldId) {
              setMessages((prev) => prev.filter((m) => m.id !== oldId))
            }
          }
        },
      )
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [user, activeGroup])

  async function handleSendMessage(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !user || !activeGroup || !canChat) return
    const trimmed = content.trim()
    if (!trimmed) return

    const finalContent =
      courseTagParam && !trimmed.toUpperCase().includes(courseTagParam)
        ? `[#${courseTagParam}] ${trimmed}`
        : trimmed

    setSending(true)
    setErrorMessage(null)

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          group_id: activeGroup.id,
          sender_id: user.id,
          sender_name: displayName || 'สมาชิก',
          content: finalContent,
          pinned: false,
        })
        .select('*')
        .single()

      if (error) throw error
      setContent('')
      if (data) {
        const inserted = data as ChatMessageItem
        setMessages((prev) =>
          prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted],
        )
      }
    } catch (err) {
      setErrorMessage(formatSupabaseErrorThai(err))
    } finally {
      setSending(false)
    }
  }

  async function handleTogglePin(msg: ChatMessageItem) {
    if (!supabase || !canChat) return
    setErrorMessage(null)
    try {
      const { error } = await supabase
        .from('messages')
        .update({ pinned: !msg.pinned })
        .eq('id', msg.id)

      if (error) throw error
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, pinned: !msg.pinned } : m)),
      )
    } catch (err) {
      setErrorMessage(formatSupabaseErrorThai(err))
    }
  }

  const displayedMessages = courseTagParam
    ? messages.filter((m) => m.content.toUpperCase().includes(courseTagParam))
    : messages
  const pinnedMessages = displayedMessages.filter((m) => m.pinned)

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-ink sm:text-2xl">แชทกลุ่ม</h1>
              {courseTagParam && (
                <Badge tone="primary" className="inline-flex items-center gap-1">
                  <IconMessageCircle className="h-3 w-3 shrink-0" />
                  <span>ห้องแชทวิชา #{courseTagParam}</span>
                </Badge>
              )}
              {isLoggedInViewer && (
                <Badge tone="warning" className="inline-flex items-center gap-1">
                  <IconEye className="h-3 w-3 shrink-0" />
                  <span>โหมดดูอย่างเดียว</span>
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-muted sm:text-sm">
              {activeGroup
                ? `ห้องสนทนาเรียลไทม์ของกลุ่ม "${activeGroup.name}"`
                : 'ห้องสนทนาแลกเปลี่ยนข้อมูลในกลุ่มเรียน (Supabase Realtime)'}
            </p>
          </div>
          {courseTagParam && (
            <div className="flex items-center gap-2">
              <Link to={`/schedule?course=${encodeURIComponent(courseTagParam)}`}>
                <Button variant="outline" size="sm">
                  ← กลับไปป็อปอัพวิชา {courseTagParam}
                </Button>
              </Link>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSearchParams({})}
              >
                ดูข้อความทุกวิชา
              </Button>
            </div>
          )}
        </div>

        {!user && (
          <div className="mt-4">
            <EmptyState
              mood="idle"
              title="เข้าสู่ระบบเพื่อใช้งานแชทกลุ่มเรียลไทม์"
              description="พูดคุย ปรึกษางานกลุ่ม และปักหมุดข้อความสำคัญร่วมกับเพื่อนในกลุ่มเรียน"
              action={
                <Link to="/login">
                  <Button variant="primary" size="sm">
                    ไปหน้าเข้าสู่ระบบ (/login)
                  </Button>
                </Link>
              }
            />
          </div>
        )}

        {isLoggedInViewer && (
          <div className="mt-4 rounded-xl border border-status-warning bg-status-warning-soft p-3.5 text-sm text-status-warning-fg">
            <span className="font-bold">โหมดดูอย่างเดียว (กรอกรหัสเชิญเพื่อแก้ไข)</span> —
            คุณมีสิทธิ์เป็นผู้ชม จึงยังไม่สามารถส่งข้อความหรือปักหมุดแชทได้ กรุณาไปที่หน้า{' '}
            <Link to="/group" className="font-bold underline">
              จัดการกลุ่ม (/group)
            </Link>{' '}
            เพื่อกรอกรหัสเชิญ
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

        {/* ส่วนข้อความที่ปักหมุด */}
        {pinnedMessages.length > 0 && (
          <div className="mt-4 rounded-xl border border-accent-amber bg-accent-amber-soft/50 p-3.5">
            <h2 className="flex items-center gap-1.5 text-xs font-bold text-accent-amber-fg uppercase">
              <IconPin className="h-3.5 w-3.5 shrink-0" />
              <span>ข้อความที่ปักหมุดไว้ ({pinnedMessages.length})</span>
            </h2>
            <div className="mt-2 space-y-1.5">
              {pinnedMessages.map((pm) => (
                <div
                  key={`pin-${pm.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs"
                >
                  <div>
                    <strong className="text-primary">{pm.sender_name}:</strong>{' '}
                    <span className="text-ink">{pm.content}</span>
                  </div>
                  {canChat && (
                    <button
                      type="button"
                      onClick={() => void handleTogglePin(pm)}
                      className="min-h-[32px] px-2 text-[11px] font-semibold text-accent-amber hover:underline"
                    >
                      เลิกปักหมุด
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* รายการข้อความแชท */}
        {user && activeGroup && (
          <div className="mt-4 flex h-[420px] flex-col justify-between rounded-2xl border border-line bg-surface-alt p-4">
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {loading ? (
                <Skeleton lines={3} label="กำลังโหลดข้อความแชท..." />
              ) : displayedMessages.length === 0 ? (
                <EmptyState
                  mood="happy"
                  title={
                    courseTagParam
                      ? `ยังไม่มีข้อความในห้องวิชา #${courseTagParam}`
                      : 'ยังไม่มีข้อความในกลุ่มนี้'
                  }
                  description="ทักทายเพื่อนในกลุ่มเพื่อเริ่มต้นสนทนาได้เลย!"
                />
              ) : (
                displayedMessages.map((msg) => {
                  const isMine = msg.sender_id === user.id
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                        <span className="font-semibold text-ink-secondary">
                          {msg.sender_name}
                        </span>
                        <span>{formatTimeThai(msg.created_at)}</span>
                        {canChat && (
                          <button
                            type="button"
                            onClick={() => void handleTogglePin(msg)}
                            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                          >
                            <IconPin className="h-3 w-3 shrink-0" />
                            <span>{msg.pinned ? 'เลิกปักหมุด' : 'ปักหมุด'}</span>
                          </button>
                        )}
                      </div>
                      <div
                        className={`mt-1 max-w-md rounded-2xl px-3.5 py-2 text-sm shadow-2xs ${
                          isMine
                            ? 'bg-primary text-ink-inverted'
                            : 'border border-line bg-surface text-ink'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* กล่องพิมพ์ข้อความ (แสดงเฉพาะสมาชิกที่มีสิทธิ์แก้ไข ไม่แสดงสำหรับผู้ชม) */}
            {canChat && (
              <form
                onSubmit={(e) => void handleSendMessage(e)}
                className="mt-3 flex gap-2 border-t border-line pt-3"
              >
                <input
                  type="text"
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={
                    courseTagParam
                      ? `พิมพ์ข้อความถึงห้องวิชา #${courseTagParam}...`
                      : 'พิมพ์ข้อความในกลุ่ม...'
                  }
                  className="min-h-[44px] flex-1 rounded-xl border border-line-strong bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                />
                <Button type="submit" variant="primary" disabled={sending}>
                  {sending ? 'กำลังส่ง...' : 'ส่งข้อความ'}
                </Button>
              </form>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

export default GroupChatPage
