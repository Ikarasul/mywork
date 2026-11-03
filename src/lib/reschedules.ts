import { useCallback, useEffect, useState } from 'react'
import { dateKeyToDay } from './appointments'
import { useAuth } from './auth'
import { DEFAULT_SEMESTER, localStore, timeToMinutes } from './storage'
import type {
  ClassRescheduleOverride,
  CourseScheduleItem,
  DayOfWeek,
} from '../types'

const DAYS_ORDER: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const RESCHEDULE_EVENT = 'planner:reschedules-updated'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function minutesToTimeStr(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${pad2(h)}:${pad2(m)}`
}

/**
 * คำนวณเวลาเริ่ม-จบใหม่เมื่อลากบล็อกไปวางที่เวลาเริ่มใหม่ โดยคงระยะเวลา (duration) เดิมไว้
 */
export function shiftTimeRange(
  origStart: string,
  origEnd: string,
  newStartMinutes: number,
  maxEndMinutes = 20 * 60,
  minStartMinutes = 7 * 60,
): { start: string; end: string } {
  const sMin = timeToMinutes(origStart)
  const eMin = timeToMinutes(origEnd)
  const duration = Math.max(30, eMin - sMin)
  const clampedStart = Math.max(
    minStartMinutes,
    Math.min(maxEndMinutes - duration, newStartMinutes),
  )
  const clampedEnd = Math.min(maxEndMinutes, clampedStart + duration)
  return {
    start: minutesToTimeStr(clampedStart),
    end: minutesToTimeStr(clampedEnd),
  }
}

export const DAY_THAI_NAMES: Record<DayOfWeek, string> = {
  MON: 'จันทร์',
  TUE: 'อังคาร',
  WED: 'พุธ',
  THU: 'พฤหัสบดี',
  FRI: 'ศุกร์',
  SAT: 'เสาร์',
  SUN: 'อาทิตย์',
}

export const DAY_SHORT_THAI: Record<DayOfWeek, string> = {
  MON: 'จ.',
  TUE: 'อ.',
  WED: 'พ.',
  THU: 'พฤ.',
  FRI: 'ศ.',
  SAT: 'ส.',
  SUN: 'อา.',
}

export interface SaveRescheduleInput {
  course_code: string
  course_name: string
  section: string
  original_date: string
  original_day: DayOfWeek
  original_start: string
  original_end: string
  canceled?: boolean
  new_date: string
  new_start: string
  new_end: string
  new_room?: string
  reason?: string
}

export function useClassReschedules(semester: string = DEFAULT_SEMESTER) {
  const { user, activeGroup, currentRole } = useAuth()
  const [overrides, setOverrides] = useState<ClassRescheduleOverride[]>([])

  const canManage =
    !user || currentRole === 'owner' || currentRole === 'admin' || currentRole === 'member'
  const groupKey = activeGroup?.id ?? 'local'
  const storageKey = `class_reschedules:${groupKey}:${semester}`

  const reload = useCallback(async () => {
    const list = (await localStore.get<ClassRescheduleOverride[]>(storageKey)) ?? []
    setOverrides(list)
  }, [storageKey])

  useEffect(() => {
    void reload()
    const handler = () => {
      void reload()
    }
    window.addEventListener(RESCHEDULE_EVENT, handler)
    return () => window.removeEventListener(RESCHEDULE_EVENT, handler)
  }, [reload])

  const saveOverride = useCallback(
    async (input: SaveRescheduleInput, existingOverrideId?: string) => {
      if (!canManage) {
        throw new Error('โหมดดูอย่างเดียว: คุณไม่มีสิทธิ์ย้ายคาบเรียน')
      }
      const list = (await localStore.get<ClassRescheduleOverride[]>(storageKey)) ?? []
      const newDay = dateKeyToDay(input.new_date)

      // หากคาบนี้เคยถูกย้ายในสัปดาห์นี้แล้ว ให้อัปเดตแถวเดิมแทนการสร้างซ้ำ
      const existingIndex = list.findIndex(
        (o) =>
          (existingOverrideId && o.id === existingOverrideId) ||
          (o.course_code.toUpperCase() === input.course_code.toUpperCase() &&
            o.original_date === input.original_date &&
            o.original_start === input.original_start),
      )

      const record: ClassRescheduleOverride = {
        id: existingIndex >= 0 ? list[existingIndex].id : window.crypto.randomUUID(),
        group_id: activeGroup?.id,
        semester,
        course_code: input.course_code.trim().toUpperCase(),
        course_name: input.course_name.trim(),
        section: input.section.trim() || '001',
        original_date: input.original_date,
        original_day: input.original_day,
        original_start: input.original_start,
        original_end: input.original_end,
        canceled: Boolean(input.canceled),
        new_date: input.new_date,
        new_day: newDay,
        new_start: input.new_start,
        new_end: input.new_end,
        new_room: input.new_room?.trim() || undefined,
        reason: input.reason?.trim() || undefined,
        created_by: user?.id ?? null,
        created_at:
          existingIndex >= 0
            ? list[existingIndex].created_at
            : new Date().toISOString(),
      }

      // ถ้าผู้ใช้ลากกลับไปวันเดิมและเวลาเดิมและไม่ได้งดคลาส ให้ลบ override ออก (เท่ากับคืนค่าเดิม)
      if (
        !record.canceled &&
        record.new_date === record.original_date &&
        record.new_start === record.original_start &&
        record.new_end === record.original_end &&
        !record.new_room
      ) {
        const filtered =
          existingIndex >= 0 ? list.filter((_, i) => i !== existingIndex) : list
        await localStore.set(storageKey, filtered)
        setOverrides(filtered)
        window.dispatchEvent(new CustomEvent(RESCHEDULE_EVENT))
        return
      }

      const next =
        existingIndex >= 0
          ? list.map((item, idx) => (idx === existingIndex ? record : item))
          : [...list, record]

      await localStore.set(storageKey, next)
      setOverrides(next)
      window.dispatchEvent(new CustomEvent(RESCHEDULE_EVENT))
    },
    [canManage, storageKey, activeGroup?.id, semester, user?.id],
  )

  const removeOverride = useCallback(
    async (overrideId: string) => {
      if (!canManage) {
        throw new Error('โหมดดูอย่างเดียว: คุณไม่มีสิทธิ์คืนค่าคาบเรียน')
      }
      const list = (await localStore.get<ClassRescheduleOverride[]>(storageKey)) ?? []
      const next = list.filter((o) => o.id !== overrideId)
      await localStore.set(storageKey, next)
      setOverrides(next)
      window.dispatchEvent(new CustomEvent(RESCHEDULE_EVENT))
    },
    [canManage, storageKey],
  )

  const clearAllOverrides = useCallback(async () => {
    if (!canManage) return
    await localStore.set(storageKey, [])
    setOverrides([])
    window.dispatchEvent(new CustomEvent(RESCHEDULE_EVENT))
  }, [canManage, storageKey])

  /**
   * คำนวณรายการคาบเรียนของสัปดาห์ที่ระบุ (weekDateKeys: จันทร์–อาทิตย์ 7 วัน)
   * โดยนำการย้ายคาบ/งดคลาสในสัปดาห์นั้นมาปรับผลลัพธ์ให้อัตโนมัติ
   */
  const getEffectiveSessionsForWeek = useCallback(
    (
      baseSessions: CourseScheduleItem[],
      weekDateKeys: string[],
    ): {
      sessions: CourseScheduleItem[]
      weekOverrides: ClassRescheduleOverride[]
    } => {
      if (weekDateKeys.length < 7 || overrides.length === 0) {
        return { sessions: baseSessions, weekOverrides: [] }
      }

      const dateByDay = new Map<DayOfWeek, string>()
      DAYS_ORDER.forEach((day, idx) => {
        if (weekDateKeys[idx]) dateByDay.set(day, weekDateKeys[idx])
      })
      const weekDateSet = new Set(weekDateKeys)

      const result: CourseScheduleItem[] = []
      const usedOverrideIds = new Set<string>()

      for (const s of baseSessions) {
        const origDateForDay = dateByDay.get(s.day) ?? ''
        const matchedOverride = overrides.find(
          (o) =>
            o.course_code.toUpperCase() === s.course_code.toUpperCase() &&
            o.original_date === origDateForDay &&
            o.original_start === s.start,
        )

        if (matchedOverride) {
          usedOverrideIds.add(matchedOverride.id)
          if (matchedOverride.canceled) {
            // งดคลาสในสัปดาห์นี้ -> ไม่แสดงในตารางหลัก (แต่จะแสดงในแถบแจ้งเตือนคาบที่ย้าย/งด)
            continue
          }
          // หากย้ายไปวันที่อยู่ในสัปดาห์เดียวกัน ให้แสดงในวัน/เวลาใหม่
          if (weekDateSet.has(matchedOverride.new_date)) {
            result.push({
              ...s,
              day: matchedOverride.new_day,
              start: matchedOverride.new_start,
              end: matchedOverride.new_end,
              room: matchedOverride.new_room || s.room,
              rescheduledInfo: {
                overrideId: matchedOverride.id,
                originalDate: matchedOverride.original_date,
                originalDay: matchedOverride.original_day,
                originalStart: matchedOverride.original_start,
                originalEnd: matchedOverride.original_end,
                reason: matchedOverride.reason,
              },
            })
          }
        } else {
          result.push(s)
        }
      }

      // กรณีมีคาบที่ย้ายข้ามมาจากสัปดาห์อื่นมาลงในสัปดาห์นี้
      for (const o of overrides) {
        if (usedOverrideIds.has(o.id) || o.canceled) continue
        if (weekDateSet.has(o.new_date)) {
          const template = baseSessions.find(
            (s) => s.course_code.toUpperCase() === o.course_code.toUpperCase(),
          )
          result.push({
            id: template?.id,
            course_id: template?.course_id,
            group_id: template?.group_id,
            course_code: o.course_code,
            course_name: template?.course_name || o.course_name,
            credits: template?.credits ?? 3,
            section: template?.section || o.section,
            day: o.new_day,
            start: o.new_start,
            end: o.new_end,
            room: o.new_room || template?.room || '',
            instructor: template?.instructor || '',
            online_link: template?.online_link ?? false,
            online_url: template?.online_url,
            contact_url: template?.contact_url,
            color: template?.color,
            notes: template?.notes,
            location_text: template?.location_text,
            links: template?.links,
            rescheduledInfo: {
              overrideId: o.id,
              originalDate: o.original_date,
              originalDay: o.original_day,
              originalStart: o.original_start,
              originalEnd: o.original_end,
              reason: o.reason,
            },
          })
        }
      }

      const weekOverrides = overrides.filter(
        (o) => weekDateSet.has(o.original_date) || weekDateSet.has(o.new_date),
      )

      return { sessions: result, weekOverrides }
    },
    [overrides],
  )

  /**
   * คำนวณคาบเรียนของวันที่ระบุ 1 วัน (ใช้ในหน้า /today และ /calendar)
   */
  const getEffectiveSessionsForDate = useCallback(
    (
      baseSessions: CourseScheduleItem[],
      dateKey: string,
      dayOfWeek: DayOfWeek,
    ): {
      activeSessions: CourseScheduleItem[]
      movedAwayOrCanceled: ClassRescheduleOverride[]
    } => {
      const regularForDay = baseSessions.filter((s) => s.day === dayOfWeek)
      const activeSessions: CourseScheduleItem[] = []
      const movedAwayOrCanceled: ClassRescheduleOverride[] = []

      for (const s of regularForDay) {
        const ov = overrides.find(
          (o) =>
            o.course_code.toUpperCase() === s.course_code.toUpperCase() &&
            o.original_date === dateKey &&
            o.original_start === s.start,
        )
        if (ov) {
          if (ov.canceled) {
            movedAwayOrCanceled.push(ov)
          } else if (ov.new_date === dateKey) {
            // ย้ายเวลาภายในวันเดิม
            activeSessions.push({
              ...s,
              day: dayOfWeek,
              start: ov.new_start,
              end: ov.new_end,
              room: ov.new_room || s.room,
              rescheduledInfo: {
                overrideId: ov.id,
                originalDate: ov.original_date,
                originalDay: ov.original_day,
                originalStart: ov.original_start,
                originalEnd: ov.original_end,
                reason: ov.reason,
              },
            })
          } else {
            movedAwayOrCanceled.push(ov)
          }
        } else {
          activeSessions.push(s)
        }
      }

      // คาบที่ถูกย้ายจากวันอื่นมาลงในวันนี้ (dateKey)
      const movedInOverrides = overrides.filter(
        (o) => !o.canceled && o.new_date === dateKey && o.original_date !== dateKey,
      )
      for (const ov of movedInOverrides) {
        const template = baseSessions.find(
          (s) => s.course_code.toUpperCase() === ov.course_code.toUpperCase(),
        )
        activeSessions.push({
          id: template?.id,
          course_id: template?.course_id,
          group_id: template?.group_id,
          course_code: ov.course_code,
          course_name: template?.course_name || ov.course_name,
          credits: template?.credits ?? 3,
          section: template?.section || ov.section,
          day: dayOfWeek,
          start: ov.new_start,
          end: ov.new_end,
          room: ov.new_room || template?.room || '',
          instructor: template?.instructor || '',
          online_link: template?.online_link ?? false,
          online_url: template?.online_url,
          contact_url: template?.contact_url,
          color: template?.color,
          notes: template?.notes,
          location_text: template?.location_text,
          links: template?.links,
          rescheduledInfo: {
            overrideId: ov.id,
            originalDate: ov.original_date,
            originalDay: ov.original_day,
            originalStart: ov.original_start,
            originalEnd: ov.original_end,
            reason: ov.reason,
          },
        })
      }

      activeSessions.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
      return { activeSessions, movedAwayOrCanceled }
    },
    [overrides],
  )

  return {
    overrides,
    canManage,
    saveOverride,
    removeOverride,
    clearAllOverrides,
    getEffectiveSessionsForWeek,
    getEffectiveSessionsForDate,
    reload,
  }
}
