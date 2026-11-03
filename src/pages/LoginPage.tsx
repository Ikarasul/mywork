import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { getRoleBadgeClass, getRoleLabelThai, useAuth } from '../lib/auth'
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
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">เข้าสู่ระบบและตรวจสอบสิทธิ์</h1>
            <p className="mt-1 text-sm text-slate-500">
              เข้าสู่ระบบด้วยลิงก์วิเศษผ่านอีเมล (Supabase Magic Link) โดยไม่ต้องใช้รหัสผ่าน
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getRoleBadgeClass(currentRole)}`}
          >
            สิทธิ์ปัจจุบัน: {getRoleLabelThai(currentRole)}
          </span>
        </div>

        {user ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-semibold">คุณเข้าสู่ระบบเรียบร้อยแล้ว</p>
              <p className="mt-1">
                ชื่อแสดงผล: <strong>{displayName}</strong>
              </p>
              <p className="mt-0.5 text-xs text-emerald-700">อีเมลบัญชีของคุณ: {user.email}</p>
              <p className="mt-1">
                กลุ่มปัจจุบัน:{' '}
                <strong>{activeGroup ? activeGroup.name : 'ยังไม่ได้เลือกหรือสร้างกลุ่ม'}</strong>
              </p>
              <p className="mt-1">
                ระดับสิทธิ์ในกลุ่ม: <strong>{getRoleLabelThai(currentRole)}</strong>
              </p>
            </div>

            {currentRole === 'viewer' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium">
                  คุณล็อกอินแล้วแต่ยังไม่มีรหัสเชิญเข้ากลุ่ม จึงมีสิทธิ์เป็น &ldquo;ผู้ชม&rdquo; (อ่านอย่างเดียว)
                </p>
                <p className="mt-1">
                  ไปที่หน้า{' '}
                  <Link to="/group" className="font-semibold text-indigo-600 underline">
                    จัดการกลุ่มและรหัสเชิญ (/group)
                  </Link>{' '}
                  เพื่อกรอกรหัสเชิญหรือสร้างกลุ่มของคุณเอง
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to="/group"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                ไปหน้าจัดการกลุ่ม (/group)
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
            <div>
              <label htmlFor="display-name-input" className="block text-sm font-medium text-slate-700">
                ชื่อแสดงผลในกลุ่ม (ไม่บังคับ)
              </label>
              <input
                id="display-name-input"
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="เช่น สมชาย ใจดี"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="email-input" className="block text-sm font-medium text-slate-700">
                อีเมลสำหรับรับ Magic Link <span className="text-rose-500">*</span>
              </label>
              <input
                id="email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {errorMessage && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            )}

            {sentSuccess && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                ส่งลิงก์เข้าสู่ระบบ (Magic Link) ไปที่อีเมล <strong>{email}</strong> เรียบร้อยแล้ว!
                กรุณาเปิดอีเมลของคุณแล้วคลิกลิงก์เพื่อเข้าสู่ระบบ
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !isSupabaseConfigured}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'กำลังส่งลิงก์เข้าสู่ระบบ...' : 'ส่งลิงก์เข้าสู่ระบบทางอีเมล (Magic Link)'}
            </button>
          </form>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h2 className="text-sm font-bold text-slate-800">คำอธิบายระดับสิทธิ์ในระบบ</h2>
        <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
          <li>
            <strong>ผู้ชม (Viewer):</strong> อ่านตารางเรียนและงานอย่างเดียว (ผ่านลิงก์แชร์ หรือล็อกอินแล้วยังไม่ได้กรอกรหัสเชิญ)
          </li>
          <li>
            <strong>ผู้แก้ไข (Member):</strong> ล็อกอินและกรอกรหัสเชิญแล้ว แก้ตารางเรียน อัปเดตสถานะงานของตน และแชทกลุ่มได้
          </li>
          <li>
            <strong>ผู้ดูแล (Admin):</strong> สิทธิ์เหมือนผู้แก้ไข + สร้าง/มอบหมายงาน และแก้ไขกำหนดส่งงานได้
          </li>
          <li>
            <strong>เจ้าของ (Owner):</strong> สิทธิ์ทุกอย่าง + สร้าง/ยกเลิกรหัสเชิญ เปลี่ยนบทบาท และถอดสมาชิกออกจากกลุ่มได้
          </li>
        </ul>
      </section>
    </div>
  )
}

export default LoginPage
