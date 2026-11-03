import type { DayOfWeek } from '../types'

const fullDateFormatter = new Intl.DateTimeFormat('th-TH', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const shortDateFormatter = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const timeFormatter = new Intl.DateTimeFormat('th-TH', {
  hour: '2-digit',
  minute: '2-digit',
})

const monthYearFormatter = new Intl.DateTimeFormat('th-TH', {
  month: 'long',
  year: 'numeric',
})

export function formatMonthYearThai(dateInput: Date | string = new Date()): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (Number.isNaN(d.getTime())) return '-'
  return monthYearFormatter.format(d)
}

export function formatFullDateThai(dateInput: Date | string = new Date()): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (Number.isNaN(d.getTime())) return '-'
  return fullDateFormatter.format(d)
}

export function formatShortDateThai(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return 'ไม่ระบุวันที่'
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (Number.isNaN(d.getTime())) return 'ไม่ระบุวันที่'
  return shortDateFormatter.format(d)
}

export function formatDateTimeThai(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return 'ไม่ระบุกำหนดส่ง'
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (Number.isNaN(d.getTime())) return 'ไม่ระบุกำหนดส่ง'
  return dateTimeFormatter.format(d)
}

export function formatTimeThai(dateInput: Date | string): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (Number.isNaN(d.getTime())) return ''
  return timeFormatter.format(d)
}

export function getTodayDayOfWeek(now: Date = new Date()): DayOfWeek {
  const jsDay = now.getDay() // 0 = Sun, 1 = Mon, ...
  const map: DayOfWeek[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  return map[jsDay] ?? 'MON'
}

export function getCurrentMinutesOfDay(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes()
}

const DAY_TO_JS_INDEX: Record<DayOfWeek, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
}

export interface NextSessionInfo {
  nextDate: Date
  dateLabelThai: string
  countdownThai: string
  isOngoing: boolean
  diffMinutes: number
}

/**
 * คำนวณวันและเวลาของ "คาบถัดไป" พร้อมข้อความนับถอยหลังภาษาไทย
 */
export function getNextClassSessionInfo(
  sessions: Array<{ day: DayOfWeek; start: string; end: string }>,
  now: Date = new Date(),
): NextSessionInfo | null {
  if (!sessions || sessions.length === 0) return null

  const nowMs = now.getTime()
  const currentJsDay = now.getDay()
  const currentMin = now.getHours() * 60 + now.getMinutes()

  let bestCandidate: NextSessionInfo | null = null

  for (const s of sessions) {
    const targetJsDay = DAY_TO_JS_INDEX[s.day] ?? 1
    const [startH, startM] = s.start.split(':').map(Number)
    const [endH, endM] = s.end.split(':').map(Number)
    const startTotalMin = (startH || 0) * 60 + (startM || 0)
    const endTotalMin = (endH || 0) * 60 + (endM || 0)

    // กรณีเป็นวันนี้และกำลังเรียนอยู่ในคาบพอดี
    if (targetJsDay === currentJsDay && currentMin >= startTotalMin && currentMin < endTotalMin) {
      const remainMin = endTotalMin - currentMin
      return {
        nextDate: now,
        dateLabelThai: `วันนี้ (${formatShortDateThai(now)})`,
        countdownThai: `กำลังเรียนอยู่ (เหลืออีก ${remainMin} นาที)`,
        isOngoing: true,
        diffMinutes: 0,
      }
    }

    let daysAhead = (targetJsDay - currentJsDay + 7) % 7
    if (daysAhead === 0 && currentMin >= startTotalMin) {
      daysAhead = 7
    }

    const candidateDate = new Date(now)
    candidateDate.setDate(now.getDate() + daysAhead)
    candidateDate.setHours(startH || 0, startM || 0, 0, 0)

    const diffMs = candidateDate.getTime() - nowMs
    const diffMinutes = Math.max(1, Math.round(diffMs / 60000))

    const totalHours = Math.floor(diffMinutes / 60)
    const days = Math.floor(totalHours / 24)
    const remHours = totalHours % 24
    const remMins = diffMinutes % 60

    let countdownThai = ''
    if (days > 0) {
      countdownThai = remHours > 0 ? `อีก ${days} วัน ${remHours} ชม.` : `อีก ${days} วัน`
    } else if (totalHours > 0) {
      countdownThai = remMins > 0 ? `อีก ${totalHours} ชม. ${remMins} นาที` : `อีก ${totalHours} ชม.`
    } else {
      countdownThai = `อีก ${remMins} นาที`
    }

    const dateLabelThai =
      daysAhead === 0
        ? `วันนี้ (${formatShortDateThai(candidateDate)})`
        : daysAhead === 1
          ? `พรุ่งนี้ (${formatShortDateThai(candidateDate)})`
          : formatFullDateThai(candidateDate)

    if (!bestCandidate || diffMinutes < bestCandidate.diffMinutes) {
      bestCandidate = {
        nextDate: candidateDate,
        dateLabelThai,
        countdownThai,
        isOngoing: false,
        diffMinutes,
      }
    }
  }

  return bestCandidate
}

/**
 * คำนวณข้อความนับถอยหลังภาษาไทยสำหรับงานค้างและวันสอบ
 */
export function getRelativeCountdownThai(
  dueDateInput: string | Date | null | undefined,
  now: Date = new Date(),
): { text: string; isOverdue: boolean; isUrgent: boolean } {
  if (!dueDateInput) {
    return { text: 'ไม่ระบุกำหนดเวลา', isOverdue: false, isUrgent: false }
  }

  const target = typeof dueDateInput === 'string' ? new Date(dueDateInput) : dueDateInput
  if (Number.isNaN(target.getTime())) {
    return { text: 'ไม่ระบุกำหนดเวลา', isOverdue: false, isUrgent: false }
  }

  const diffMs = target.getTime() - now.getTime()
  const absMin = Math.round(Math.abs(diffMs) / 60000)
  const totalHours = Math.floor(absMin / 60)
  const days = Math.floor(totalHours / 24)
  const remHours = totalHours % 24
  const remMins = absMin % 60

  if (diffMs < 0) {
    if (days > 0) {
      return { text: `เลยกำหนด ${days} วัน`, isOverdue: true, isUrgent: true }
    }
    if (totalHours > 0) {
      return { text: `เลยกำหนด ${totalHours} ชม.`, isOverdue: true, isUrgent: true }
    }
    return { text: `เลยกำหนด ${Math.max(1, remMins)} นาที`, isOverdue: true, isUrgent: true }
  }

  const isUrgent = days < 3
  if (days > 0) {
    const text = remHours > 0 ? `อีก ${days} วัน ${remHours} ชม.` : `อีก ${days} วัน`
    return { text, isOverdue: false, isUrgent }
  }
  if (totalHours > 0) {
    const text = remMins > 0 ? `อีก ${totalHours} ชม. ${remMins} นาที` : `อีก ${totalHours} ชม.`
    return { text, isOverdue: false, isUrgent: true }
  }
  return { text: `อีก ${Math.max(1, remMins)} นาที`, isOverdue: false, isUrgent: true }
}
