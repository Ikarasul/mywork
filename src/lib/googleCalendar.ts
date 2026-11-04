import { useCallback, useEffect, useState } from 'react'
import { GOOGLE_PROVIDER_TOKEN_STORAGE_KEY, useAuth } from './auth'
import type { DayOfWeek, GoogleCalendarEventItem } from '../types'

export const GCAL_CACHE_STORAGE_KEY = 'lsp:gcal_events_cache'
export const GCAL_OVERLAY_STORAGE_KEY = 'lsp:gcal_overlay_visible'
export const GCAL_AUTO_SYNC_STORAGE_KEY = 'lsp:gcal_auto_sync_enabled'
export const GCAL_PENDING_SYNC_KEY = 'lsp:gcal_pending_sync'
export const GCAL_UPDATE_EVENT = 'lsp:gcal-updated'
export const GCAL_AUTO_SYNC_EVENT = 'lsp:gcal-auto-sync-updated'

export interface GoogleCalendarCachePayload {
  events: GoogleCalendarEventItem[]
  lastSyncedAt: string | null
  weekRangeLabel: string
}

export interface RawGoogleCalendarEvent {
  id?: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  start?: {
    dateTime?: string
    date?: string
  }
  end?: {
    dateTime?: string
    date?: string
  }
}

export interface GoogleCalendarEventInput {
  summary: string
  description?: string
  location?: string
  date?: string // 'YYYY-MM-DD' for all-day event
  startIso?: string // ISO timestamp or 'YYYY-MM-DDTHH:MM:00+07:00'
  endIso?: string
  isAllDay?: boolean
}

function toDayOfWeek(date: Date): DayOfWeek {
  const map: DayOfWeek[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  return map[date.getDay()] ?? 'MON'
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatHHMM(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export function getNextDayDateKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return dateStr
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + 1)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function getCurrentWeekBounds(reference: Date = new Date()): {
  monday: Date
  sunday: Date
  weekRangeLabel: string
} {
  const now = new Date(reference)
  const jsDay = now.getDay() // 0 = Sun, 1 = Mon, ...
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay

  const monday = new Date(now)
  monday.setDate(now.getDate() + diffToMonday)
  monday.setHours(0, 0, 0, 0)

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  const fmt = new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return {
    monday,
    sunday,
    weekRangeLabel: `${fmt.format(monday)} – ${fmt.format(sunday)}`,
  }
}

export function isGcalAutoSyncEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(GCAL_AUTO_SYNC_STORAGE_KEY)
    return raw === null ? true : raw === 'true'
  } catch {
    return true
  }
}

export function setGcalAutoSyncEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(GCAL_AUTO_SYNC_STORAGE_KEY, String(enabled))
    window.dispatchEvent(new CustomEvent(GCAL_AUTO_SYNC_EVENT))
  } catch {
    // ignore
  }
}

export function getGoogleProviderToken(): string | null {
  try {
    return window.sessionStorage.getItem(GOOGLE_PROVIDER_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function readCachedCalendar(): GoogleCalendarCachePayload {
  try {
    const raw = window.localStorage.getItem(GCAL_CACHE_STORAGE_KEY)
    if (!raw) {
      return {
        events: [],
        lastSyncedAt: null,
        weekRangeLabel: getCurrentWeekBounds().weekRangeLabel,
      }
    }
    const parsed = JSON.parse(raw) as Partial<GoogleCalendarCachePayload>
    return {
      events: Array.isArray(parsed.events) ? parsed.events : [],
      lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
      weekRangeLabel:
        typeof parsed.weekRangeLabel === 'string'
          ? parsed.weekRangeLabel
          : getCurrentWeekBounds().weekRangeLabel,
    }
  } catch {
    return {
      events: [],
      lastSyncedAt: null,
      weekRangeLabel: getCurrentWeekBounds().weekRangeLabel,
    }
  }
}

function writeCachedCalendar(payload: GoogleCalendarCachePayload) {
  try {
    window.localStorage.setItem(GCAL_CACHE_STORAGE_KEY, JSON.stringify(payload))
    window.dispatchEvent(new CustomEvent(GCAL_UPDATE_EVENT))
  } catch {
    // ignore storage errors
  }
}

function readOverlayVisible(): boolean {
  try {
    const raw = window.localStorage.getItem(GCAL_OVERLAY_STORAGE_KEY)
    return raw === null ? true : raw === 'true'
  } catch {
    return true
  }
}

function mapRawGoogleEvents(rawItems: RawGoogleCalendarEvent[]): GoogleCalendarEventItem[] {
  const mapped: GoogleCalendarEventItem[] = []

  for (const item of rawItems) {
    if (!item || item.status === 'cancelled') continue

    const summary = item.summary?.trim() || '(ไม่มีชื่อกิจกรรม)'
    const description = item.description?.trim() || ''
    const location = item.location?.trim() || ''
    const htmlLink = item.htmlLink || 'https://calendar.google.com'

    if (item.start?.dateTime) {
      const startDate = new Date(item.start.dateTime)
      const endDate = item.end?.dateTime ? new Date(item.end.dateTime) : new Date(startDate.getTime() + 60 * 60 * 1000)

      if (Number.isNaN(startDate.getTime())) continue

      const startTime = formatHHMM(startDate)
      let endTime = formatHHMM(endDate)
      if (endTime <= startTime) {
        const fallbackEnd = new Date(startDate.getTime() + 60 * 60 * 1000)
        endTime = formatHHMM(fallbackEnd)
      }

      mapped.push({
        id: item.id || `${startDate.toISOString()}-${summary}`,
        summary,
        description,
        location,
        htmlLink,
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString(),
        day: toDayOfWeek(startDate),
        startTime,
        endTime,
        isAllDay: false,
      })
    } else if (item.start?.date) {
      // กิจกรรมแบบทั้งวัน (All-day event)
      const [y, m, d] = item.start.date.split('-').map(Number)
      if (!y || !m || !d) continue
      const startDate = new Date(y, m - 1, d, 8, 0, 0)
      const endDate = new Date(y, m - 1, d, 9, 0, 0)

      mapped.push({
        id: item.id || `${item.start.date}-${summary}`,
        summary,
        description,
        location,
        htmlLink,
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString(),
        day: toDayOfWeek(startDate),
        startTime: '08:00',
        endTime: '09:00',
        isAllDay: true,
      })
    }
  }

  return mapped.sort((a, b) => a.startTime.localeCompare(b.startTime))
}

export async function fetchGoogleCalendarWeekEvents(
  accessToken: string,
): Promise<{
  events: GoogleCalendarEventItem[]
  weekRangeLabel: string
}> {
  const { monday, sunday, weekRangeLabel } = getCurrentWeekBounds()

  const params = new URLSearchParams({
    timeMin: monday.toISOString(),
    timeMax: sunday.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    },
  )

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      const errorBody = await response.json().catch(() => null)
      const rawMessage =
        errorBody?.error?.message || 'สิทธิ์การเข้าถึงปฏิทินหมดอายุหรือยังไม่ได้อนุญาต Scope'
      const err = new Error(rawMessage) as Error & { status?: number }
      err.status = response.status
      throw err
    }
    throw new Error(`ไม่สามารถดึงข้อมูล Google Calendar ได้ (HTTP ${response.status})`)
  }

  const data = (await response.json()) as { items?: RawGoogleCalendarEvent[] }
  const events = mapRawGoogleEvents(data.items ?? [])

  return { events, weekRangeLabel }
}

/**
 * สร้างกิจกรรมใหม่บน Google Calendar ของผู้ใช้
 */
export async function createGoogleCalendarEvent(
  accessToken: string,
  event: GoogleCalendarEventInput,
): Promise<{ id: string; htmlLink?: string }> {
  const body: Record<string, unknown> = {
    summary: event.summary,
    description: event.description || '',
    location: event.location || '',
  }

  if (event.isAllDay && event.date) {
    body.start = { date: event.date }
    body.end = { date: getNextDayDateKey(event.date) }
  } else if (event.startIso && event.endIso) {
    body.start = { dateTime: event.startIso, timeZone: 'Asia/Bangkok' }
    body.end = { dateTime: event.endIso, timeZone: 'Asia/Bangkok' }
  } else if (event.date) {
    body.start = { date: event.date }
    body.end = { date: getNextDayDateKey(event.date) }
  }

  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    const rawMessage =
      errorBody?.error?.message || `ไม่สามารถสร้างกิจกรรมบน Google Calendar ได้ (HTTP ${response.status})`
    const err = new Error(rawMessage) as Error & { status?: number }
    err.status = response.status
    throw err
  }

  const data = (await response.json()) as { id: string; htmlLink?: string }
  return { id: data.id, htmlLink: data.htmlLink }
}

/**
 * อัปเดตกิจกรรมเดิมบน Google Calendar
 */
export async function updateGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
  event: GoogleCalendarEventInput,
): Promise<{ id: string; htmlLink?: string }> {
  const body: Record<string, unknown> = {
    summary: event.summary,
    description: event.description || '',
    location: event.location || '',
  }

  if (event.isAllDay && event.date) {
    body.start = { date: event.date }
    body.end = { date: getNextDayDateKey(event.date) }
  } else if (event.startIso && event.endIso) {
    body.start = { dateTime: event.startIso, timeZone: 'Asia/Bangkok' }
    body.end = { dateTime: event.endIso, timeZone: 'Asia/Bangkok' }
  } else if (event.date) {
    body.start = { date: event.date }
    body.end = { date: getNextDayDateKey(event.date) }
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    const rawMessage =
      errorBody?.error?.message || `ไม่สามารถอัปเดตกิจกรรมบน Google Calendar ได้ (HTTP ${response.status})`
    const err = new Error(rawMessage) as Error & { status?: number }
    err.status = response.status
    throw err
  }

  const data = (await response.json()) as { id: string; htmlLink?: string }
  return { id: data.id, htmlLink: data.htmlLink }
}

/**
 * ลบกิจกรรมออกจาก Google Calendar
 */
export async function deleteGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
): Promise<boolean> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )

  if (response.status === 204 || response.status === 404 || response.status === 410) {
    return true
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    const rawMessage =
      errorBody?.error?.message || `ไม่สามารถลบกิจกรรมบน Google Calendar ได้ (HTTP ${response.status})`
    const err = new Error(rawMessage) as Error & { status?: number }
    err.status = response.status
    throw err
  }

  return true
}

/**
 * ดึงข้อมูลสัปดาห์นี้และอัปเดตแคชเบื้องหลังทันที
 */
export async function refreshGoogleCalendarCache(accessToken?: string): Promise<void> {
  const token = accessToken || getGoogleProviderToken()
  if (!token) return
  try {
    const { events, weekRangeLabel } = await fetchGoogleCalendarWeekEvents(token)
    writeCachedCalendar({
      events,
      lastSyncedAt: new Date().toISOString(),
      weekRangeLabel,
    })
  } catch {
    // ละเว้นข้อผิดพลาดเบื้องหลัง
  }
}

export function useGoogleCalendar() {
  const { googleProviderToken, signInWithGoogle } = useAuth()
  const [cache, setCache] = useState<GoogleCalendarCachePayload>(() => readCachedCalendar())
  const [overlayVisible, setOverlayVisibleState] = useState<boolean>(() => readOverlayVisible())
  const [autoSyncEnabled, setAutoSyncEnabledState] = useState<boolean>(() => isGcalAutoSyncEnabled())
  const [syncing, setSyncing] = useState<boolean>(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    function handleUpdate() {
      setCache(readCachedCalendar())
      setOverlayVisibleState(readOverlayVisible())
      setAutoSyncEnabledState(isGcalAutoSyncEnabled())
    }
    window.addEventListener(GCAL_UPDATE_EVENT, handleUpdate)
    window.addEventListener(GCAL_AUTO_SYNC_EVENT, handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener(GCAL_UPDATE_EVENT, handleUpdate)
      window.removeEventListener(GCAL_AUTO_SYNC_EVENT, handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  const setOverlayVisible = useCallback((visible: boolean) => {
    setOverlayVisibleState(visible)
    try {
      window.localStorage.setItem(GCAL_OVERLAY_STORAGE_KEY, String(visible))
      window.dispatchEvent(new CustomEvent(GCAL_UPDATE_EVENT))
    } catch {
      // ignore storage errors
    }
  }, [])

  const setAutoSync = useCallback((enabled: boolean) => {
    setGcalAutoSyncEnabled(enabled)
    setAutoSyncEnabledState(enabled)
  }, [])

  const performSyncWithToken = useCallback(async (token: string) => {
    setSyncing(true)
    setSyncError(null)
    setSyncSuccessMessage(null)

    try {
      const { events, weekRangeLabel } = await fetchGoogleCalendarWeekEvents(token)
      const nowIso = new Date().toISOString()
      const nextPayload: GoogleCalendarCachePayload = {
        events,
        lastSyncedAt: nowIso,
        weekRangeLabel,
      }
      writeCachedCalendar(nextPayload)
      setCache(nextPayload)
      setSyncSuccessMessage(
        `ซิงก์ Google Calendar สำเร็จ! ดึงข้อมูลสัปดาห์นี้ (${weekRangeLabel}) มาแสดง ${events.length} รายการ`,
      )
      return { ok: true, needsReauth: false }
    } catch (err) {
      const status = (err as { status?: number })?.status
      if (status === 401 || status === 403) {
        try {
          window.sessionStorage.removeItem(GOOGLE_PROVIDER_TOKEN_STORAGE_KEY)
        } catch {
          // ignore
        }
        return { ok: false, needsReauth: true }
      }
      const message =
        err instanceof Error ? err.message : 'เกิดข้อผิดพลาดขณะซิงก์ปฏิทิน Google'
      setSyncError(message)
      return { ok: false, needsReauth: false }
    } finally {
      setSyncing(false)
    }
  }, [])

  // เมื่อกลับมาจากหน้าขอสิทธิ์ Google OAuth ที่ผู้ใช้กดปุ่มซิงก์ไว้ ให้ดึงข้อมูล 1 ครั้งทันที
  useEffect(() => {
    let pending = false
    try {
      pending = window.sessionStorage.getItem(GCAL_PENDING_SYNC_KEY) === 'true'
    } catch {
      pending = false
    }

    if (pending && googleProviderToken) {
      try {
        window.sessionStorage.removeItem(GCAL_PENDING_SYNC_KEY)
      } catch {
        // ignore
      }
      void performSyncWithToken(googleProviderToken)
    }
  }, [googleProviderToken, performSyncWithToken])

  const requestWriteScope = useCallback(
    async (redirectPath?: string) => {
      try {
        window.sessionStorage.setItem(GCAL_PENDING_SYNC_KEY, 'true')
      } catch {
        // ignore
      }
      const targetPath = redirectPath || window.location.pathname || '/calendar'
      const { error } = await signInWithGoogle({
        withCalendarScope: true,
        redirectPath: targetPath,
      })
      if (error) {
        setSyncError(error)
      }
    },
    [signInWithGoogle],
  )

  const syncNow = useCallback(async () => {
    setSyncError(null)
    setSyncSuccessMessage(null)

    if (googleProviderToken) {
      const result = await performSyncWithToken(googleProviderToken)
      if (result.ok || !result.needsReauth) {
        return
      }
    }

    await requestWriteScope()
  }, [googleProviderToken, performSyncWithToken, requestWriteScope])

  const clearSyncedEvents = useCallback(() => {
    const emptyPayload: GoogleCalendarCachePayload = {
      events: [],
      lastSyncedAt: null,
      weekRangeLabel: getCurrentWeekBounds().weekRangeLabel,
    }
    writeCachedCalendar(emptyPayload)
    setCache(emptyPayload)
    setSyncSuccessMessage(null)
    setSyncError(null)
  }, [])

  return {
    events: cache.events,
    lastSyncedAt: cache.lastSyncedAt,
    weekRangeLabel: cache.weekRangeLabel,
    overlayVisible,
    setOverlayVisible,
    autoSyncEnabled,
    setAutoSyncEnabled: setAutoSync,
    syncing,
    syncError,
    syncSuccessMessage,
    setSyncError,
    setSyncSuccessMessage,
    syncNow,
    requestWriteScope,
    clearSyncedEvents,
    hasToken: Boolean(googleProviderToken),
  }
}
