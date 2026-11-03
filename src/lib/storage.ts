import sampleScheduleCsvRaw from '../../sample-data/schedule.csv?raw'
import { formatSupabaseErrorThai } from './auth'
import { isSupabaseConfigured, supabase } from './supabase'
import type {
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

  if (missingHeaders.length > 0 || headerCols.length !== EXPECTED_CSV_HEADERS.length) {
    return {
      items: [],
      errors: [
        `คอลัมน์ส่วนหัว (Header) ในไฟล์ CSV ไม่ถูกต้อง (ต้องมี: ${EXPECTED_CSV_HEADERS.join(', ')})`,
      ],
    }
  }

  const colIndex = (name: string) => headerCols.indexOf(name)

  for (let i = 1; i < rawLines.length; i++) {
    const rowNum = i + 1
    const cols = rawLines[i].split(',').map((c) => c.trim())

    if (cols.length !== EXPECTED_CSV_HEADERS.length) {
      errors.push(
        `บรรทัดที่ ${rowNum}: จำนวนคอลัมน์ไม่ครบ 10 คอลัมน์ (พบ ${cols.length} คอลัมน์)`,
      )
      continue
    }

    const course_code = cols[colIndex('course_code')].toUpperCase()
    const course_name = cols[colIndex('course_name')]
    const creditsStr = cols[colIndex('credits')]
    const section = cols[colIndex('section')] || '001'
    const dayRaw = cols[colIndex('day')].toUpperCase()
    const start = cols[colIndex('start')]
    const end = cols[colIndex('end')]
    const room = cols[colIndex('room')]
    const instructor = cols[colIndex('instructor')]
    const onlineRaw = cols[colIndex('online_link')].toLowerCase()

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

    if (!VALID_DAYS.includes(dayRaw as DayOfWeek)) {
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

    items.push({
      course_code,
      course_name,
      credits,
      section,
      day: dayRaw as DayOfWeek,
      start,
      end,
      room,
      instructor,
      online_link: onlineRaw === 'true',
    })
  }

  return { items, errors }
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
  end: string
}): string {
  return `${item.course_code.trim().toUpperCase()}|${item.day.trim().toUpperCase()}|${item.start.trim()}|${item.end.trim()}`
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
    map.set(makeSessionDedupeKey(item), { ...item })
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
      })
      updatedCount++
    } else {
      map.set(key, {
        ...inc,
        course_code: inc.course_code.trim().toUpperCase(),
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

        const { data, error } = await supabase
          .from('class_sessions')
          .select('*')
          .eq('group_id', groupId)
          .order('day', { ascending: true })
          .order('start_time', { ascending: true })

        if (error) throw new Error(formatStorageErrorThai(error))

        const mapped: CourseScheduleItem[] = []
        for (const row of data ?? []) {
          const decoded = decodeSectionAndSemester(row.section as string)
          if (decoded.semester !== semester) continue

          mapped.push({
            id: row.id as string,
            group_id: row.group_id as string,
            course_code: row.course_code as string,
            course_name: row.course_name as string,
            credits: Number(row.credits ?? 3),
            section: decoded.section,
            day: row.day as DayOfWeek,
            start: row.start_time as string,
            end: row.end_time as string,
            room: row.room as string,
            instructor: row.instructor as string,
            online_link: Boolean(row.online_link),
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

          if (matchCourse) {
            const { error: updCourseErr } = await supabase
              .from('courses')
              .update({
                course_name: item.course_name,
                credits: Number(item.credits ?? 3),
                section: encodedSec,
                instructor: item.instructor || '',
                online_link: Boolean(item.online_link),
              })
              .eq('id', matchCourse.id as string)

            if (updCourseErr) throw new Error(formatStorageErrorThai(updCourseErr))
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
                created_by: user.id,
              })
              .select('id')
              .single()

            if (insCourseErr) throw new Error(formatStorageErrorThai(insCourseErr))
            if (insertedCourse?.id) {
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
export default storage
