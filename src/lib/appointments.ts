import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatSupabaseErrorThai, useAuth } from './auth'
import { localStore } from './storage'
import { supabase } from './supabase'
import type { AppointmentItem, DayOfWeek } from '../types'

const DAYS_ORDER: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const LOCAL_KEY = 'appointments'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** แปลง YYYY-MM-DD เป็นวันในสัปดาห์ (ใช้เวลา 12:00 เพื่อเลี่ยงปัญหา timezone) */
export function dateKeyToDay(dateKey: string): DayOfWeek {
  const d = new Date(`${dateKey}T12:00:00`)
  const js = d.getDay()
  return DAYS_ORDER[js === 0 ? 6 : js - 1]
}

/** วันที่จันทร์–อาทิตย์ของสัปดาห์ที่มีวันที่ที่ระบุ */
export function getWeekDateKeys(base: Date = new Date()): string[] {
  const monday = new Date(base)
  const diff = monday.getDay() === 0 ? -6 : 1 - monday.getDay()
  monday.setDate(monday.getDate() + diff)
  return DAYS_ORDER.map((_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return toDateKey(d)
  })
}

export function formatApptTimeLabel(a: AppointmentItem): string {
  return a.all_day ? 'ทั้งวัน' : `${a.start_time}–${a.end_time}`
}

export interface AppointmentInput {
  title: string
  appt_date: string
  start_time: string
  end_time: string
  all_day: boolean
  location: string
  notes: string
  course_code: string
}

/** ตรวจความถูกต้องของข้อมูลนัดก่อนบันทึก (คืนข้อความเตือนภาษาไทย หรือ null ถ้าผ่าน) */
export function validateAppointment(input: AppointmentInput): string | null {
  if (!input.title.trim()) return 'กรุณากรอกชื่อนัด'
  if (input.title.trim().length > 200) return 'ชื่อนัดยาวเกิน 200 ตัวอักษร'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.appt_date)) return 'กรุณาเลือกวันที่ของนัด'
  if (!input.all_day) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.start_time)) return 'เวลาเริ่มไม่ถูกต้อง'
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.end_time)) return 'เวลาสิ้นสุดไม่ถูกต้อง'
    if (input.end_time <= input.start_time) return 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม'
  }
  if (input.location.length > 300) return 'สถานที่ยาวเกิน 300 ตัวอักษร'
  if (input.notes.length > 2000) return 'โน้ตยาวเกิน 2,000 ตัวอักษร'
  return null
}

function isMissingTableError(err: unknown): boolean {
  if (!err) return false
  const e = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
  const text = `${String(e.message ?? err)} ${String(e.details ?? '')} ${String(e.hint ?? '')}`
  const code = String(e.code ?? '')
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (text.includes('appointments') &&
      (text.includes('does not exist') ||
        text.includes('schema cache') ||
        text.includes('Could not find the table')))
  )
}

function getGroupLocalKey(groupId?: string | null): string {
  return groupId ? `${LOCAL_KEY}:${groupId}` : LOCAL_KEY
}

function sortAppointments(list: AppointmentItem[]): AppointmentItem[] {
  return [...list].sort((x, y) => {
    if (x.appt_date !== y.appt_date) return x.appt_date.localeCompare(y.appt_date)
    if (x.all_day !== y.all_day) return x.all_day ? -1 : 1
    return x.start_time.localeCompare(y.start_time)
  })
}

/**
 * ฮุกจัดการนัดหมาย:
 * - ล็อกอินและมีกลุ่ม → เก็บใน Supabase (บังคับสิทธิ์ด้วย RLS)
 * - หากตาราง public.appointments ใน Supabase ยังไม่ได้ถูกรัน SQL จะสลับไปเก็บใน localStorage ตามกลุ่มให้อัตโนมัติทันทีโดยไม่ขึ้นข้อความ Error
 * - ไม่ได้ล็อกอิน → เก็บใน localStorage ของเครื่อง
 */
export function useAppointments() {
  const { user, activeGroup, currentRole } = useAuth()
  const [appointments, setAppointments] = useState<AppointmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const useRemote = Boolean(supabase && user && activeGroup)
  const localKey = getGroupLocalKey(activeGroup?.id)
  const canManage =
    !user || currentRole === 'owner' || currentRole === 'admin' || currentRole === 'member'

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const localList = (await localStore.get<AppointmentItem[]>(localKey)) ?? []
      if (useRemote && supabase && activeGroup) {
        const { data, error: err } = await supabase
          .from('appointments')
          .select('*')
          .eq('group_id', activeGroup.id)
          .order('appt_date', { ascending: true })
          .order('start_time', { ascending: true })
        if (err) {
          if (isMissingTableError(err)) {
            setAppointments(sortAppointments(localList))
            setError(null)
            return
          }
          throw err
        }
        const remoteList = (data ?? []) as AppointmentItem[]
        // หากมีนัดที่เคยบันทึกไว้ในเครื่องระหว่างที่ยังไม่ได้สร้างตาราง ให้ซิงก์ขึ้นฐานข้อมูลอัตโนมัติเมื่อตารางพร้อม
        if (localList.length > 0 && user && canManage) {
          const remoteIds = new Set(remoteList.map((r) => r.id))
          const pending = localList.filter((l) => !remoteIds.has(l.id))
          if (pending.length > 0) {
            const toInsert = pending.map((item) => ({
              id: item.id,
              group_id: activeGroup.id,
              title: item.title,
              appt_date: item.appt_date,
              start_time: item.start_time,
              end_time: item.end_time,
              all_day: item.all_day,
              location: item.location,
              notes: item.notes,
              course_code: item.course_code,
              created_by: user.id,
            }))
            const { error: syncErr } = await supabase.from('appointments').insert(toInsert)
            if (!syncErr) {
              await localStore.set(localKey, [])
              const merged = sortAppointments([...remoteList, ...pending])
              setAppointments(merged)
              setError(null)
              return
            }
          }
        }
        setAppointments(sortAppointments(remoteList))
      } else {
        setAppointments(sortAppointments(localList))
      }
      setError(null)
    } catch (err) {
      if (isMissingTableError(err)) {
        const fallback = (await localStore.get<AppointmentItem[]>(localKey)) ?? []
        setAppointments(sortAppointments(fallback))
        setError(null)
      } else {
        setAppointments([])
        setError(formatSupabaseErrorThai(err))
      }
    } finally {
      setLoading(false)
    }
  }, [useRemote, activeGroup, localKey, user, canManage])

  useEffect(() => {
    void reload()
  }, [reload])

  const saveLocalFallback = useCallback(
    async (
      row: Omit<AppointmentItem, 'id' | 'created_at' | 'updated_at'>,
      id?: string,
    ) => {
      const list = (await localStore.get<AppointmentItem[]>(localKey)) ?? []
      const nowIso = new Date().toISOString()
      const next = id
        ? list.map((a) => (a.id === id ? { ...a, ...row, updated_at: nowIso } : a))
        : [
            ...list,
            {
              id: window.crypto.randomUUID(),
              ...row,
              created_at: nowIso,
              updated_at: nowIso,
            },
          ]
      await localStore.set(localKey, next)
    },
    [localKey],
  )

  const saveAppointment = useCallback(
    async (input: AppointmentInput, id?: string) => {
      const invalid = validateAppointment(input)
      if (invalid) throw new Error(invalid)
      if (!canManage) throw new Error('โหมดดูอย่างเดียว: คุณไม่มีสิทธิ์เพิ่มหรือแก้ไขนัด')

      const row = {
        title: input.title.trim(),
        appt_date: input.appt_date,
        start_time: input.all_day ? '00:00' : input.start_time,
        end_time: input.all_day ? '23:59' : input.end_time,
        all_day: input.all_day,
        location: input.location.trim(),
        notes: input.notes.trim(),
        course_code: input.course_code.trim().toUpperCase(),
      }

      try {
        if (useRemote && supabase && activeGroup && user) {
          if (id) {
            const { data, error: err } = await supabase
              .from('appointments')
              .update(row)
              .eq('id', id)
              .select('id')
            if (err) {
              if (isMissingTableError(err)) {
                await saveLocalFallback(
                  { ...row, group_id: activeGroup.id, created_by: user.id },
                  id,
                )
                await reload()
                return
              }
              throw err
            }
            if (!data || data.length === 0) {
              // หากเป็นรายการที่อยู่ใน local fallback ให้แก้ไขใน localStore ได้
              const localList = (await localStore.get<AppointmentItem[]>(localKey)) ?? []
              if (localList.some((a) => a.id === id)) {
                await saveLocalFallback(
                  { ...row, group_id: activeGroup.id, created_by: user.id },
                  id,
                )
                await reload()
                return
              }
              throw new Error('คุณไม่มีสิทธิ์แก้ไขนัดนี้ (ถูกปฏิเสธโดย RLS)')
            }
          } else {
            const { error: err } = await supabase
              .from('appointments')
              .insert({ ...row, group_id: activeGroup.id, created_by: user.id })
            if (err) {
              if (isMissingTableError(err)) {
                await saveLocalFallback({
                  ...row,
                  group_id: activeGroup.id,
                  created_by: user.id,
                })
                await reload()
                return
              }
              throw err
            }
          }
        } else {
          await saveLocalFallback(
            {
              ...row,
              group_id: activeGroup?.id,
              created_by: user?.id ?? null,
            },
            id,
          )
        }
      } catch (err) {
        if (isMissingTableError(err)) {
          await saveLocalFallback(
            {
              ...row,
              group_id: activeGroup?.id,
              created_by: user?.id ?? null,
            },
            id,
          )
        } else {
          throw new Error(formatSupabaseErrorThai(err))
        }
      }
      await reload()
    },
    [canManage, useRemote, activeGroup, user, localKey, saveLocalFallback, reload],
  )

  const deleteAppointment = useCallback(
    async (id: string) => {
      const target = appointments.find((a) => a.id === id)
      if (target && user) {
        const allowed =
          currentRole === 'owner' ||
          currentRole === 'admin' ||
          (currentRole === 'member' && (!target.created_by || target.created_by === user.id))
        if (!allowed) {
          throw new Error('คุณไม่มีสิทธิ์ลบนัดนี้ (สมาชิกลบได้เฉพาะนัดที่ตนเองสร้าง)')
        }
      }

      const removeFromLocal = async () => {
        const list = (await localStore.get<AppointmentItem[]>(localKey)) ?? []
        await localStore.set(
          localKey,
          list.filter((a) => a.id !== id),
        )
      }

      try {
        if (useRemote && supabase) {
          const { data, error: err } = await supabase
            .from('appointments')
            .delete()
            .eq('id', id)
            .select('id')
          if (err) {
            if (isMissingTableError(err)) {
              await removeFromLocal()
              await reload()
              return
            }
            throw err
          }
          if (!data || data.length === 0) {
            const localList = (await localStore.get<AppointmentItem[]>(localKey)) ?? []
            if (localList.some((a) => a.id === id)) {
              await removeFromLocal()
              await reload()
              return
            }
            throw new Error('คุณไม่มีสิทธิ์ลบนัดนี้ (สมาชิกลบได้เฉพาะนัดที่ตนเองสร้าง)')
          }
        } else {
          await removeFromLocal()
        }
      } catch (err) {
        if (isMissingTableError(err)) {
          await removeFromLocal()
        } else {
          throw new Error(formatSupabaseErrorThai(err))
        }
      }
      await reload()
    },
    [appointments, user, currentRole, useRemote, localKey, reload],
  )

  const byDate = useMemo(() => {
    const map = new Map<string, AppointmentItem[]>()
    for (const a of appointments) {
      const list = map.get(a.appt_date) ?? []
      list.push(a)
      map.set(a.appt_date, list)
    }
    for (const list of map.values()) {
      list.sort((x, y) =>
        x.all_day === y.all_day
          ? x.start_time.localeCompare(y.start_time)
          : x.all_day
            ? -1
            : 1,
      )
    }
    return map
  }, [appointments])

  /** owner/admin ลบได้ทุกนัด, member ลบได้เฉพาะนัดที่ตนสร้าง (ฝั่งฐานข้อมูลบังคับด้วย RLS อีกชั้น) */
  const canDeleteAppointment = useCallback(
    (a: AppointmentItem) => {
      if (!user) return true
      if (currentRole === 'owner' || currentRole === 'admin') return true
      return currentRole === 'member' && a.created_by === user.id
    },
    [user, currentRole],
  )

  return {
    canDeleteAppointment,
    appointments,
    byDate,
    loading,
    error,
    canManage,
    reload,
    saveAppointment,
    deleteAppointment,
  }
}
