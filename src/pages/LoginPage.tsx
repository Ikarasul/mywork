import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import PixelCat from '../components/PixelCat'
import { Badge, Button, Card, Toast } from '../components/ui'
import { getRoleLabelThai, useAuth } from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabase'

export function LoginPage() {
  const { user, displayName, currentRole, activeGroup, signInWithMagicLink, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [customName, setCustomName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sentSuccess, setSentSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
                เข้าสู่ระบบด้วยลิงก์วิเศษผ่านอีเมล (Supabase Magic Link)
              </p>
            </div>
          </div>
          <Badge tone={currentRole === 'viewer' ? 'warning' : 'primary'}>
            {currentRole === 'viewer'
              ? '👁️ โหมดดูอย่างเดียว (ผู้ชม)'
              : `สิทธิ์: ${getRoleLabelThai(currentRole)}`}
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

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link to="/group">
                <Button variant="primary">ไปหน้าจัดการกลุ่ม (/group)</Button>
              </Link>
              <Button variant="danger" onClick={() => void signOut()}>
                ออกจากระบบ
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
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
              disabled={submitting || !isSupabaseConfigured}
              className="w-full"
            >
              {submitting
                ? 'กำลังส่งลิงก์เข้าสู่ระบบ...'
                : 'ส่งลิงก์เข้าสู่ระบบทางอีเมล (Magic Link)'}
            </Button>
          </form>
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
