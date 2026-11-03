import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { formatSupabaseErrorThai, useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { ChatMessageItem } from '../types'

export function GroupChatPage() {
  const { user, displayName, activeGroup, currentRole } = useAuth()
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

    setSending(true)
    setErrorMessage(null)

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          group_id: activeGroup.id,
          sender_id: user.id,
          sender_name: displayName || 'สมาชิก',
          content: trimmed,
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

  const pinnedMessages = messages.filter((m) => m.pinned)

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">แชทกลุ่ม</h1>
            <p className="mt-1 text-sm text-slate-500">
              {activeGroup
                ? `ห้องสนทนาเรียลไทม์ของกลุ่ม "${activeGroup.name}"`
                : 'ห้องสนทนาแลกเปลี่ยนข้อมูลในกลุ่มเรียน (Supabase Realtime)'}
            </p>
          </div>
        </div>

        {!user && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            กรุณา{' '}
            <Link to="/login" className="font-semibold text-indigo-600 underline">
              เข้าสู่ระบบ (/login)
            </Link>{' '}
            และเข้าร่วมกลุ่มเพื่อใช้งานแชทกลุ่มแบบเรียลไทม์
          </div>
        )}

        {isLoggedInViewer && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-900">
            <span className="font-bold">กรอกรหัสเชิญเพื่อแก้ไข</span> — คุณมีสิทธิ์เป็นผู้ชม (อ่านอย่างเดียว)
            จึงยังไม่สามารถส่งข้อความหรือปักหมุดแชทได้ กรุณาไปที่หน้า{' '}
            <Link to="/group" className="font-semibold text-indigo-700 underline">
              จัดการกลุ่ม (/group)
            </Link>{' '}
            เพื่อกรอกรหัสเชิญ
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}

        {/* ส่วนข้อความที่ปักหมุด */}
        {pinnedMessages.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5">
            <h2 className="text-xs font-bold text-amber-900 uppercase">
              ข้อความที่ปักหมุดไว้ ({pinnedMessages.length})
            </h2>
            <div className="mt-2 space-y-1.5">
              {pinnedMessages.map((pm) => (
                <div
                  key={`pin-${pm.id}`}
                  className="flex items-center justify-between gap-2 rounded bg-white px-3 py-1.5 text-xs shadow-2xs"
                >
                  <div>
                    <strong className="text-indigo-700">{pm.sender_name}:</strong>{' '}
                    <span className="text-slate-800">{pm.content}</span>
                  </div>
                  {canChat && (
                    <button
                      type="button"
                      onClick={() => void handleTogglePin(pm)}
                      className="text-[11px] font-medium text-amber-700 hover:underline"
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
          <div className="mt-4 flex h-96 flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {loading ? (
                <p className="text-sm text-slate-500">กำลังโหลดข้อความ...</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-slate-400">
                  ยังไม่มีข้อความในกลุ่มนี้ เริ่มต้นสนทนาได้เลย!
                </p>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.sender_id === user.id
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-700">{msg.sender_name}</span>
                        <span>
                          {new Date(msg.created_at).toLocaleTimeString('th-TH', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {canChat && (
                          <button
                            type="button"
                            onClick={() => void handleTogglePin(msg)}
                            className="text-indigo-600 hover:underline"
                          >
                            {msg.pinned ? 'เลิกปักหมุด' : 'ปักหมุด'}
                          </button>
                        )}
                      </div>
                      <div
                        className={`mt-1 max-w-md rounded-2xl px-3.5 py-2 text-sm shadow-2xs ${
                          isMine
                            ? 'bg-indigo-600 text-white'
                            : 'border border-slate-200 bg-white text-slate-900'
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
                className="mt-3 flex gap-2 border-t border-slate-200 pt-3"
              >
                <input
                  type="text"
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="พิมพ์ข้อความในกลุ่ม..."
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {sending ? 'กำลังส่ง...' : 'ส่งข้อความ'}
                </button>
              </form>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

export default GroupChatPage
