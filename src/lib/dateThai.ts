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
