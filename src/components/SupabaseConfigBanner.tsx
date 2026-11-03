import { isSupabaseConfigured } from '../lib/supabase'

export function SupabaseConfigBanner() {
  if (isSupabaseConfigured) {
    return null
  }

  return (
    <div role="alert" className="mx-auto mt-4 max-w-6xl px-3 sm:px-6">
      <div className="rounded-2xl border border-status-warning bg-status-warning-soft p-4 text-status-warning-fg shadow-xs">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-base font-bold">
              ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล Supabase
            </h2>
            <p className="mt-1 text-sm">
              ขณะนี้แอปทำงานในโหมดเก็บข้อมูลในเครื่อง (localStorage) ชั่วคราว
              หากต้องการเปิดใช้งานระบบล็อกอิน กลุ่มเรียน และการซิงค์ข้อมูลออนไลน์ กรุณาตั้งค่าในไฟล์{' '}
              <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink">
                .env.local
              </code>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SupabaseConfigBanner
