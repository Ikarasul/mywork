export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'

export interface CourseScheduleItem {
  course_code: string
  course_name: string
  credits: number
  section: string
  day: DayOfWeek
  start: string
  end: string
  room: string
  instructor: string
  online_link: boolean
}

export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  list<T = unknown>(prefix?: string): Promise<Array<{ key: string; value: T }>>
}
