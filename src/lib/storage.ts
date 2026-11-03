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

export const DEFAULT_SAMPLE_SCHEDULE: CourseScheduleItem[] = [
  {
    course_code: 'ICT35467',
    course_name: 'การบริหารโครงการเทคโนโลยีสารสนเทศ',
    credits: 3,
    section: '001',
    day: 'TUE',
    start: '09:00',
    end: '11:30',
    room: '05-0704',
    instructor: 'สิริรัตน์ มัชฌิมาดิลก',
    online_link: true,
  },
  {
    course_code: 'MGT23667',
    course_name: 'การจัดการทรัพยากรมนุษย์ในยุคดิจิทัล',
    credits: 3,
    section: '002',
    day: 'WED',
    start: '09:00',
    end: '11:30',
    room: '05-0603',
    instructor: 'อรนิษฐ์ แสงทองสุข',
    online_link: false,
  },
  {
    course_code: 'MGT13267',
    course_name: 'การจัดการนวัตกรรม และการเปลี่ยนแปลงในสังคมยุคดิจิทัล',
    credits: 3,
    section: '002',
    day: 'WED',
    start: '12:00',
    end: '14:30',
    room: '05-0608',
    instructor: 'อรนิษฐ์ แสงทองสุข',
    online_link: false,
  },
  {
    course_code: 'MGT13167',
    course_name: 'สภาพแวดล้อมทางธุรกิจและการจัดการ',
    credits: 3,
    section: '002',
    day: 'FRI',
    start: '09:00',
    end: '11:30',
    room: '05-1204',
    instructor: 'รพีพรรณ โสภากุล',
    online_link: false,
  },
  {
    course_code: 'MGT33267',
    course_name: 'การวิเคราะห์ธุรกิจเพื่อการตัดสินใจเชิงกลยุทธ์',
    credits: 3,
    section: '002',
    day: 'FRI',
    start: '12:00',
    end: '14:30',
    room: '05-0407',
    instructor: 'ณิชชาพัชร์ เลิศธีรชัยสกุล',
    online_link: true,
  },
  {
    course_code: 'MGT33367',
    course_name: 'เครื่องมือดิจิทัลในการจัดการธุรกิจสมัยใหม่',
    credits: 3,
    section: '002',
    day: 'FRI',
    start: '15:00',
    end: '17:30',
    room: '05-0705',
    instructor: 'ณิชชาพัชร์ เลิศธีรชัยสกุล',
    online_link: false,
  },
]

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

function parseKeyAndGroup(rawKey: string): { baseKey: string; groupId: string | null } {
  const clean = stripPrefix(rawKey)
  const [baseKey, explicitGroup] = clean.split(':')
  return {
    baseKey,
    groupId: explicitGroup || getActiveGroupIdFromLocal(),
  }
}

class HybridSupabaseStorageAdapter implements StorageAdapter {
  private async getCurrentUserId(): Promise<string | null> {
    if (!isSupabaseConfigured || !supabase) return null
    try {
      const { data } = await supabase.auth.getSession()
      return data.session?.user?.id ?? null
    } catch {
      return null
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const userId = await this.getCurrentUserId()

    // ผู้ใช้ที่ไม่ล็อกอินและไม่ใช่ลิงก์แชร์ ใช้ localStorage ตามเดิม
    if (!userId || !supabase) {
      if (isShareRoute()) return null
      return localStore.get<T>(key)
    }

    const { baseKey, groupId } = parseKeyAndGroup(key)

    try {
      if (baseKey === 'routine_items') {
        const { data, error } = await supabase
          .from('routine_items')
          .select('*')
          .eq('user_id', userId)
          .order('start_time', { ascending: true })

        if (error) throw new Error(formatStorageErrorThai(error))
        return (data ?? []) as unknown as T
      }

      if (baseKey === 'class_sessions') {
        if (!groupId) return [] as unknown as T
        const { data, error } = await supabase
          .from('class_sessions')
          .select('*')
          .eq('group_id', groupId)
          .order('day', { ascending: true })
          .order('start_time', { ascending: true })

        if (error) throw new Error(formatStorageErrorThai(error))

        const mapped: CourseScheduleItem[] = (data ?? []).map((row) => ({
          id: row.id as string,
          group_id: row.group_id as string,
          course_code: row.course_code as string,
          course_name: row.course_name as string,
          credits: Number(row.credits ?? 3),
          section: row.section as string,
          day: row.day as DayOfWeek,
          start: row.start_time as string,
          end: row.end_time as string,
          room: row.room as string,
          instructor: row.instructor as string,
          online_link: Boolean(row.online_link),
        }))

        return mapped as unknown as T
      }

      if (baseKey === 'tasks') {
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
    const userId = await this.getCurrentUserId()

    // ผู้ใช้ที่ไม่ล็อกอินและไม่ใช่ลิงก์แชร์ ใช้ localStorage ตามเดิม
    if (!userId || !supabase) {
      if (isShareRoute()) {
        throw new Error('ลิงก์แชร์เป็นโหมดอ่านอย่างเดียว ไม่สามารถแก้ไขข้อมูลได้')
      }
      return localStore.set<T>(key, value)
    }

    const { baseKey, groupId } = parseKeyAndGroup(key)

    try {
      if (baseKey === 'routine_items' && Array.isArray(value)) {
        const items = value as unknown as RoutineItem[]
        const { error: delError } = await supabase
          .from('routine_items')
          .delete()
          .eq('user_id', userId)

        if (delError) throw new Error(formatStorageErrorThai(delError))

        if (items.length > 0) {
          const payload = items.map((item) => ({
            user_id: userId,
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
        if (!groupId) {
          throw new Error('กรุณาเลือกหรือสร้างกลุ่มก่อนบันทึกตารางเรียน')
        }
        const items = value as unknown as CourseScheduleItem[]
        const { error: delError } = await supabase
          .from('class_sessions')
          .delete()
          .eq('group_id', groupId)

        if (delError) throw new Error(formatStorageErrorThai(delError))

        if (items.length > 0) {
          const payload = items.map((item) => ({
            group_id: groupId,
            course_code: item.course_code,
            course_name: item.course_name,
            credits: Number(item.credits ?? 3),
            section: item.section || '001',
            day: item.day,
            start_time: item.start,
            end_time: item.end,
            room: item.room || '',
            instructor: item.instructor || '',
            online_link: Boolean(item.online_link),
          }))
          const { error: insError } = await supabase.from('class_sessions').insert(payload)
          if (insError) throw new Error(formatStorageErrorThai(insError))
        }
        return
      }

      return localStore.set<T>(key, value)
    } catch (err) {
      throw new Error(formatStorageErrorThai(err))
    }
  }

  async remove(key: string): Promise<void> {
    const userId = await this.getCurrentUserId()

    if (!userId || !supabase) {
      if (isShareRoute()) {
        throw new Error('ลิงก์แชร์เป็นโหมดอ่านอย่างเดียว ไม่สามารถลบข้อมูลได้')
      }
      return localStore.remove(key)
    }

    const { baseKey, groupId } = parseKeyAndGroup(key)

    try {
      if (baseKey === 'routine_items') {
        const { error } = await supabase.from('routine_items').delete().eq('user_id', userId)
        if (error) throw new Error(formatStorageErrorThai(error))
        return
      }

      if (baseKey === 'class_sessions' && groupId) {
        const { error } = await supabase
          .from('class_sessions')
          .delete()
          .eq('group_id', groupId)
        if (error) throw new Error(formatStorageErrorThai(error))
        return
      }

      return localStore.remove(key)
    } catch (err) {
      throw new Error(formatStorageErrorThai(err))
    }
  }

  async list<T = unknown>(prefix = ''): Promise<Array<{ key: string; value: T }>> {
    const userId = await this.getCurrentUserId()
    if (!userId || !supabase) {
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
    const sessions = await localStore.get<CourseScheduleItem[]>('class_sessions')
    const tasks = await localStore.get<TaskItem[]>('tasks')

    return Boolean(
      (routines && routines.length > 0) ||
        (sessions && sessions.length > 0) ||
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
    // 1. ย้ายตารางชีวิตส่วนตัว (routine_items)
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

    // 2. ย้ายตารางเรียน (class_sessions) หากอยู่ในกลุ่มที่มีสิทธิ์แก้ไข
    if (groupId && canEditGroup) {
      const localSessions = await localStore.get<CourseScheduleItem[]>('class_sessions')
      if (localSessions && localSessions.length > 0) {
        const sessionPayload = localSessions.map((item) => ({
          group_id: groupId,
          course_code: item.course_code,
          course_name: item.course_name,
          credits: Number(item.credits ?? 3),
          section: item.section || '001',
          day: item.day,
          start_time: item.start,
          end_time: item.end,
          room: item.room || '',
          instructor: item.instructor || '',
          online_link: Boolean(item.online_link),
        }))
        const { error } = await supabase.from('class_sessions').insert(sessionPayload)
        if (error) throw error
        migratedCount += sessionPayload.length
        await localStore.remove('class_sessions')
      }

      // 3. ย้ายงาน/การบ้าน/สอบ (tasks) หากเป็น owner หรือ admin
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
