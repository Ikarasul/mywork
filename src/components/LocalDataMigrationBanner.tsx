import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { hasLocalDataToMigrate, migrateLocalDataToSupabase } from '../lib/storage'

export function LocalDataMigrationBanner() {
  const { user, activeGroup, currentRole } = useAuth()
  const [hasData, setHasData] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setHasData(false)
      return
    }
    void hasLocalDataToMigrate(user.id).then(setHasData)
  }, [user, activeGroup])

  if (!user || (!hasData && !resultMessage && !errorMessage)) {
    return null
  }

  const canEditGroup = currentRole === 'owner' || currentRole === 'admin' || currentRole === 'member'

  async function handleMigrate() {
    if (!user) return
    setMigrating(true)
    setErrorMessage(null)
    setResultMessage(null)

    const { migratedCount, error } = await migrateLocalDataToSupabase(
      user.id,
      activeGroup?.id ?? null,
      canEditGroup,
    )

    setMigrating(false)

    if (error) {
      setErrorMessage(error)
    } else {
      setHasData(false)
      setResultMessage(
        `ย้ายข้อมูลในเครื่องขึ้นระบบสำเร็จจำนวน ${migratedCount} รายการ! (รีเฟรชหน้าหากต้องการดูข้อมูลล่าสุด)`,
      )
    }
  }

  return (
    <div className="mx-auto mt-4 max-w-6xl px-4">
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950 shadow-xs sm:flex-row sm:items-center">
        <div>
          <p className="font-bold text-indigo-900">
            พบข้อมูลที่เคยบันทึกไว้ในเครื่อง (localStorage) ก่อนเข้าสู่ระบบ
          </p>
          <p className="mt-0.5 text-xs text-indigo-800">
            คุณสามารถย้ายข้อมูลตารางชีวิตส่วนตัวและตารางเรียนจากในเครื่องขึ้นไปเก็บบนฐานข้อมูลออนไลน์ได้ทันที
          </p>
          {errorMessage && (
            <p className="mt-1 text-xs font-semibold text-rose-600">{errorMessage}</p>
          )}
          {resultMessage && (
            <p className="mt-1 text-xs font-semibold text-emerald-700">{resultMessage}</p>
          )}
        </div>

        {hasData && (
          <button
            type="button"
            disabled={migrating}
            onClick={() => void handleMigrate()}
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {migrating ? 'กำลังย้ายข้อมูล...' : 'ย้ายข้อมูลในเครื่องขึ้นระบบ'}
          </button>
        )}
      </div>
    </div>
  )
}

export default LocalDataMigrationBanner
