import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { hasLocalDataToMigrate, migrateLocalDataToSupabase } from '../lib/storage'
import Button from './ui/Button'

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

  const canEditGroup =
    currentRole === 'owner' || currentRole === 'admin' || currentRole === 'member'

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
        `ย้ายข้อมูลในเครื่องขึ้นระบบสำเร็จจำนวน ${migratedCount} รายการ!`,
      )
    }
  }

  return (
    <div className="mx-auto mt-4 max-w-6xl px-3 sm:px-6">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-primary bg-primary-soft p-4 text-sm text-primary-fg shadow-xs sm:flex-row sm:items-center">
        <div>
          <p className="font-bold">
            พบข้อมูลที่เคยบันทึกไว้ในเครื่อง (localStorage) ก่อนเข้าสู่ระบบ
          </p>
          <p className="mt-0.5 text-xs opacity-90">
            คุณสามารถย้ายข้อมูลตารางชีวิตส่วนตัวและตารางเรียนจากในเครื่องขึ้นไปเก็บบนฐานข้อมูลออนไลน์ได้ทันที
          </p>
          {errorMessage && (
            <p className="mt-1 text-xs font-bold text-status-danger">{errorMessage}</p>
          )}
          {resultMessage && (
            <p className="mt-1 text-xs font-bold text-status-success">{resultMessage}</p>
          )}
        </div>

        {hasData && (
          <Button
            variant="primary"
            size="sm"
            disabled={migrating}
            onClick={() => void handleMigrate()}
          >
            {migrating ? 'กำลังย้ายข้อมูล...' : 'ย้ายข้อมูลในเครื่องขึ้นระบบ'}
          </Button>
        )}
      </div>
    </div>
  )
}

export default LocalDataMigrationBanner
