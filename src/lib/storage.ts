import sampleScheduleCsvRaw from '../../sample-data/schedule.csv?raw'
import { formatSupabaseErrorThai } from './auth'
import { isSupabaseConfigured, supabase } from './supabase'
import type {
  CourseColorId,
  CourseLinkItem,
  CourseScheduleItem,
  DayOfWeek,
  RoutineItem,
  StorageAdapter,
  TaskItem,
} from '../types'

const STORAGE_PREFIX = 'lsp:'
const ACTIVE_GROUP_STORAGE_KEY = 'lsp:active_group_id'
const MIGRATED_FLAG_PREFIX = 'lsp:migrated_user:'
export const DEFAULT_SEMESTER = 'summer-2569'

const VALID_DAYS: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

export function normalizeDayCode(day: string): DayOfWeek {
  const d = (day || '').trim().toUpperCase()
  if (d === 'M' || d === 'MON' || d.includes('จัน')) return 'MON'
  if (d === 'T' || d === 'TUE' || d.includes('อัง')) return 'TUE'
  if (d === 'W' || d === 'WED' || d.includes('พุธ')) return 'WED'
  if (d === 'H' || d === 'THU' || d.includes('พฤ')) return 'THU'
  if (d === 'F' || d === 'FRI' || d.includes('ศุก')) return 'FRI'
  if (d === 'S' || d === 'SAT' || d.includes('เสา')) return 'SAT'
  if (d === 'U' || d === 'SUN' || d.includes('อา')) return 'SUN'
  return 'MON'
}

export function normalizeTimeStr(time: string): string {
  const clean = (time || '').trim()
  const parts = clean.split(':')
  if (parts.length >= 2) {
    const hh = parts[0].padStart(2, '0')
    const mm = parts[1].padStart(2, '0')
    return `${hh}:${mm}`
  }
  return clean
}
const EXPECTED_CSV_HEADERS = [
  'course_code',
  'course_name',
  'credits',
  'section',
  'day',
  'start',
  'end',
  'room',
  'instructor',
  'online_link',
]
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

export interface CsvParseResult {
  items: CourseScheduleItem[]
  errors: string[]
}

export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export const KNOWN_COURSE_LINKS: Record<
  string,
  { online_url?: string; contact_url?: string }
> = {
  ICT35467: {
    online_url: 'https://meet.google.com/soh-gxca-vdx',
    contact_url:
      'https://line.me/ti/g2/qM6MWzrgIAlY5e7vYg4DNJS0cVi0kOcbmpMiCg?utm_source=invitation&utm_medium=link_copy&utm_campaign=default',
  },
  MGT33267: {
    online_url: 'https://meet.google.com/htk-qqsv-hsk',
    contact_url: 'https://line.me/ti/g/SYCGY-KsXd',
  },
  MGT23667: {
    contact_url: 'https://line.me/R/ti/g/ELKTLW9L2m',
  },
  MGT13267: {
    contact_url: 'https://line.me/R/ti/g/tZhvVxzfWJ',
  },
  MGT13167: {
    contact_url: 'https://line.me/R/ti/g/EjZESMY-bK',
  },
}

export interface CourseColorTheme {
  id: CourseColorId
  label: string
  bg: string
  border: string
  bar: string
  text: string
  sub: string
  swatchBg: string
}

/**
 * ชุดสีประจำวิชา 8 โทนที่ไม่ซ้ำกัน และผ่านเกณฑ์ความเปรียบต่างสี (WCAG AA Contrast) ทั้ง 3 ธีม
 * (สว่าง / มืด / ดำสนิท OLED)
 */
export const COURSE_COLOR_PALETTE: CourseColorTheme[] = [
  {
    id: 'mint',
    label: 'เขียวมิ้นต์',
    bg: 'bg-accent-mint-soft hover:opacity-95',
    border: 'border-accent-mint',
    bar: 'bg-accent-mint',
    text: 'text-accent-mint-fg',
    sub: 'text-ink-secondary',
    swatchBg: 'bg-accent-mint',
  },
  {
    id: 'indigo',
    label: 'ม่วงคราม',
    bg: 'bg-primary-soft hover:opacity-95',
    border: 'border-primary',
    bar: 'bg-primary',
    text: 'text-primary-fg',
    sub: 'text-ink-secondary',
    swatchBg: 'bg-primary',
  },
  {
    id: 'amber',
    label: 'เหลืองอำพัน',
    bg: 'bg-accent-amber-soft hover:opacity-95',
    border: 'border-accent-amber',
    bar: 'bg-accent-amber',
    text: 'text-accent-amber-fg',
    sub: 'text-ink-secondary',
    swatchBg: 'bg-accent-amber',
  },
  {
    id: 'sky',
    label: 'ฟ้าคราม',
    bg: 'bg-accent-sky-soft hover:opacity-95',
    border: 'border-accent-sky',
    bar: 'bg-accent-sky',
    text: 'text-accent-sky-fg',
    sub: 'text-ink-secondary',
    swatchBg: 'bg-accent-sky',
  },
  {
    id: 'pink',
    label: 'ชมพูบานเย็น',
    bg: 'bg-accent-pink-soft hover:opacity-95',
    border: 'border-accent-pink',
    bar: 'bg-accent-pink',
    text: 'text-accent-pink-fg',
    sub: 'text-ink-secondary',
    swatchBg: 'bg-accent-pink',
  },
  {
    id: 'violet',
    label: 'ม่วงไวโอเล็ต',
    bg: 'bg-accent-violet-soft hover:opacity-95',
    border: 'border-accent-violet',
    bar: 'bg-accent-violet',
    text: 'text-accent-violet-fg',
    sub: 'text-ink-secondary',
    swatchBg: 'bg-accent-violet',
  },
  {
    id: 'teal',
    label: 'เขียวอมฟ้า',
    bg: 'bg-accent-teal-soft hover:opacity-95',
    border: 'border-accent-teal',
    bar: 'bg-accent-teal',
    text: 'text-accent-teal-fg',
    sub: 'text-ink-secondary',
    swatchBg: 'bg-accent-teal',
  },
  {
    id: 'rose',
    label: 'แดงกุหลาบ',
    bg: 'bg-accent-rose-soft hover:opacity-95',
    border: 'border-accent-rose',
    bar: 'bg-accent-rose',
    text: 'text-accent-rose-fg',
    sub: 'text-ink-secondary',
    swatchBg: 'bg-accent-rose',
  },
]

export function getCourseColorTheme(colorId?: string): CourseColorTheme | undefined {
  if (!colorId) return undefined
  return COURSE_COLOR_PALETTE.find((c) => c.id === colorId)
}

/**
 * จัดสีประจำวิชาอัตโนมัติโดยไม่ให้ซ้ำกันในเทอมเดียวกัน และเคารพสีที่ผู้แก้ไขเลือกเอง
 */
export function buildCourseColorMap(
  sessions: Array<{ course_code: string; color?: string }>,
): Map<string, CourseColorTheme> {
  const map = new Map<string, CourseColorTheme>()
  const usedColorIds = new Set<string>()
  const uniqueCourses: Array<{ code: string; color?: string }> = []
  const seenCodes = new Set<string>()

  for (const s of sessions) {
    const code = (s.course_code || '').trim().toUpperCase()
    if (!code) continue
    if (!seenCodes.has(code)) {
      seenCodes.add(code)
      uniqueCourses.push({ code, color: s.color })
    } else if (s.color) {
      const existing = uniqueCourses.find((u) => u.code === code)
      if (existing && !existing.color) {
        existing.color = s.color
      }
    }
  }

  // 1) กำหนดสีที่ผู้ใช้เลือกไว้ชัดเจนก่อน
  for (const item of uniqueCourses) {
    const explicitTheme = getCourseColorTheme(item.color)
    if (explicitTheme) {
      map.set(item.code, explicitTheme)
      usedColorIds.add(explicitTheme.id)
    }
  }

  // 2) จัดสีอัตโนมัติให้วิชาที่เหลือโดยเลือกสีที่ยังไม่ถูกใช้ก่อน เพื่อไม่ให้สีซ้ำกัน
  let fallbackIdx = 0
  for (const item of uniqueCourses) {
    if (map.has(item.code)) continue
    const unusedTheme = COURSE_COLOR_PALETTE.find((p) => !usedColorIds.has(p.id))
    if (unusedTheme) {
      map.set(item.code, unusedTheme)
      usedColorIds.add(unusedTheme.id)
    } else {
      map.set(item.code, COURSE_COLOR_PALETTE[fallbackIdx % COURSE_COLOR_PALETTE.length])
      fallbackIdx++
    }
  }

  return map
}

/**
 * แปลงรหัสห้องเรียนเป็นข้อความสถานที่เต็มจากตารางมหาวิทยาลัย
 */
export function resolveLocationText(room: string, customLocationText?: string): string {
  if (customLocationText && customLocationText.trim().length > 0) {
    return customLocationText.trim()
  }
  const cleanRoom = (room || '').trim()
  const match = /^05-(\d{2})(\d{2})$/.exec(cleanRoom)
  if (match) {
    const floor = match[1]
    const roomNo = `${match[1]}${match[2]}`
    return `อาคาร 5 - สยามบรมราชกุมารี ชั้น ${floor} ห้อง ${roomNo}`
  }
  return cleanRoom ? `ห้อง ${cleanRoom}` : 'ไม่ระบุห้องเรียน'
}

/**
 * ตรวจสอบความถูกต้องของ URL ลิงก์รายวิชา:
 * รับเฉพาะ https:// เท่านั้น และปฏิเสธ javascript:, data:, vbscript:, http:// ฯลฯ
 */
export function validateHttpsCourseUrl(rawUrl: string): {
  valid: boolean
  error?: string
  cleanUrl?: string
} {
  const trimmed = (rawUrl || '').trim()
  if (!trimmed) {
    return { valid: false, error: 'กรุณากรอก URL ของลิงก์' }
  }

  if (/^(javascript|data|vbscript|file|blob):/i.test(trimmed)) {
    return {
      valid: false,
      error:
        'ปฏิเสธลิงก์อันตราย: ไม่อนุญาตให้ใช้โปรโตคอล javascript:, data: หรือสคริปต์ใดๆ ต้องขึ้นต้นด้วย https:// เท่านั้น',
    }
  }

  if (!/^https:\/\//i.test(trimmed)) {
    return {
      valid: false,
      error: 'ลิงก์ไม่ถูกต้อง: ต้องขึ้นต้นด้วย https:// เท่านั้น (ไม่อนุญาต http:// หรือโปรโตคอลอื่น)',
    }
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:' || !parsed.hostname) {
      return {
        valid: false,
        error: 'รูปแบบ URL ไม่ถูกต้อง กรุณาระบุลิงก์ที่ขึ้นต้นด้วย https:// ให้สมบูรณ์',
      }
    }
    return { valid: true, cleanUrl: parsed.toString() }
  } catch {
    return {
      valid: false,
      error: 'รูปแบบ URL ไม่ถูกต้อง กรุณาระบุลิงก์ที่ขึ้นต้นด้วย https:// ให้สมบูรณ์',
    }
  }
}

/**
 * สร้างรายการลิงก์เริ่มต้นของรายวิชาจาก online_url / contact_url หรือ KNOWN_COURSE_LINKS
 */
export function buildDefaultCourseLinks(item: {
  course_code: string
  online_url?: string
  contact_url?: string
  links?: CourseLinkItem[]
}): CourseLinkItem[] {
  if (Array.isArray(item.links) && item.links.length > 0) {
    return item.links.filter((l) => validateHttpsCourseUrl(l.url).valid)
  }

  const code = (item.course_code || '').trim().toUpperCase()
  const result: CourseLinkItem[] = []
  const meetUrl = item.online_url || KNOWN_COURSE_LINKS[code]?.online_url
  const lineUrl = item.contact_url || KNOWN_COURSE_LINKS[code]?.contact_url

  if (meetUrl && validateHttpsCourseUrl(meetUrl).valid) {
    result.push({
      type: 'meet',
      label: 'ห้องเรียนออนไลน์ (Google Meet)',
      url: meetUrl,
    })
  }

  if (lineUrl && validateHttpsCourseUrl(lineUrl).valid) {
    result.push({
      type: 'line',
      label: 'กลุ่มติดต่อรายวิชา (LINE OpenChat/Group)',
      url: lineUrl,
    })
  }

  return result
}

export function parseScheduleCsvText(csvText: string): CsvParseResult {
  const errors: string[] = []
  const items: CourseScheduleItem[] = []

  const rawLines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (rawLines.length === 0) {
    return { items: [], errors: ['ไฟล์ CSV ว่างเปล่า กรุณาเลือกไฟล์ที่มีข้อมูลตารางเรียน'] }
  }

  const headerCols = rawLines[0].split(',').map((h) => h.trim().toLowerCase())
  const missingHeaders = EXPECTED_CSV_HEADERS.filter((eh) => !headerCols.includes(eh))

  if (missingHeaders.length > 0) {
    return {
      items: [],
      errors: [
        `คอลัมน์ส่วนหัว (Header) ในไฟล์ CSV ไม่ถูกต้อง (ต้องมีอย่างน้อย: ${EXPECTED_CSV_HEADERS.join(', ')})`,
      ],
    }
  }

  const colIndex = (name: string) => headerCols.indexOf(name)

  for (let i = 1; i < rawLines.length; i++) {
    const rowNum = i + 1
    const cols = rawLines[i].split(',').map((c) => c.trim())

    if (cols.length < EXPECTED_CSV_HEADERS.length) {
      errors.push(
        `บรรทัดที่ ${rowNum}: จำนวนคอลัมน์ไม่ครบ (พบ ${cols.length} คอลัมน์)`,
      )
      continue
    }

    const course_code = cols[colIndex('course_code')].trim().toUpperCase()
    const course_name = cols[colIndex('course_name')].trim()
    const creditsStr = cols[colIndex('credits')].trim()
    const section = cols[colIndex('section')].trim() || '001'
    const dayRaw = cols[colIndex('day')].trim().toUpperCase()
    const start = normalizeTimeStr(cols[colIndex('start')])
    const end = normalizeTimeStr(cols[colIndex('end')])
    const room = cols[colIndex('room')].trim()
    const instructor = cols[colIndex('instructor')].trim()
    const onlineRaw = cols[colIndex('online_link')].trim().toLowerCase()

    const onlineUrlCol = colIndex('online_url')
    const contactUrlCol = colIndex('contact_url')
    const parsedOnlineUrl = onlineUrlCol !== -1 ? cols[onlineUrlCol]?.trim() : undefined
    const parsedContactUrl = contactUrlCol !== -1 ? cols[contactUrlCol]?.trim() : undefined

    const finalOnlineUrl =
      parsedOnlineUrl || KNOWN_COURSE_LINKS[course_code]?.online_url || undefined
    const finalContactUrl =
      parsedContactUrl || KNOWN_COURSE_LINKS[course_code]?.contact_url || undefined

    if (!course_code) {
      errors.push(`บรรทัดที่ ${rowNum}: รหัสวิชา (course_code) ห้ามว่าง`)
      continue
    }
    if (!course_name) {
      errors.push(`บรรทัดที่ ${rowNum} (${course_code}): ชื่อรายวิชา (course_name) ห้ามว่าง`)
      continue
    }

    const credits = Number(creditsStr)
    if (!Number.isInteger(credits) || credits <= 0 || credits > 15) {
      errors.push(
        `บรรทัดที่ ${rowNum} (${course_code}): หน่วยกิต "${creditsStr}" ไม่ถูกต้อง ต้องเป็นตัวเลขจำนวนเต็มบวก`,
      )
      continue
    }

    const normalizedDay = normalizeDayCode(dayRaw)
    if (!VALID_DAYS.includes(normalizedDay)) {
      errors.push(
        `บรรทัดที่ ${rowNum} (${course_code}): วันเรียน "${dayRaw}" ไม่ถูกต้อง ต้องเป็น MON, TUE, WED, THU, FRI, SAT หรือ SUN`,
      )
      continue
    }

    if (!TIME_REGEX.test(start)) {
      errors.push(
        `บรรทัดที่ ${rowNum} (${course_code}): เวลาเริ่ม "${start}" ไม่ถูกต้อง ต้องเป็นรูปแบบ HH:MM (เช่น 09:00)`,
      )
      continue
    }

    if (!TIME_REGEX.test(end)) {
      errors.push(
        `บรรทัดที่ ${rowNum} (${course_code}): เวลาเลิก "${end}" ไม่ถูกต้อง ต้องเป็นรูปแบบ HH:MM (เช่น 11:30)`,
      )
      continue
    }

    if (timeToMinutes(start) >= timeToMinutes(end)) {
      errors.push(
        `บรรทัดที่ ${rowNum} (${course_code}): เวลาเริ่ม (${start}) ต้องน้อยกว่าเวลาเลิก (${end})`,
      )
      continue
    }

    if (onlineRaw !== 'true' && onlineRaw !== 'false') {
      errors.push(
        `บรรทัดที่ ${rowNum} (${course_code}): ค่า online_link "${onlineRaw}" ไม่ถูกต้อง ต้องเป็น true หรือ false`,
      )
      continue
    }

    const itemLinks = buildDefaultCourseLinks({
      course_code,
      online_url: finalOnlineUrl,
      contact_url: finalContactUrl,
    })

    items.push({
      course_code,
      course_name,
      credits,
      section,
      day: normalizedDay,
      start,
      end,
      room,
      instructor,
      online_link: onlineRaw === 'true' || Boolean(finalOnlineUrl),
      online_url: finalOnlineUrl,
      contact_url: finalContactUrl,
      location_text: resolveLocationText(room),
      links: itemLinks,
    })
  }

  const { merged: dedupedItems } = mergeScheduleWithoutDuplicates([], items)
  return { items: dedupedItems, errors }
}

export function getSampleScheduleFromCsv(): CourseScheduleItem[] {
  const parsed = parseScheduleCsvText(sampleScheduleCsvRaw)
  return parsed.items
}

export const DEFAULT_SAMPLE_SCHEDULE: CourseScheduleItem[] = getSampleScheduleFromCsv()

export function makeSessionDedupeKey(item: {
  course_code: string
  day: string
  start: string
  end?: string
}): string {
  const code = (item.course_code || '').trim().toUpperCase()
  const day = normalizeDayCode(item.day || '')
  const start = normalizeTimeStr(item.start || '')
  return `${code}|${day}|${start}`
}

export function mergeScheduleWithoutDuplicates(
  existing: CourseScheduleItem[],
  incoming: CourseScheduleItem[],
): {
  merged: CourseScheduleItem[]
  addedCount: number
  updatedCount: number
} {
  const map = new Map<string, CourseScheduleItem>()
  for (const item of existing) {
    const key = makeSessionDedupeKey(item)
    const prev = map.get(key)
    if (!prev) {
      map.set(key, {
        ...item,
        course_code: item.course_code.trim().toUpperCase(),
        day: normalizeDayCode(item.day),
        start: normalizeTimeStr(item.start),
        end: normalizeTimeStr(item.end),
      })
    } else {
      map.set(key, {
        ...prev,
        ...item,
        course_code: item.course_code.trim().toUpperCase(),
        day: normalizeDayCode(item.day),
        start: normalizeTimeStr(item.start),
        end: normalizeTimeStr(item.end),
        course_id: item.course_id || prev.course_id,
        color: item.color || prev.color,
        notes: item.notes ?? prev.notes,
        location_text: item.location_text || prev.location_text,
        links: item.links && item.links.length > 0 ? item.links : prev.links,
        online_url: item.online_url || prev.online_url,
        contact_url: item.contact_url || prev.contact_url,
        online_link: item.online_link || prev.online_link,
      })
    }
  }

  let addedCount = 0
  let updatedCount = 0

  for (const inc of incoming) {
    const key = makeSessionDedupeKey(inc)
    const prev = map.get(key)
    if (prev) {
      map.set(key, {
        ...prev,
        ...inc,
        course_code: inc.course_code.trim().toUpperCase(),
        day: normalizeDayCode(inc.day),
        start: normalizeTimeStr(inc.start),
        end: normalizeTimeStr(inc.end),
        course_id: inc.course_id || prev.course_id,
        color: inc.color || prev.color,
        notes: inc.notes ?? prev.notes,
        location_text: inc.location_text || prev.location_text,
        links: inc.links && inc.links.length > 0 ? inc.links : prev.links,
        online_url: inc.online_url || prev.online_url,
        contact_url: inc.contact_url || prev.contact_url,
        online_link: inc.online_link || prev.online_link,
      })
      updatedCount++
    } else {
      map.set(key, {
        ...inc,
        course_code: inc.course_code.trim().toUpperCase(),
        day: normalizeDayCode(inc.day),
        start: normalizeTimeStr(inc.start),
        end: normalizeTimeStr(inc.end),
      })
      addedCount++
    }
  }

  return {
    merged: Array.from(map.values()),
    addedCount,
    updatedCount,
  }
}

function encodeSectionWithSemester(section: string, semester: string): string {
  const cleanSec = section.split('#')[0].trim() || '001'
  if (!semester || semester === DEFAULT_SEMESTER) {
    return cleanSec
  }
  return `${cleanSec}#${semester}`
}

function decodeSectionAndSemester(rawSection: string): {
  section: string
  semester: string
} {
  const [sec, sem] = (rawSection || '001').split('#')
  return {
    section: sec || '001',
    semester: sem || DEFAULT_SEMESTER,
  }
}

function withPrefix(key: string): string {
  return key.startsWith(STORAGE_PREFIX) ? key : `${STORAGE_PREFIX}${key}`
}

function stripPrefix(key: string): string {
  return key.startsWith(STORAGE_PREFIX) ? key.slice(STORAGE_PREFIX.length) : key
}

export function formatStorageErrorThai(error: unknown): string {
  return formatSupabaseErrorThai(error)
}

function isShareRoute(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.startsWith('/share/')
}

function getActiveGroupIdFromLocal(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_GROUP_STORAGE_KEY)
  } catch {
    return null
  }
}

class LocalStorageAdapter implements StorageAdapter {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = window.localStorage.getItem(withPrefix(key))
      if (raw === null) return null
      return JSON.parse(raw) as T
    } catch (error) {
      console.error(`Error reading key "${key}" from localStorage:`, error)
      return null
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      const serialized = JSON.stringify(value)
      window.localStorage.setItem(withPrefix(key), serialized)
    } catch (error) {
      console.error(`Error writing key "${key}" to localStorage:`, error)
      throw new Error('ไม่สามารถบันทึกข้อมูลลงในเครื่องได้ (พื้นที่จัดเก็บอาจเต็ม)')
    }
  }

  async remove(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(withPrefix(key))
    } catch (error) {
      console.error(`Error removing key "${key}" from localStorage:`, error)
      throw new Error('ไม่สามารถลบข้อมูลในเครื่องได้')
    }
  }

  async list<T = unknown>(prefix = ''): Promise<Array<{ key: string; value: T }>> {
    const fullPrefix = withPrefix(prefix)
    const results: Array<{ key: string; value: T }> = []

    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const rawKey = window.localStorage.key(i)
        if (rawKey && rawKey.startsWith(fullPrefix)) {
          const rawVal = window.localStorage.getItem(rawKey)
          if (rawVal !== null) {
            try {
              results.push({
                key: stripPrefix(rawKey),
                value: JSON.parse(rawVal) as T,
              })
            } catch {
              // ข้ามรายการที่ไม่ใช่ JSON ที่ถูกต้อง
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error listing keys with prefix "${prefix}" from localStorage:`, error)
    }

    return results
  }
}

export const localStore = new LocalStorageAdapter()

function parseKeyGroupSemester(rawKey: string): {
  baseKey: string
  groupId: string | null
  semester: string
} {
  const clean = stripPrefix(rawKey)
  const parts = clean.split(':')
  const baseKey = parts[0]
  const rawGroupId = parts[1] && parts[1] !== 'local' ? parts[1] : getActiveGroupIdFromLocal()
  const semester = parts[2] || DEFAULT_SEMESTER
  return {
    baseKey,
    groupId: rawGroupId,
    semester,
  }
}

class HybridSupabaseStorageAdapter implements StorageAdapter {
  private async getCurrentUser(): Promise<{ id: string; email?: string } | null> {
    if (!isSupabaseConfigured || !supabase) return null
    try {
      const { data } = await supabase.auth.getSession()
      return data.session?.user ?? null
    } catch {
      return null
    }
  }

  private async ensureGroupIdForUser(
    explicitGroupId: string | null,
    userId: string,
    allowCreate: boolean,
  ): Promise<string | null> {
    if (explicitGroupId) return explicitGroupId
    if (!supabase) return null

    const { data: existingGroups } = await supabase
      .from('groups')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)

    if (existingGroups && existingGroups.length > 0) {
      const gid = existingGroups[0].id as string
      try {
        window.localStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, gid)
      } catch {
        // ignore
      }
      return gid
    }

    if (!allowCreate) return null

    // สร้างกลุ่มเริ่มต้นอัตโนมัติหากยังไม่มีกลุ่มในระบบเลย
    const { data: createdGroup, error } = await supabase
      .from('groups')
      .insert({
        name: 'กลุ่มตารางเรียนหลัก',
        description: 'กลุ่มเริ่มต้นสำหรับจัดการตารางเรียนและงาน',
        created_by: userId,
      })
      .select('id')
      .single()

    if (error || !createdGroup) {
      throw new Error(formatStorageErrorThai(error))
    }

    const newGroupId = createdGroup.id as string
    try {
      window.localStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, newGroupId)
    } catch {
      // ignore
    }
    return newGroupId
  }

  async get<T>(key: string): Promise<T | null> {
    const user = await this.getCurrentUser()

    // ผู้ใช้ที่ไม่ล็อกอินและไม่ใช่ลิงก์แชร์ ใช้ localStorage ตามเดิม
    if (!user || !supabase) {
      if (isShareRoute()) return null
      const { baseKey } = parseKeyGroupSemester(key)
      if (baseKey === 'class_sessions') {
        const localList = await localStore.get<CourseScheduleItem[]>(key)
        if (localList && Array.isArray(localList)) {
          const { merged } = mergeScheduleWithoutDuplicates([], localList)
          if (merged.length < localList.length) {
            void localStore.set(key, merged)
          }
          return merged as unknown as T
        }
        return (localList ?? []) as unknown as T
      }

      return localStore.get<T>(key)
    }

    const { baseKey, groupId: rawGroupId, semester } = parseKeyGroupSemester(key)

    try {
      if (baseKey === 'routine_items') {
        const { data, error } = await supabase
          .from('routine_items')
          .select('*')
          .eq('user_id', user.id)
          .order('start_time', { ascending: true })

        if (error) throw new Error(formatStorageErrorThai(error))
        return (data ?? []) as unknown as T
      }

      if (baseKey === 'class_sessions') {
        const groupId = await this.ensureGroupIdForUser(rawGroupId, user.id, false)
        if (!groupId) return [] as unknown as T

        const [{ data, error }, { data: coursesData }] = await Promise.all([
          supabase
            .from('class_sessions')
            .select('*')
            .eq('group_id', groupId)
            .order('day', { ascending: true })
            .order('start_time', { ascending: true }),
          supabase.from('courses').select('*').eq('group_id', groupId),
        ])

        if (error) throw new Error(formatStorageErrorThai(error))

        // อ่านข้อมูลเสริมใน localStorage กรณีฐานข้อมูลยังไม่ได้รันไฟล์ migration-course-details.sql
        const localCourseMetaMap =
          (await localStore.get<
            Record<
              string,
              {
                color?: string
                notes?: string
                location_text?: string
                links?: CourseLinkItem[]
              }
            >
          >(`course_meta:${groupId}:${semester}`)) ?? {}

        const courseRowByCode = new Map<string, Record<string, unknown>>()
        for (const c of coursesData ?? []) {
          const cDec = decodeSectionAndSemester((c.section as string) || '001')
          if (cDec.semester === semester) {
            const cCode = ((c.course_code as string) || '').trim().toUpperCase()
            if (cCode) courseRowByCode.set(cCode, c as Record<string, unknown>)
          }
        }

        const mapped: CourseScheduleItem[] = []
        const seenKeys = new Set<string>()
        const duplicateDbIds: string[] = []

        for (const row of data ?? []) {
          const decoded = decodeSectionAndSemester(row.section as string)
          if (decoded.semester !== semester) continue

          const code = (row.course_code as string).trim().toUpperCase()
          const dayCode = normalizeDayCode(row.day as string)
          const startTime = normalizeTimeStr(row.start_time as string)
          const endTime = normalizeTimeStr(row.end_time as string)

          const courseRow = courseRowByCode.get(code)
          const localMeta = localCourseMetaMap[code]

          const dbLinksRaw = courseRow?.links
          const dbLinks: CourseLinkItem[] | undefined = Array.isArray(dbLinksRaw)
            ? (dbLinksRaw as CourseLinkItem[])
            : undefined

          const resolvedLinks =
            dbLinks && dbLinks.length > 0
              ? dbLinks
              : localMeta?.links && localMeta.links.length > 0
                ? localMeta.links
                : buildDefaultCourseLinks({
                    course_code: code,
                    online_url: KNOWN_COURSE_LINKS[code]?.online_url,
                    contact_url: KNOWN_COURSE_LINKS[code]?.contact_url,
                  })

          const meetLink = resolvedLinks.find((l) => l.type === 'meet')?.url
          const lineOrContactLink = resolvedLinks.find(
            (l) => l.type === 'line' || l.type === 'contact',
          )?.url

          const item: CourseScheduleItem = {
            id: row.id as string,
            course_id:
              (row.course_id as string) || (courseRow?.id as string) || undefined,
            group_id: row.group_id as string,
            course_code: code,
            course_name: row.course_name as string,
            credits: Number(row.credits ?? 3),
            section: decoded.section,
            day: dayCode,
            start: startTime,
            end: endTime,
            room: row.room as string,
            instructor: row.instructor as string,
            online_link: Boolean(row.online_link) || Boolean(meetLink),
            online_url: meetLink || KNOWN_COURSE_LINKS[code]?.online_url,
            contact_url: lineOrContactLink || KNOWN_COURSE_LINKS[code]?.contact_url,
            color:
              ((courseRow?.color as string) || localMeta?.color || '').trim() ||
              undefined,
            notes:
              typeof courseRow?.notes === 'string'
                ? courseRow.notes
                : (localMeta?.notes ?? ''),
            location_text:
              ((courseRow?.location_text as string) || localMeta?.location_text || '').trim() ||
              resolveLocationText(row.room as string),
            links: resolvedLinks,
          }

          const dedupeKey = makeSessionDedupeKey(item)
          if (seenKeys.has(dedupeKey)) {
            if (row.id) {
              duplicateDbIds.push(row.id as string)
            }
          } else {
            seenKeys.add(dedupeKey)
            mapped.push(item)
          }
        }

        // ลบแถวซ้ำออกจากฐานข้อมูล Supabase อัตโนมัติ เพื่อไม่ให้มีข้อมูลซ้ำตกค้าง
        if (duplicateDbIds.length > 0) {
          void supabase
            .from('class_sessions')
            .delete()
            .in('id', duplicateDbIds)
            .then(({ error: delErr }) => {
              if (delErr) {
                console.warn('Auto-deleted duplicate class_sessions rows from DB:', duplicateDbIds.length)
              }
            })
        }

        return mapped as unknown as T
      }

      if (baseKey === 'tasks') {
        const groupId = await this.ensureGroupIdForUser(rawGroupId, user.id, false)
        if (!groupId) return [] as unknown as T
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('group_id', groupId)
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false })

        if (error) throw new Error(formatStorageErrorThai(error))
        return (data ?? []) as unknown as T
      }

      if (baseKey === 'messages') {
        const groupId = await this.ensureGroupIdForUser(rawGroupId, user.id, false)
        if (!groupId) return [] as unknown as T
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('group_id', groupId)
          .order('created_at', { ascending: true })

        if (error) throw new Error(formatStorageErrorThai(error))
        return (data ?? []) as unknown as T
      }

      if (baseKey === 'class_sessions') {
        const localList = await localStore.get<CourseScheduleItem[]>(key)
        if (localList && Array.isArray(localList)) {
          const { merged } = mergeScheduleWithoutDuplicates([], localList)
          if (merged.length < localList.length) {
            void localStore.set(key, merged)
          }
          return merged as unknown as T
        }
        return (localList ?? []) as unknown as T
      }

      return localStore.get<T>(key)
    } catch (err) {
      throw new Error(formatStorageErrorThai(err))
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const user = await this.getCurrentUser()

    // ผู้ใช้ที่ไม่ล็อกอินและไม่ใช่ลิงก์แชร์ ใช้ localStorage ตามเดิม
    if (!user || !supabase) {
      if (isShareRoute()) {
        throw new Error('ลิงก์แชร์เป็นโหมดอ่านอย่างเดียว ไม่สามารถแก้ไขข้อมูลได้')
      }
      return localStore.set<T>(key, value)
    }

    const { baseKey, groupId: rawGroupId, semester } = parseKeyGroupSemester(key)

    try {
      if (baseKey === 'routine_items' && Array.isArray(value)) {
        const items = value as unknown as RoutineItem[]
        const { error: delError } = await supabase
          .from('routine_items')
          .delete()
          .eq('user_id', user.id)

        if (delError) throw new Error(formatStorageErrorThai(delError))

        if (items.length > 0) {
          const payload = items.map((item) => ({
            user_id: user.id,
            title: item.title,
            day: item.day,
            start_time: item.start_time,
            end_time: item.end_time,
            category: item.category || 'general',
            notes: item.notes || '',
          }))
          const { error: insError } = await supabase.from('routine_items').insert(payload)
          if (insError) throw new Error(formatStorageErrorThai(insError))
        }
        return
      }

      if (baseKey === 'class_sessions' && Array.isArray(value)) {
        const groupId = await this.ensureGroupIdForUser(rawGroupId, user.id, true)
        if (!groupId) {
          throw new Error('กรุณาเลือกหรือสร้างกลุ่มก่อนบันทึกตารางเรียน')
        }

        // กรองข้อมูลซ้ำก่อนบันทึกลงตาราง courses และ class_sessions
        const { merged: dedupedItems } = mergeScheduleWithoutDuplicates(
          [],
          value as unknown as CourseScheduleItem[],
        )

        // 1. ซิงค์ลงตาราง courses ของกลุ่ม (กันซ้ำตาม course_code ในภาคการศึกษานั้น)
        const { data: existingCoursesRaw, error: fetchCoursesErr } = await supabase
          .from('courses')
          .select('*')
          .eq('group_id', groupId)

        if (fetchCoursesErr) throw new Error(formatStorageErrorThai(fetchCoursesErr))

        const existingCourses = (existingCoursesRaw ?? []).filter(
          (c) => decodeSectionAndSemester(c.section as string).semester === semester,
        )

        const courseIdByCode = new Map<string, string>()

        // รวบรวมรายวิชาที่ไม่ซ้ำจากรายการคาบเรียน
        const uniqueCourseMap = new Map<string, CourseScheduleItem>()
        for (const item of dedupedItems) {
          const code = item.course_code.trim().toUpperCase()
          if (!uniqueCourseMap.has(code)) {
            uniqueCourseMap.set(code, item)
          }
        }

        for (const [code, item] of uniqueCourseMap.entries()) {
          const encodedSec = encodeSectionWithSemester(item.section, semester)
          const matchCourse = existingCourses.find(
            (c) => (c.course_code as string).toUpperCase() === code,
          )

          const itemLinks = buildDefaultCourseLinks(item)
          const itemLocationText =
            item.location_text || resolveLocationText(item.room)

          if (matchCourse) {
            const fullUpdatePayload: Record<string, unknown> = {
              course_name: item.course_name,
              credits: Number(item.credits ?? 3),
              section: encodedSec,
              instructor: item.instructor || '',
              online_link: Boolean(item.online_link),
            }
            if (item.color !== undefined) fullUpdatePayload.color = item.color
            if (item.notes !== undefined) fullUpdatePayload.notes = item.notes
            if (item.location_text !== undefined) {
              fullUpdatePayload.location_text = item.location_text
            } else if (!matchCourse.location_text) {
              fullUpdatePayload.location_text = itemLocationText
            }
            if (item.links && item.links.length > 0) {
              fullUpdatePayload.links = item.links
            } else if (
              !Array.isArray(matchCourse.links) ||
              (matchCourse.links as unknown[]).length === 0
            ) {
              fullUpdatePayload.links = itemLinks
            }

            const { error: updCourseErr } = await supabase
              .from('courses')
              .update(fullUpdatePayload)
              .eq('id', matchCourse.id as string)

            if (updCourseErr) {
              const errMsg = String(
                (updCourseErr as { message?: string }).message ?? updCourseErr,
              )
              if (errMsg.includes('column') && errMsg.includes('does not exist')) {
                const { error: fallbackUpdErr } = await supabase
                  .from('courses')
                  .update({
                    course_name: item.course_name,
                    credits: Number(item.credits ?? 3),
                    section: encodedSec,
                    instructor: item.instructor || '',
                    online_link: Boolean(item.online_link),
                  })
                  .eq('id', matchCourse.id as string)
                if (fallbackUpdErr) throw new Error(formatStorageErrorThai(fallbackUpdErr))
              } else {
                throw new Error(formatStorageErrorThai(updCourseErr))
              }
            }
            courseIdByCode.set(code, matchCourse.id as string)
          } else {
            const { data: insertedCourse, error: insCourseErr } = await supabase
              .from('courses')
              .insert({
                group_id: groupId,
                course_code: code,
                course_name: item.course_name,
                credits: Number(item.credits ?? 3),
                section: encodedSec,
                instructor: item.instructor || '',
                online_link: Boolean(item.online_link),
                color: item.color || '',
                notes: item.notes || '',
                location_text: itemLocationText,
                links: itemLinks,
                created_by: user.id,
              })
              .select('id')
              .single()

            if (insCourseErr) {
              const errMsg = String(
                (insCourseErr as { message?: string }).message ?? insCourseErr,
              )
              if (errMsg.includes('column') && errMsg.includes('does not exist')) {
                const { data: fallbackIns, error: fallbackInsErr } = await supabase
                  .from('courses')
                  .insert({
                    group_id: groupId,
                    course_code: code,
                    course_name: item.course_name,
                    credits: Number(item.credits ?? 3),
                    section: encodedSec,
                    instructor: item.instructor || '',
                    online_link: Boolean(item.online_link),
                    created_by: user.id,
                  })
                  .select('id')
                  .single()
                if (fallbackInsErr) throw new Error(formatStorageErrorThai(fallbackInsErr))
                if (fallbackIns?.id) {
                  courseIdByCode.set(code, fallbackIns.id as string)
                }
              } else {
                throw new Error(formatStorageErrorThai(insCourseErr))
              }
            } else if (insertedCourse?.id) {
              courseIdByCode.set(code, insertedCourse.id as string)
            }
          }
        }

        // 2. ซิงค์ลงตาราง class_sessions ของกลุ่ม (กันซ้ำตาม course_code + day + start_time + end_time)
        const { data: existingSessionsRaw, error: fetchSessErr } = await supabase
          .from('class_sessions')
          .select('*')
          .eq('group_id', groupId)

        if (fetchSessErr) throw new Error(formatStorageErrorThai(fetchSessErr))

        const existingSessions = (existingSessionsRaw ?? []).filter(
          (s) => decodeSectionAndSemester(s.section as string).semester === semester,
        )

        const keptSessionIds = new Set<string>()

        for (const item of dedupedItems) {
          const code = item.course_code.trim().toUpperCase()
          const encodedSec = encodeSectionWithSemester(item.section, semester)
          const courseId = courseIdByCode.get(code) ?? null
          const targetKey = makeSessionDedupeKey(item)

          const matchSession = existingSessions.find((s) => {
            const sKey = makeSessionDedupeKey({
              course_code: s.course_code as string,
              day: s.day as string,
              start: s.start_time as string,
              end: s.end_time as string,
            })
            return sKey === targetKey
          })

          if (matchSession) {
            keptSessionIds.add(matchSession.id as string)
            const { error: updSessErr } = await supabase
              .from('class_sessions')
              .update({
                course_id: courseId,
                course_code: code,
                course_name: item.course_name,
                credits: Number(item.credits ?? 3),
                section: encodedSec,
                day: item.day,
                start_time: item.start,
                end_time: item.end,
                room: item.room || '',
                instructor: item.instructor || '',
                online_link: Boolean(item.online_link),
              })
              .eq('id', matchSession.id as string)

            if (updSessErr) throw new Error(formatStorageErrorThai(updSessErr))
          } else {
            const { data: insSess, error: insSessErr } = await supabase
              .from('class_sessions')
              .insert({
                group_id: groupId,
                course_id: courseId,
                course_code: code,
                course_name: item.course_name,
                credits: Number(item.credits ?? 3),
                section: encodedSec,
                day: item.day,
                start_time: item.start,
                end_time: item.end,
                room: item.room || '',
                instructor: item.instructor || '',
                online_link: Boolean(item.online_link),
              })
              .select('id')
              .single()

            if (insSessErr) throw new Error(formatStorageErrorThai(insSessErr))
            if (insSess?.id) {
              keptSessionIds.add(insSess.id as string)
            }
          }
        }

        // ลบเฉพาะแถวที่ถูกลบออกในภาคการศึกษานี้ (สำหรับกรณีลบรายวิชา)
        const removedSessionIds = existingSessions
          .map((s) => s.id as string)
          .filter((id) => !keptSessionIds.has(id))

        if (removedSessionIds.length > 0) {
          const { error: delSessErr } = await supabase
            .from('class_sessions')
            .delete()
            .in('id', removedSessionIds)

          if (delSessErr) throw new Error(formatStorageErrorThai(delSessErr))
        }

        // ลบรายวิชาใน courses ที่ไม่มีคาบเรียนเหลืออยู่ในภาคการศึกษานี้
        const removedCourseIds = existingCourses
          .filter((c) => !uniqueCourseMap.has((c.course_code as string).toUpperCase()))
          .map((c) => c.id as string)

        if (removedCourseIds.length > 0) {
          await supabase.from('courses').delete().in('id', removedCourseIds)
        }

        return
      }

      return localStore.set<T>(key, value)
    } catch (err) {
      throw new Error(formatStorageErrorThai(err))
    }
  }

  async remove(key: string): Promise<void> {
    const user = await this.getCurrentUser()

    if (!user || !supabase) {
      if (isShareRoute()) {
        throw new Error('ลิงก์แชร์เป็นโหมดอ่านอย่างเดียว ไม่สามารถลบข้อมูลได้')
      }
      return localStore.remove(key)
    }

    const { baseKey, groupId: rawGroupId, semester } = parseKeyGroupSemester(key)

    try {
      if (baseKey === 'routine_items') {
        const { error } = await supabase.from('routine_items').delete().eq('user_id', user.id)
        if (error) throw new Error(formatStorageErrorThai(error))
        return
      }

      if (baseKey === 'class_sessions') {
        const groupId = await this.ensureGroupIdForUser(rawGroupId, user.id, false)
        if (!groupId) return

        const { data: existingSessions } = await supabase
          .from('class_sessions')
          .select('id, section')
          .eq('group_id', groupId)

        const targetSessionIds = (existingSessions ?? [])
          .filter((s) => decodeSectionAndSemester(s.section as string).semester === semester)
          .map((s) => s.id as string)

        if (targetSessionIds.length > 0) {
          const { error: delSessErr } = await supabase
            .from('class_sessions')
            .delete()
            .in('id', targetSessionIds)
          if (delSessErr) throw new Error(formatStorageErrorThai(delSessErr))
        }

        const { data: existingCourses } = await supabase
          .from('courses')
          .select('id, section')
          .eq('group_id', groupId)

        const targetCourseIds = (existingCourses ?? [])
          .filter((c) => decodeSectionAndSemester(c.section as string).semester === semester)
          .map((c) => c.id as string)

        if (targetCourseIds.length > 0) {
          const { error: delCourseErr } = await supabase
            .from('courses')
            .delete()
            .in('id', targetCourseIds)
          if (delCourseErr) throw new Error(formatStorageErrorThai(delCourseErr))
        }

        return
      }

      return localStore.remove(key)
    } catch (err) {
      throw new Error(formatStorageErrorThai(err))
    }
  }

  async list<T = unknown>(prefix = ''): Promise<Array<{ key: string; value: T }>> {
    const user = await this.getCurrentUser()
    if (!user || !supabase) {
      if (isShareRoute()) return []
      return localStore.list<T>(prefix)
    }

    if (prefix === 'routine_items' || prefix === 'class_sessions' || prefix === 'tasks') {
      const val = await this.get<T>(prefix)
      return val !== null ? [{ key: prefix, value: val }] : []
    }

    return localStore.list<T>(prefix)
  }
}

export async function hasLocalDataToMigrate(userId: string): Promise<boolean> {
  try {
    const alreadyMigrated = window.localStorage.getItem(`${MIGRATED_FLAG_PREFIX}${userId}`)
    if (alreadyMigrated === 'true') return false

    const routines = await localStore.get<RoutineItem[]>('routine_items')
    const sessions = await localStore.get<CourseScheduleItem[]>(
      `class_sessions:local:${DEFAULT_SEMESTER}`,
    )
    const legacySessions = await localStore.get<CourseScheduleItem[]>('class_sessions')
    const tasks = await localStore.get<TaskItem[]>('tasks')

    return Boolean(
      (routines && routines.length > 0) ||
        (sessions && sessions.length > 0) ||
        (legacySessions && legacySessions.length > 0) ||
        (tasks && tasks.length > 0),
    )
  } catch {
    return false
  }
}

export async function migrateLocalDataToSupabase(
  userId: string,
  groupId: string | null,
  canEditGroup: boolean,
): Promise<{ migratedCount: number; error: string | null }> {
  if (!supabase) {
    return { migratedCount: 0, error: 'ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล Supabase' }
  }

  let migratedCount = 0

  try {
    const localRoutines = await localStore.get<RoutineItem[]>('routine_items')
    if (localRoutines && localRoutines.length > 0) {
      const routinePayload = localRoutines.map((item) => ({
        user_id: userId,
        title: item.title,
        day: item.day,
        start_time: item.start_time,
        end_time: item.end_time,
        category: item.category || 'general',
        notes: item.notes || '',
      }))
      const { error } = await supabase.from('routine_items').insert(routinePayload)
      if (error) throw error
      migratedCount += routinePayload.length
      await localStore.remove('routine_items')
    }

    if (groupId && canEditGroup) {
      const localSessions =
        (await localStore.get<CourseScheduleItem[]>(
          `class_sessions:local:${DEFAULT_SEMESTER}`,
        )) ?? (await localStore.get<CourseScheduleItem[]>('class_sessions'))

      if (localSessions && localSessions.length > 0) {
        await storage.set(`class_sessions:${groupId}:${DEFAULT_SEMESTER}`, localSessions)
        migratedCount += localSessions.length
        await localStore.remove(`class_sessions:local:${DEFAULT_SEMESTER}`)
        await localStore.remove('class_sessions')
      }

      const localTasks = await localStore.get<TaskItem[]>('tasks')
      if (localTasks && localTasks.length > 0) {
        const taskPayload = localTasks.map((t) => ({
          group_id: groupId,
          title: t.title,
          description: t.description || '',
          task_type: t.task_type || 'homework',
          course_code: t.course_code || '',
          due_date: t.due_date || null,
          status: t.status || 'todo',
          assignee_ids: [userId],
          created_by: userId,
        }))
        const { error } = await supabase.from('tasks').insert(taskPayload)
        if (!error) {
          migratedCount += taskPayload.length
          await localStore.remove('tasks')
        }
      }
    }

    window.localStorage.setItem(`${MIGRATED_FLAG_PREFIX}${userId}`, 'true')
    return { migratedCount, error: null }
  } catch (err) {
    return { migratedCount, error: formatStorageErrorThai(err) }
  }
}

export const storage: StorageAdapter = new HybridSupabaseStorageAdapter()

/**
 * บันทึกรายละเอียดรายวิชา (สีวิชา, โน้ต, ข้อความห้องเต็ม, ลิงก์) ผ่าน storage
 * พร้อมตรวจสอบความปลอดภัยของ URL (https:// เท่านั้น) และบังคับสิทธิ์ RLS
 */
export async function saveCourseDetails(params: {
  storageKey: string
  courseCode: string
  color: string
  notes: string
  locationText: string
  links: CourseLinkItem[]
  currentSessions: CourseScheduleItem[]
}): Promise<CourseScheduleItem[]> {
  if (isShareRoute()) {
    throw new Error('ลิงก์แชร์เป็นโหมดอ่านอย่างเดียว ไม่สามารถแก้ไขรายละเอียดวิชาได้')
  }

  const cleanCode = params.courseCode.trim().toUpperCase()
  const sanitizedLinks: CourseLinkItem[] = []

  for (const link of params.links) {
    const label = (link.label || '').trim()
    const rawUrl = (link.url || '').trim()
    if (!label && !rawUrl) continue
    if (!label) {
      throw new Error('กรุณาระบุชื่อป้ายกำกับลิงก์ (Label) ให้ครบถ้วน')
    }
    const check = validateHttpsCourseUrl(rawUrl)
    if (!check.valid || !check.cleanUrl) {
      throw new Error(check.error || 'ลิงก์ไม่ถูกต้อง ต้องขึ้นต้นด้วย https:// เท่านั้น')
    }
    sanitizedLinks.push({
      type: link.type || 'other',
      label,
      url: check.cleanUrl,
    })
  }

  const meetUrl = sanitizedLinks.find((l) => l.type === 'meet')?.url
  const lineUrl = sanitizedLinks.find(
    (l) => l.type === 'line' || l.type === 'contact',
  )?.url

  const updatedSessions = params.currentSessions.map((s) => {
    if (s.course_code.trim().toUpperCase() !== cleanCode) return s
    return {
      ...s,
      color: params.color.trim() || undefined,
      notes: params.notes,
      location_text: params.locationText.trim() || resolveLocationText(s.room),
      links: sanitizedLinks,
      online_url: meetUrl,
      contact_url: lineUrl,
      online_link: Boolean(meetUrl) || s.online_link,
    }
  })

  // บันทึกลงตารางผ่าน storage.set (ซิงค์ทั้ง Supabase courses และ localStorage)
  const { groupId: rawGroupId, semester } = parseKeyGroupSemester(params.storageKey)
  if (supabase) {
    const { data: sessionData } = await supabase.auth.getSession()
    const currentUser = sessionData.session?.user
    if (currentUser && rawGroupId) {
      // ตรวจสอบสิทธิ์ผ่านการอัปเดตตาราง courses โดยตรงก่อน
      const { data: matchingCourses, error: fetchErr } = await supabase
        .from('courses')
        .select('id, section')
        .eq('group_id', rawGroupId)
        .ilike('course_code', cleanCode)

      if (fetchErr) {
        throw new Error(formatStorageErrorThai(fetchErr))
      }

      const targetCourse = (matchingCourses ?? []).find(
        (c) => decodeSectionAndSemester(c.section as string).semester === semester,
      )

      if (targetCourse?.id) {
        const { data: updatedRows, error: updErr } = await supabase
          .from('courses')
          .update({
            color: params.color.trim(),
            notes: params.notes,
            location_text: params.locationText.trim(),
            links: sanitizedLinks,
            online_link: Boolean(meetUrl),
          })
          .eq('id', targetCourse.id as string)
          .select('id')

        if (updErr) {
          const errMsg = String((updErr as { message?: string }).message ?? updErr)
          if (errMsg.includes('column') && errMsg.includes('does not exist')) {
            // กรณีฐานข้อมูลยังไม่ได้รัน migration-course-details.sql ให้ทดสอบสิทธิ์ด้วยการอัปเดต online_link
            const { data: testRows, error: testErr } = await supabase
              .from('courses')
              .update({ online_link: Boolean(meetUrl) })
              .eq('id', targetCourse.id as string)
              .select('id')

            if (testErr) throw new Error(formatStorageErrorThai(testErr))
            if (!testRows || testRows.length === 0) {
              throw new Error(
                'คุณอยู่ในโหมดผู้ชม จึงไม่มีสิทธิ์แก้ไขข้อมูลรายวิชา (ถูกปฏิเสธโดย RLS)',
              )
            }
          } else {
            throw new Error(formatStorageErrorThai(updErr))
          }
        } else if (!updatedRows || updatedRows.length === 0) {
          throw new Error(
            'คุณอยู่ในโหมดผู้ชม จึงไม่มีสิทธิ์แก้ไขข้อมูลรายวิชา (ถูกปฏิเสธโดย RLS)',
          )
        }
      }

      // เก็บสำรองใน localStore สำหรับกลุ่มนั้นด้วยเผื่อยังไม่ได้รันไฟล์ migration
      const metaKey = `course_meta:${rawGroupId}:${semester}`
      const existingMeta =
        (await localStore.get<Record<string, unknown>>(metaKey)) ?? {}
      existingMeta[cleanCode] = {
        color: params.color.trim(),
        notes: params.notes,
        location_text: params.locationText.trim(),
        links: sanitizedLinks,
      }
      await localStore.set(metaKey, existingMeta)
    }
  }

  await storage.set(params.storageKey, updatedSessions)
  return updatedSessions
}

export default storage
