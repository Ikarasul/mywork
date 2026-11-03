import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import GoogleCalendarSyncBar from '../components/GoogleCalendarSyncBar'
import { IconEye } from '../components/icons'
import PixelCat from '../components/PixelCat'
import { Badge, Button, Card, Toast } from '../components/ui'
import { getRoleLabelThai, useAuth } from '../lib/auth'
import { useGoogleCalendar } from '../lib/googleCalendar'
import { isSupabaseConfigured } from '../lib/supabase'

export function LoginPage() {
  const {
    user,
    displayName,
    currentRole,
    activeGroup,
    signInWithMagicLink,
    signInWithGoogle,
    signOut,
  } = useAuth()
  const gcal = useGoogleCalendar()

  const [email, setEmail] = useState('')
  const [customName, setCustomName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [googleSubmitting, setGoogleSubmitting] = useState(false)
  const [sentSuccess, setSentSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleGoogleLogin() {
    setErrorMessage(null)
    setSentSuccess(false)
    setGoogleSubmitting(true)

    const { error } = await signInWithGoogle({ redirectPath: '/login' })
    if (error) {
      setGoogleSubmitting(false)
      setErrorMessage(error)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrorMessage(null)
    setSentSuccess(false)
    setSubmitting(true)

    const { error } = await signInWithMagicLink(email, customName)
    setSubmitting(false)

    if (error) {
      setErrorMessage(error)
    } else {
      setSentSuccess(true)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <PixelCat mood={user ? 'happy' : 'idle'} size={48} />
            <div>
              <h1 className="text-xl font-bold text-ink sm:text-2xl">
                เข้าสู่ระบบและตรวจสอบสิทธิ์
              </h1>
              <p className="mt-0.5 text-xs text-ink-muted">
                เข้าสู่ระบบด้วยบัญชี Google หรือลิงก์วิเศษผ่านอีเมล (Magic Link)
              </p>
            </div>
          </div>
          <Badge tone={currentRole === 'viewer' ? 'warning' : 'primary'} className="inline-flex items-center gap-1">
            {currentRole === 'viewer' ? (
              <>
                <IconEye className="h-3 w-3 shrink-0" />
                <span>โหมดดูอย่างเดียว (ผู้ชม)</span>
              </>
            ) : (
              `สิทธิ์: ${getRoleLabelThai(currentRole)}`
            )}
          </Badge>
        </div>

        {user ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-status-success bg-status-success-soft p-4 text-sm text-status-success-fg">
              <p className="font-bold">คุณเข้าสู่ระบบเรียบร้อยแล้ว</p>
              <p className="mt-1">
                ชื่อแสดงผล: <strong>{displayName}</strong>
              </p>
              <p className="mt-0.5 text-xs opacity-85">อีเมลบัญชีของคุณ: {user.email}</p>
              <p className="mt-1">
                กลุ่มปัจจุบัน:{' '}
                <strong>{activeGroup ? activeGroup.name : 'ยังไม่ได้เลือกหรือสร้างกลุ่ม'}</strong>
              </p>
              <p className="mt-1">
                ระดับสิทธิ์ในกลุ่ม: <strong>{getRoleLabelThai(currentRole)}</strong>
              </p>
            </div>

            {currentRole === 'viewer' && (
              <div className="rounded-xl border border-status-warning bg-status-warning-soft p-4 text-sm text-status-warning-fg">
                <p className="font-bold">
                  โหมดดูอย่างเดียว — คุณล็อกอินแล้วแต่ยังไม่มีรหัสเชิญเข้ากลุ่ม
                </p>
                <p className="mt-1 text-xs">
                  ไปที่หน้า{' '}
                  <Link to="/group" className="font-bold underline">
                    จัดการกลุ่มและรหัสเชิญ (/group)
                  </Link>{' '}
                  เพื่อกรอกรหัสเชิญหรือสร้างกลุ่มของคุณเอง
                </p>
              </div>
            )}

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

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link to="/group">
                <Button variant="primary">ไปหน้าจัดการกลุ่ม (/group)</Button>
              </Link>
              <Link to="/schedule">
                <Button variant="secondary">ไปหน้าตารางเรียน (/schedule)</Button>
              </Link>
              <Button variant="danger" onClick={() => void signOut()}>
                ออกจากระบบ
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {/* ปุ่มเข้าสู่ระบบด้วย Google (G1) */}
            <div className="space-y-2">
              <button
                type="button"
                disabled={googleSubmitting || submitting || !isSupabaseConfigured}
                onClick={() => void handleGoogleLogin()}
                className="flex min-h-[46px] w-full items-center justify-center gap-3 rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-sm font-bold text-ink shadow-2xs transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96Z"
                  />
                </svg>
                <span>
                  {googleSubmitting
                    ? 'กำลังเชื่อมต่อไปยัง Google...'
                    : 'เข้าสู่ระบบด้วยบัญชี Google'}
                </span>
              </button>
              <p className="text-center text-[11px] text-ink-muted">
                รองรับการล็อกอินด้วย Google และซิงก์ปฏิทิน Google Calendar แบบอ่านอย่างเดียว
              </p>
            </div>

            <div className="relative flex items-center py-1">
              <div className="grow border-t border-line" />
              <span className="mx-3 shrink-0 text-xs font-medium text-ink-muted">
                หรือรับลิงก์เข้าสู่ระบบทางอีเมล
              </span>
              <div className="grow border-t border-line" />
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div>
                <label
                  htmlFor="display-name-input"
                  className="block text-sm font-medium text-ink-secondary"
                >
                  ชื่อแสดงผลในกลุ่ม (ไม่บังคับ)
                </label>
                <input
                  id="display-name-input"
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="เช่น ราเวน อาร์เนสัน"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-line-strong bg-surface-alt px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="email-input"
                  className="block text-sm font-medium text-ink-secondary"
                >
                  อีเมลสำหรับรับ Magic Link <span className="text-status-danger">*</span>
                </label>
                <input
                  id="email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hoghopper5@gmail.com"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-line-strong bg-surface-alt px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                />
              </div>

              {errorMessage && (
                <Toast
                  tone="danger"
                  message={errorMessage}
                  onClose={() => setErrorMessage(null)}
                />
              )}

              {sentSuccess && (
                <Toast
                  tone="success"
                  message={`ส่งลิงก์เข้าสู่ระบบ (Magic Link) ไปที่อีเมล ${email} เรียบร้อยแล้ว! กรุณาเปิดอีเมลของคุณแล้วคลิกลิงก์เพื่อเข้าสู่ระบบ`}
                />
              )}

              <Button
                type="submit"
                variant="primary"
                disabled={submitting || googleSubmitting || !isSupabaseConfigured}
                className="w-full"
              >
                {submitting
                  ? 'กำลังส่งลิงก์เข้าสู่ระบบ...'
                  : 'ส่งลิงก์เข้าสู่ระบบทางอีเมล (Magic Link)'}
              </Button>
            </form>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-bold text-ink">คำอธิบายระดับสิทธิ์ในระบบ</h2>
        <ul className="mt-2 space-y-1.5 text-xs text-ink-secondary">
          <li>
            <strong>ผู้ชม (Viewer):</strong> อ่านตารางเรียนและงานอย่างเดียว (โหมดดูอย่างเดียว)
          </li>
          <li>
            <strong>ผู้แก้ไข (Member):</strong> ล็อกอินและกรอกรหัสเชิญแล้ว แก้ตารางเรียน อัปเดตสถานะงานของตน และแชทกลุ่มได้
          </li>
          <li>
            <strong>ผู้ดูแล (Admin):</strong> สิทธิ์เหมือนผู้แก้ไข + สร้าง/มอบหมายงาน แก้ไขกำหนดส่ง และล้างตารางเรียนได้
          </li>
          <li>
            <strong>เจ้าของ (Owner):</strong> สิทธิ์ทุกอย่าง + สร้าง/ยกเลิกรหัสเชิญ เปลี่ยนบทบาท และถอดสมาชิกออกจากกลุ่มได้
          </li>
        </ul>
      </Card>
    </div>
  )
}

export default LoginPage
