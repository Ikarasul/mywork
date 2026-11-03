import { isSupabaseConfigured } from '../lib/supabase'

export function SupabaseConfigBanner() {
  if (isSupabaseConfigured) {
    return null
  }

  return (
    <div
      role="alert"
      className="mx-auto mt-4 max-w-6xl px-4"
    >
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-base font-bold text-amber-900">
              ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล Supabase
            </h2>
            <p className="mt-1 text-sm text-amber-800">
              ขณะนี้แอปทำงานในโหมดเก็บข้อมูลในเครื่อง (localStorage) ชั่วคราว
              หากต้องการเปิดใช้งานระบบล็อกอิน กลุ่มเรียน และการซิงค์ข้อมูลออนไลน์ กรุณาตั้งค่าตามขั้นตอนต่อไปนี้:
            </p>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-amber-900">
              <li>
                สร้างไฟล์ชื่อ <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">.env.local</code> ที่โฟลเดอร์รากของโปรเจกต์
              </li>
              <li>
                คัดลอกค่าจากหน้า <strong>Project Settings &gt; API</strong> บน Supabase มาใส่ดังนี้:
                <pre className="mt-1.5 overflow-x-auto rounded-lg bg-amber-100/80 p-2.5 font-mono text-xs text-amber-950">
{`VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key`}
                </pre>
              </li>
              <li>
                รีสตาร์ทเซิร์ฟเวอร์พัฒนา (<code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">npm run dev</code>) อีกครั้ง (ห้ามใช้ <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">service_role</code> key เด็ดขาด)
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SupabaseConfigBanner
