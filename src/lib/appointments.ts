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
  const msg =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err)
  return msg.includes('appointments') && (msg.includes('does not exist') || msg.includes('schema cache'))
}

const MISSING_TABLE_MESSAGE =
  'ยังไม่พบตารางนัดหมายในฐานข้อมูล กรุณารันไฟล์ supabase/migration-appointments.sql ใน Supabase SQL Editor ก่อน'

/**
 * ฮุกจัดการนัดหมาย: ล็อกอินและมีกลุ่ม → เก็บใน Supabase (บังคับสิทธิ์ด้วย RLS)
 * ไม่ได้ล็อกอิน → เก็บใน localStorage ของเครื่อง
 */
export function useAppointments() {
  const { user, activeGroup, currentRole } = useAuth()
  const [appointments, setAppointments] = useState<AppointmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const useRemote = Boolean(supabase && user && activeGroup)
  const canManage =
    !user || currentRole === 'owner' || currentRole === 'admin' || currentRole === 'member'

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      if (useRemote && supabase && activeGroup) {
        const { data, error: err } = await supabase
          .from('appointments')
          .select('*')
          .eq('group_id', activeGroup.id)
          .order('appt_date', { ascending: true })
          .order('start_time', { ascending: true })
        if (err) throw err
        setAppointments((data ?? []) as AppointmentItem[])
      } else {
        setAppointments((await localStore.get<AppointmentItem[]>(LOCAL_KEY)) ?? [])
      }
      setError(null)
    } catch (err) {
      setAppointments([])
      setError(isMissingTableError(err) ? MISSING_TABLE_MESSAGE : formatSupabaseErrorThai(err))
    } finally {
      setLoading(false)
    }
  }, [useRemote, activeGroup])

  useEffect(() => {
    void reload()
  }, [reload])

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
            if (err) throw err
            if (!data || data.length === 0) {
              throw new Error('คุณไม่มีสิทธิ์แก้ไขนัดนี้ (ถูกปฏิเสธโดย RLS)')
            }
          } else {
            const { error: err } = await supabase
              .from('appointments')
              .insert({ ...row, group_id: activeGroup.id, created_by: user.id })
            if (err) throw err
          }
        } else {
          const list = (await localStore.get<AppointmentItem[]>(LOCAL_KEY)) ?? []
          const next = id
            ? list.map((a) => (a.id === id ? { ...a, ...row } : a))
            : [...list, { id: window.crypto.randomUUID(), ...row, created_at: new Date().toISOString() }]
          await localStore.set(LOCAL_KEY, next)
        }
      } catch (err) {
        throw new Error(isMissingTableError(err) ? MISSING_TABLE_MESSAGE : formatSupabaseErrorThai(err))
      }
      await reload()
    },
    [canManage, useRemote, activeGroup, user, reload],
  )

  const deleteAppointment = useCallback(
    async (id: string) => {
      try {
        if (useRemote && supabase) {
          const { data, error: err } = await supabase
            .from('appointments')
            .delete()
            .eq('id', id)
            .select('id')
          if (err) throw err
          if (!data || data.length === 0) {
            throw new Error('คุณไม่มีสิทธิ์ลบนัดนี้ (สมาชิกลบได้เฉพาะนัดที่ตนเองสร้าง)')
          }
        } else {
          const list = (await localStore.get<AppointmentItem[]>(LOCAL_KEY)) ?? []
          await localStore.set(
            LOCAL_KEY,
            list.filter((a) => a.id !== id),
          )
        }
      } catch (err) {
        throw new Error(formatSupabaseErrorThai(err))
      }
      await reload()
    },
    [useRemote, reload],
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
