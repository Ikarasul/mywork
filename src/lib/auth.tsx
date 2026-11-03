import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './supabase'
import type { EffectiveRole, GroupInfo, GroupMemberWithProfile, GroupRole } from '../types'

const ACTIVE_GROUP_STORAGE_KEY = 'lsp:active_group_id'

export function getRoleLabelThai(role: EffectiveRole): string {
  switch (role) {
    case 'owner':
      return 'เจ้าของ'
    case 'admin':
      return 'ผู้ดูแล'
    case 'member':
      return 'ผู้แก้ไข'
    case 'viewer':
    default:
      return 'ผู้ชม'
  }
}

export function getRoleBadgeClass(role: EffectiveRole): string {
  switch (role) {
    case 'owner':
      return 'bg-purple-100 text-purple-800 border-purple-300'
    case 'admin':
      return 'bg-indigo-100 text-indigo-800 border-indigo-300'
    case 'member':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300'
    case 'viewer':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300'
  }
}

export function formatSupabaseErrorThai(error: unknown): string {
  if (!error) return 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)

  if (
    message.includes('Failed to fetch') ||
    message.includes('NetworkError') ||
    message.includes('network')
  ) {
    return 'ไม่สามารถเชื่อมต่อเครือข่ายหรือเซิร์ฟเวอร์ฐานข้อมูลได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง'
  }
  if (message.includes('row-level security')) {
    return 'คุณไม่มีสิทธิ์ดำเนินการนี้ (ถูกจำกัดสิทธิ์โดยนโยบายความปลอดภัยฐานข้อมูล RLS)'
  }
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return 'ส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง'
  }
  return message
}

interface AuthContextValue {
  user: User | null
  session: Session | null
  displayName: string
  loading: boolean
  groups: GroupInfo[]
  activeGroup: GroupInfo | null
  members: GroupMemberWithProfile[]
  currentRole: EffectiveRole
  setActiveGroupId: (groupId: string) => void
  refreshGroupContext: () => Promise<void>
  signInWithMagicLink: (email: string, displayName?: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [displayName, setDisplayName] = useState<string>('ผู้ชม')
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured)
  const [groups, setGroups] = useState<GroupInfo[]>([])
  const [activeGroupId, setActiveGroupIdState] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(ACTIVE_GROUP_STORAGE_KEY)
    } catch {
      return null
    }
  })
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([])
  const [currentRole, setCurrentRole] = useState<EffectiveRole>('viewer')

  const setActiveGroupId = useCallback((groupId: string) => {
    setActiveGroupIdState(groupId)
    try {
      window.localStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, groupId)
    } catch {
      // ignore storage errors
    }
  }, [])

  const refreshGroupContext = useCallback(async () => {
    if (!supabase || !user) {
      setGroups([])
      setMembers([])
      setCurrentRole('viewer')
      return
    }

    try {
      // ดึงหรือสร้างโปรไฟล์ของผู้ใช้
      const fallbackName =
        (user.user_metadata?.display_name as string | undefined) ||
        user.email?.split('@')[0] ||
        'ผู้ใช้งาน'

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, display_name, created_at')
        .eq('id', user.id)
        .maybeSingle()

      if (profileData?.display_name) {
        setDisplayName(profileData.display_name)
      } else {
        setDisplayName(fallbackName)
        await supabase
          .from('profiles')
          .upsert({ id: user.id, display_name: fallbackName }, { onConflict: 'id' })
      }

      // ดึงรายชื่อกลุ่มทั้งหมด
      const { data: groupsData } = await supabase
        .from('groups')
        .select('id, name, description, created_by, created_at')
        .order('created_at', { ascending: true })

      const groupList = (groupsData ?? []) as GroupInfo[]
      setGroups(groupList)

      if (groupList.length === 0) {
        setMembers([])
        setCurrentRole('viewer')
        return
      }

      // เลือกกลุ่มปัจจุบัน (ถ้ากลุ่มที่เคยเลือกไว้ยังมีอยู่ให้ใช้กลุ่มนั้น มิฉะนั้นเลือกกลุ่มที่ผู้ใช้เป็นสมาชิก หรือกลุ่มแรก)
      const { data: myMemberships } = await supabase
        .from('group_members')
        .select('group_id, role')
        .eq('user_id', user.id)

      const membershipMap = new Map<string, GroupRole>()
      for (const m of myMemberships ?? []) {
        membershipMap.set(m.group_id as string, m.role as GroupRole)
      }

      let resolvedGroupId = activeGroupId
      if (!resolvedGroupId || !groupList.some((g) => g.id === resolvedGroupId)) {
        const firstJoined = groupList.find((g) => membershipMap.has(g.id))
        resolvedGroupId = firstJoined ? firstJoined.id : groupList[0].id
        setActiveGroupId(resolvedGroupId)
      }

      const roleInActiveGroup = membershipMap.get(resolvedGroupId) ?? 'viewer'
      setCurrentRole(roleInActiveGroup)

      // ดึงสมาชิกของกลุ่มปัจจุบันพร้อมชื่อแสดงผลจาก profiles
      const { data: rawMembers } = await supabase
        .from('group_members')
        .select('id, group_id, user_id, role, joined_at')
        .eq('group_id', resolvedGroupId)
        .order('joined_at', { ascending: true })

      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('id, display_name')

      const profileMap = new Map<string, string>()
      for (const p of allProfiles ?? []) {
        profileMap.set(p.id as string, p.display_name as string)
      }

      const enrichedMembers: GroupMemberWithProfile[] = (rawMembers ?? []).map((rm) => ({
        id: rm.id as string,
        group_id: rm.group_id as string,
        user_id: rm.user_id as string,
        role: rm.role as GroupRole,
        joined_at: rm.joined_at as string,
        display_name: profileMap.get(rm.user_id as string) ?? 'สมาชิก',
      }))

      setMembers(enrichedMembers)
    } catch (err) {
      console.error('Error refreshing group context:', err)
    }
  }, [user, activeGroupId, setActiveGroupId])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      setSession(newSession)
      setUser(newSession?.user ?? null)
      if (!newSession?.user) {
        setDisplayName('ผู้ชม')
        setCurrentRole('viewer')
        setGroups([])
        setMembers([])
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (user) {
      void refreshGroupContext()
    }
  }, [user, refreshGroupContext])

  const signInWithMagicLink = useCallback(
    async (email: string, customDisplayName?: string): Promise<{ error: string | null }> => {
      if (!supabase) {
        return { error: 'ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล Supabase ใน .env.local' }
      }
      const trimmedEmail = email.trim()
      if (!trimmedEmail) {
        return { error: 'กรุณากรอกอีเมลของคุณ' }
      }
      try {
        const { error } = await supabase.auth.signInWithOtp({
          email: trimmedEmail,
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
            data: customDisplayName?.trim()
              ? { display_name: customDisplayName.trim() }
              : undefined,
          },
        })
        if (error) {
          return { error: formatSupabaseErrorThai(error) }
        }
        return { error: null }
      } catch (err) {
        return { error: formatSupabaseErrorThai(err) }
      }
    },
    [],
  )

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setCurrentRole('viewer')
    setGroups([])
    setMembers([])
  }, [])

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0] ?? null

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        displayName,
        loading,
        groups,
        activeGroup,
        members,
        currentRole,
        setActiveGroupId,
        refreshGroupContext,
        signInWithMagicLink,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return ctx
}
