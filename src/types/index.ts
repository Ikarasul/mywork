export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'
export type RoutineDay = DayOfWeek | 'ALL'

export type GroupRole = 'owner' | 'admin' | 'member'
export type EffectiveRole = GroupRole | 'viewer'

export interface UserProfile {
  id: string
  display_name: string
  created_at: string
}

export interface GroupInfo {
  id: string
  name: string
  description: string
  created_by: string
  created_at: string
}

export interface GroupMemberWithProfile {
  id: string
  group_id: string
  user_id: string
  role: GroupRole
  joined_at: string
  display_name: string
}

export interface InviteCodeItem {
  id: string
  group_id: string
  code_hash: string
  role: 'admin' | 'member'
  expires_at: string | null
  max_uses: number | null
  used_count: number
  revoked: boolean
  created_by: string
  created_at: string
}

export interface ShareLinkItem {
  id: string
  token: string
  group_id: string
  revoked: boolean
  created_by: string
  created_at: string
}

export type CourseLinkType = 'meet' | 'line' | 'contact' | 'lms' | 'other'

export interface CourseLinkItem {
  type: CourseLinkType
  label: string
  url: string
}

export type CourseColorId =
  | 'mint'
  | 'indigo'
  | 'amber'
  | 'sky'
  | 'pink'
  | 'rose'
  | 'violet'
  | 'teal'

export interface CourseScheduleItem {
  id?: string
  course_id?: string
  group_id?: string
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
  online_url?: string
  contact_url?: string
  color?: string
  notes?: string
  location_text?: string
  links?: CourseLinkItem[]
  /** ข้อมูลการย้ายคาบชั่วคราว (เมื่อคาบนี้ถูกย้ายมาในสัปดาห์/วันที่กำลังดู) */
  rescheduledInfo?: {
    overrideId: string
    originalDate: string
    originalDay: DayOfWeek
    originalStart: string
    originalEnd: string
    reason?: string
  }
}

export interface ClassRescheduleOverride {
  id: string
  group_id?: string
  semester: string
  course_code: string
  course_name: string
  section: string
  /** วันที่เดิมของคาบที่ถูกย้าย (YYYY-MM-DD) */
  original_date: string
  original_day: DayOfWeek
  original_start: string
  original_end: string
  /** หากงดคลาสในวันนี้โดยไม่มีวันชดเชย */
  canceled?: boolean
  /** วันที่ใหม่ที่ย้ายไป (YYYY-MM-DD) */
  new_date: string
  new_day: DayOfWeek
  new_start: string
  new_end: string
  new_room?: string
  reason?: string
  created_by?: string | null
  created_at?: string
}

export interface RoutineItem {
  id: string
  user_id?: string
  title: string
  day: RoutineDay
  start_time: string
  end_time: string
  category: string
  notes: string
  created_at?: string
}

export type TaskType = 'work' | 'homework' | 'exam'
export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface TaskItem {
  id: string
  group_id?: string
  title: string
  description: string
  task_type: TaskType
  course_code: string
  due_date: string | null
  status: TaskStatus
  assignee_ids: string[]
  exam_room?: string
  exam_topics?: string
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export interface ChatMessageItem {
  id: string
  group_id: string
  sender_id: string
  sender_name: string
  content: string
  pinned: boolean
  created_at: string
}

export interface SharedViewPayload {
  group: {
    id: string
    name: string
    description: string
    created_at: string
  }
  courses: Array<{
    id: string
    course_code: string
    course_name: string
    credits: number
    section: string
    instructor: string
    online_link: boolean
    color?: string
    location_text?: string
  }>
  class_sessions: Array<{
    id: string
    course_id?: string
    course_code: string
    course_name: string
    credits: number
    section: string
    day: DayOfWeek
    start_time: string
    end_time: string
    room: string
    instructor: string
    online_link: boolean
  }>
  tasks: Array<{
    id: string
    title: string
    description: string
    task_type: TaskType
    course_code: string
    due_date: string | null
    status: TaskStatus
    exam_room?: string
    exam_topics?: string
    assignee_names: string[]
  }>
}

export interface GoogleCalendarEventItem {
  id: string
  summary: string
  description: string
  location: string
  htmlLink: string
  startIso: string
  endIso: string
  day: DayOfWeek
  startTime: string
  endTime: string
  isAllDay: boolean
}

export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  list<T = unknown>(prefix?: string): Promise<Array<{ key: string; value: T }>>
}

/** นัดหมายของกลุ่มในตารางเรียน/ปฏิทิน/วันนี้ */
export interface AppointmentItem {
  id: string
  group_id?: string
  title: string
  /** วันที่นัดหมายในรูปแบบ YYYY-MM-DD */
  appt_date: string
  start_time: string
  end_time: string
  all_day: boolean
  location: string
  notes: string
  course_code: string
  created_by?: string | null
  created_at?: string
  updated_at?: string
}
