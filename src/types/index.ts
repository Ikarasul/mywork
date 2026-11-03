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

export interface CourseScheduleItem {
  id?: string
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
  }>
  class_sessions: Array<{
    id: string
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
    assignee_names: string[]
  }>
}

export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  list<T = unknown>(prefix?: string): Promise<Array<{ key: string; value: T }>>
}
