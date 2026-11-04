import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { IconBookOpen, IconCheck, IconPencil, IconX } from '../components/icons'
import { Badge, Button, Card, Toast } from '../components/ui'
import {
  formatSupabaseErrorThai,
  getRoleLabelThai,
  useAuth,
} from '../lib/auth'
import {
  generateSecureInviteCode,
  generateSecureShareToken,
  sha256Hex,
} from '../lib/crypto'
import { formatDateTimeThai, formatShortDateThai } from '../lib/dateThai'
import {
  COURSE_COLOR_PALETTE,
  DEFAULT_SAMPLE_SCHEDULE,
  DEFAULT_SEMESTER,
  buildCourseColorMap,
  getCourseColorTheme,
  localStore,
  saveCourseDetails,
  storage,
} from '../lib/storage'
import { supabase } from '../lib/supabase'
import type {
  CourseColorId,
  CourseScheduleItem,
  GroupRole,
  InviteCodeItem,
  ShareLinkItem,
} from '../types'

interface CourseOption {
  course_code: string
  course_name: string
  color: CourseColorId
  credits: number
  section: string
  instructor: string
  locationText: string
  scheduleTimes: string[]
  items: CourseScheduleItem[]
}

export function GroupPage() {
  const {
    user,
    groups,
    activeGroup,
    members,
    currentRole,
    setActiveGroupId,
    refreshGroupContext,
  } = useAuth()

  // ฟอร์มสร้างกลุ่มใหม่
  const [createMode, setCreateMode] = useState<'custom' | 'from_course'>('custom')
  const [groupName, setGroupName] = useState('')
  const [groupDesc, setGroupDesc] = useState('')
  const [groupColor, setGroupColor] = useState<CourseColorId>('indigo')
  const [selectedCourseCode, setSelectedCourseCode] = useState<string | null>(null)
  const [copyCourseSessions, setCopyCourseSessions] = useState(true)
  const [courseSearch, setCourseSearch] = useState('')
  const [courseOptions, setCourseOptions] = useState<CourseOption[]>([])
  const [loadingCourses, setLoadingCourses] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)

  // โมดอลแก้ไขข้อมูลกลุ่ม (เจ้าของ/ผู้ดูแล)
  const [isEditingGroupModalOpen, setIsEditingGroupModalOpen] = useState(false)
  const [editGroupName, setEditGroupName] = useState('')
  const [editGroupDesc, setEditGroupDesc] = useState('')
  const [editGroupColor, setEditGroupColor] = useState<CourseColorId>('indigo')
  const [editGroupCourseCode, setEditGroupCourseCode] = useState('')
  const [savingGroupEdit, setSavingGroupEdit] = useState(false)

  // ฟอร์มกรอกรหัสเชิญ
  const [inviteInput, setInviteInput] = useState('')
  const [redeeming, setRedeeming] = useState(false)

  // ฟอร์มสร้างรหัสเชิญใหม่ (เฉพาะ owner)
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member')
  const [inviteExpiresDays, setInviteExpiresDays] = useState<string>('7')
  const [inviteMaxUses, setInviteMaxUses] = useState<string>('5')
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [oneTimePlainCode, setOneTimePlainCode] = useState<string | null>(null)
  const [inviteCodes, setInviteCodes] = useState<InviteCodeItem[]>([])

  // ลิงก์แชร์ดูอย่างเดียว
  const [shareLinks, setShareLinks] = useState<ShareLinkItem[]>([])
  const [creatingShareLink, setCreatingShareLink] = useState(false)

  // ข้อความแจ้งเตือน
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const isOwner = currentRole === 'owner'
  const isOwnerOrAdmin = currentRole === 'owner' || currentRole === 'admin'

  // โหลดรายวิชาสำหรับโหมด "เลือกจากรายวิชา"
  useEffect(() => {
    let isMounted = true
    async function loadCoursesForGroup() {
      setLoadingCourses(true)
      try {
        const activeId = activeGroup?.id
        const key = activeId
          ? `class_sessions:${activeId}:${DEFAULT_SEMESTER}`
          : 'class_sessions'

        const [dbItems, localItems] = await Promise.all([
          storage.get<CourseScheduleItem[]>(key).catch(() => null),
          localStore.get<CourseScheduleItem[]>('class_sessions').catch(() => null),
        ])

        const rawItems =
          dbItems && dbItems.length > 0
            ? dbItems
            : localItems && localItems.length > 0
              ? localItems
              : DEFAULT_SAMPLE_SCHEDULE

        const colorMap = buildCourseColorMap(rawItems)
        const map = new Map<string, CourseOption>()

        for (const item of rawItems) {
          const code = (item.course_code || '').trim().toUpperCase()
          if (!code) continue

          const theme = colorMap.get(code)
          const themeId = (item.color as CourseColorId) || theme?.id || 'indigo'
          const existing = map.get(code)
          const sessionTime = `${item.day} ${item.start}–${item.end}${item.room ? ` (${item.room})` : ''}`

          if (!existing) {
            map.set(code, {
              course_code: code,
              course_name: item.course_name,
              color: themeId,
              credits: item.credits ?? 3,
              section: item.section || '001',
              instructor: item.instructor || '',
              locationText: item.location_text || item.room || '',
              scheduleTimes: [sessionTime],
              items: [item],
            })
          } else {
            existing.scheduleTimes.push(sessionTime)
            existing.items.push(item)
          }
        }

        if (isMounted) {
          setCourseOptions(Array.from(map.values()))
        }
      } catch (err) {
        console.error('Failed to load courses for group:', err)
      } finally {
        if (isMounted) setLoadingCourses(false)
      }
    }

    void loadCoursesForGroup()
    return () => {
      isMounted = false
    }
  }, [activeGroup?.id])

  const filteredCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase()
    if (!q) return courseOptions
    return courseOptions.filter(
      (c) =>
        c.course_code.toLowerCase().includes(q) ||
        c.course_name.toLowerCase().includes(q) ||
        c.instructor.toLowerCase().includes(q),
    )
  }, [courseOptions, courseSearch])

  function handleSelectCourse(course: CourseOption) {
    setSelectedCourseCode(course.course_code)
    setGroupName(`${course.course_code} ${course.course_name}`)
    setGroupColor(course.color)
    if (course.instructor) {
      setGroupDesc(`วิชา ${course.course_name} อาจารย์ผู้สอน: ${course.instructor}`)
    } else {
      setGroupDesc(`กลุ่มเรียนวิชา ${course.course_name}`)
    }
  }

  const loadAdminResources = useCallback(async () => {
    if (!supabase || !user || !activeGroup || !isOwnerOrAdmin) {
      setInviteCodes([])
      setShareLinks([])
      return
    }

    try {
      const [{ data: codesData }, { data: linksData }] = await Promise.all([
        supabase
          .from('invite_codes')
          .select('*')
          .eq('group_id', activeGroup.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('share_links')
          .select('*')
          .eq('group_id', activeGroup.id)
          .order('created_at', { ascending: false }),
      ])

      setInviteCodes((codesData ?? []) as InviteCodeItem[])
      setShareLinks((linksData ?? []) as ShareLinkItem[])
    } catch (err) {
      console.error('Error loading group management data:', err)
    }
  }, [user, activeGroup, isOwnerOrAdmin])

  useEffect(() => {
    void loadAdminResources()
  }, [loadAdminResources])

  async function handleCreateGroup(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !user) return
    const trimmedName = groupName.trim()
    if (!trimmedName) return

    setCreatingGroup(true)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      let newGroupId: string | null = null
      const courseCodeToSave = createMode === 'from_course' ? selectedCourseCode : null
      const colorToSave = groupColor || 'indigo'

      // 1. ลองบันทึกแบบมี source_course_code และ color
      try {
        const { data, error } = await supabase
          .from('groups')
          .insert({
            name: trimmedName,
            description: groupDesc.trim(),
            created_by: user.id,
            source_course_code: courseCodeToSave,
            color: colorToSave,
          })
          .select('*')
          .single()

        if (error) throw error
        newGroupId = data?.id as string
      } catch {
        // หากยังไม่ได้รัน migration-group-course.sql (คอลัมน์ยังไม่มี)
        // ให้ fallback บันทึกเฉพาะฟิลด์เดิม name, description, created_by
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('groups')
          .insert({
            name: trimmedName,
            description: groupDesc.trim(),
            created_by: user.id,
          })
          .select('*')
          .single()

        if (fallbackErr) throw fallbackErr
        newGroupId = fallbackData?.id as string

        // บันทึก metadata ลง localStorage สำรองไว้
        if (newGroupId) {
          try {
            window.localStorage.setItem(
              `lsp:group_meta:${newGroupId}`,
              JSON.stringify({ source_course_code: courseCodeToSave, color: colorToSave }),
            )
          } catch {}
        }
      }

      // 2. หากเลือกจากรายวิชา และติ๊กให้คัดลอกคาบเรียนไปไว้ในกลุ่มใหม่
      if (
        newGroupId &&
        createMode === 'from_course' &&
        copyCourseSessions &&
        selectedCourseCode
      ) {
        const selectedCourse = courseOptions.find((c) => c.course_code === selectedCourseCode)
        if (selectedCourse && selectedCourse.items.length > 0) {
          try {
            const targetStorageKey = `class_sessions:${newGroupId}:${DEFAULT_SEMESTER}`
            const itemsToCopy: CourseScheduleItem[] = selectedCourse.items.map((item) => ({
              ...item,
              group_id: newGroupId!,
              color: colorToSave,
            }))

            await storage.set(targetStorageKey, itemsToCopy)

            await saveCourseDetails({
              storageKey: targetStorageKey,
              courseCode: selectedCourse.course_code,
              color: colorToSave,
              notes: selectedCourse.items[0]?.notes || '',
              locationText: selectedCourse.locationText || '',
              links: selectedCourse.items[0]?.links || [],
              currentSessions: itemsToCopy,
            })
          } catch (copyErr) {
            console.warn('Could not copy course sessions to new group:', copyErr)
          }
        }
      }

      setGroupName('')
      setGroupDesc('')
      setSelectedCourseCode(null)
      if (newGroupId) {
        setActiveGroupId(newGroupId)
      }
      await refreshGroupContext()
      setStatusMessage(`สร้างกลุ่ม "${trimmedName}" สำเร็จเรียบร้อย! คุณเป็นเจ้าของกลุ่ม (Owner)`)
    } catch (err) {
      setErrorMessage(formatSupabaseErrorThai(err))
    } finally {
      setCreatingGroup(false)
    }
  }

  function handleOpenEditGroup() {
    if (!activeGroup) return
    setEditGroupName(activeGroup.name)
    setEditGroupDesc(activeGroup.description || '')
    setEditGroupColor((activeGroup.color as CourseColorId) || 'indigo')
    setEditGroupCourseCode(activeGroup.source_course_code || '')
    setIsEditingGroupModalOpen(true)
  }

  async function handleSaveGroupEdit(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !activeGroup) return
    const trimmed = editGroupName.trim()
    if (!trimmed) return

    setSavingGroupEdit(true)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      try {
        const { error } = await supabase
          .from('groups')
          .update({
            name: trimmed,
            description: editGroupDesc.trim(),
            color: editGroupColor,
            source_course_code: editGroupCourseCode.trim() || null,
          })
          .eq('id', activeGroup.id)

        if (error) throw error
      } catch {
        // Fallback if columns don't exist yet
        const { error } = await supabase
          .from('groups')
          .update({
            name: trimmed,
            description: editGroupDesc.trim(),
          })
          .eq('id', activeGroup.id)

        if (error) throw error

        try {
          window.localStorage.setItem(
            `lsp:group_meta:${activeGroup.id}`,
            JSON.stringify({
              source_course_code: editGroupCourseCode.trim() || null,
              color: editGroupColor,
            }),
          )
        } catch {}
      }

      await refreshGroupContext()
      setIsEditingGroupModalOpen(false)
      setStatusMessage(`บันทึกข้อมูลกลุ่ม "${trimmed}" เรียบร้อยแล้ว`)
    } catch (err) {
      setErrorMessage(formatSupabaseErrorThai(err))
    } finally {
      setSavingGroupEdit(false)
    }
  }

  async function handleRedeemCode(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !user) return
    const trimmed = inviteInput.trim()
    if (!trimmed) return

    setRedeeming(true)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const { data, error } = await supabase.rpc('redeem_invite_code', {
        code: trimmed,
      })

      if (error) throw error

      const result = data as { group_id?: string; role?: GroupRole } | null
      setInviteInput('')
      if (result?.group_id) {
        setActiveGroupId(result.group_id)
      }
      await refreshGroupContext()
      setStatusMessage(
        `ใช้รหัสเชิญสำเร็จ! คุณได้รับสิทธิ์ "${getRoleLabelThai(result?.role ?? 'member')}" ในกลุ่มเรียบร้อยแล้ว`,
      )
    } catch (err) {
      setErrorMessage(formatSupabaseErrorThai(err))
    } finally {
      setRedeeming(false)
    }
  }

  async function handleChangeMemberRole(memberId: string, newRole: GroupRole) {
    if (!supabase || !isOwner) return
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const { error } = await supabase
        .from('group_members')
        .update({ role: newRole })
        .eq('id', memberId)

      if (error) throw error
      await refreshGroupContext()
      setStatusMessage('อัปเดตบทบาทของสมาชิกเรียบร้อยแล้ว')
    } catch (err) {
      setErrorMessage(formatSupabaseErrorThai(err))
    }
  }

  async function handleRemoveMember(memberId: string, memberName: string) {
    if (!supabase || !isOwner) return
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('id', memberId)

      if (error) throw error
      await refreshGroupContext()
      setStatusMessage(`ถอดสมาชิก "${memberName}" ออกจากกลุ่มเรียบร้อยแล้ว`)
    } catch (err) {
      setErrorMessage(formatSupabaseErrorThai(err))
    }
  }

  async function handleGenerateInviteCode(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !user || !activeGroup || !isOwner) return

    setCreatingInvite(true)
    setErrorMessage(null)
    setStatusMessage(null)
    setOneTimePlainCode(null)

    try {
      const plainCode = generateSecureInviteCode()
      const codeHash = await sha256Hex(plainCode)

      const daysNum = Number(inviteExpiresDays)
      const expiresAt =
        !Number.isNaN(daysNum) && daysNum > 0
          ? new Date(Date.now() + daysNum * 24 * 60 * 60 * 1000).toISOString()
          : null

      const maxUsesNum = Number(inviteMaxUses)
      const maxUses = !Number.isNaN(maxUsesNum) && maxUsesNum > 0 ? maxUsesNum : null

      const { error } = await supabase.from('invite_codes').insert({
        group_id: activeGroup.id,
        code_hash: codeHash,
        role: inviteRole,
        expires_at: expiresAt,
        max_uses: maxUses,
        created_by: user.id,
      })

      if (error) throw error

      // แสดงรหัสเต็มเพียงครั้งเดียวตอนสร้าง!
      setOneTimePlainCode(plainCode)
      await loadAdminResources()
      setStatusMessage('สร้างรหัสเชิญใหม่สำเร็จ! กรุณาคัดลอกรหัสด้านล่างเก็บไว้ทันที (แสดงครั้งเดียวเท่านั้น)')
    } catch (err) {
      setErrorMessage(formatSupabaseErrorThai(err))
    } finally {
      setCreatingInvite(false)
    }
  }

  async function handleRevokeInviteCode(codeId: string) {
    if (!supabase || !isOwnerOrAdmin) return
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const { error } = await supabase
        .from('invite_codes')
        .update({ revoked: true })
        .eq('id', codeId)

      if (error) throw error
      await loadAdminResources()
      setStatusMessage('ยกเลิกรหัสเชิญเรียบร้อยแล้ว')
    } catch (err) {
      setErrorMessage(formatSupabaseErrorThai(err))
    }
  }

  async function handleCreateShareLink() {
    if (!supabase || !user || !activeGroup || !isOwnerOrAdmin) return
    setCreatingShareLink(true)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const token = generateSecureShareToken()
      const { error } = await supabase.from('share_links').insert({
        token,
        group_id: activeGroup.id,
        created_by: user.id,
      })

      if (error) throw error
      await loadAdminResources()
      setStatusMessage('สร้างลิงก์แชร์ดูอย่างเดียวเรียบร้อยแล้ว')
    } catch (err) {
      setErrorMessage(formatSupabaseErrorThai(err))
    } finally {
      setCreatingShareLink(false)
    }
  }

  async function handleRevokeShareLink(linkId: string) {
    if (!supabase || !isOwnerOrAdmin) return
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const { error } = await supabase
        .from('share_links')
        .update({ revoked: true })
        .eq('id', linkId)

      if (error) throw error
      await loadAdminResources()
      setStatusMessage('ยกเลิกลิงก์แชร์เรียบร้อยแล้ว ลิงก์ดังกล่าวจะไม่สามารถเปิดดูได้อีก')
    } catch (err) {
      setErrorMessage(formatSupabaseErrorThai(err))
    }
  }

  if (!user) {
    return (
      <Card>
        <h1 className="text-2xl font-bold text-ink">จัดการกลุ่มและรหัสเชิญ</h1>
        <p className="mt-2 text-sm text-ink-muted">
          กรุณาเข้าสู่ระบบก่อนใช้งานระบบกลุ่มเรียน การกรอกรหัสเชิญ และการสร้างลิงก์แชร์
        </p>
        <Link
          to="/login"
          className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
        >
          ไปหน้าเข้าสู่ระบบ (/login)
        </Link>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink">จัดการกลุ่มและรหัสเชิญ</h1>
            <p className="mt-1 text-sm text-ink-muted">
              สร้างกลุ่ม กรอกรหัสเชิญเพื่อรับสิทธิ์แก้ไข จัดการสมาชิก และสร้างลิงก์แชร์ดูอย่างเดียว
            </p>
          </div>
          <Badge tone={currentRole === 'viewer' ? 'warning' : 'mint'}>
            สิทธิ์ในกลุ่มนี้: {getRoleLabelThai(currentRole)}
          </Badge>
        </div>

        <div className="mt-3 space-y-2">
          <Toast
            message={statusMessage}
            tone="success"
            onClose={() => setStatusMessage(null)}
          />
          <Toast
            message={errorMessage}
            tone="danger"
            onClose={() => setErrorMessage(null)}
          />
        </div>

        {groups.length > 0 && activeGroup && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="select-active-group" className="text-sm font-semibold text-ink">
                กลุ่มที่เลือกใช้งาน:
              </label>
              <select
                id="select-active-group"
                value={activeGroup.id}
                onChange={(e) => setActiveGroupId(e.target.value)}
                className="min-h-[44px] rounded-xl border border-line bg-surface-alt px-3 py-1.5 text-sm font-medium text-ink focus:border-primary focus:outline-none"
              >
                {groups.map((g) => {
                  const tag = g.source_course_code ? `[${g.source_course_code}] ` : ''
                  return (
                    <option key={g.id} value={g.id}>
                      {tag}{g.name}
                    </option>
                  )
                })}
              </select>
            </div>

            {/* ข้อมูลกลุ่มที่เลือกใช้งาน & ปุ่มแก้ไขข้อมูลกลุ่ม */}
            <div className="flex flex-wrap items-center gap-2">
              {activeGroup.source_course_code && (
                <Badge tone="sky" className="inline-flex items-center gap-1">
                  <IconBookOpen className="h-3 w-3" />
                  <span>วิชา {activeGroup.source_course_code}</span>
                </Badge>
              )}
              {activeGroup.color && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-alt px-2.5 py-1 text-xs font-semibold">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      getCourseColorTheme((activeGroup.color as CourseColorId) || 'indigo')?.swatchBg || 'bg-primary'
                    }`}
                  />
                  <span className="text-xs text-ink-secondary">
                    {getCourseColorTheme((activeGroup.color as CourseColorId) || 'indigo')?.label || 'ม่วงคราม'}
                  </span>
                </span>
              )}
              {isOwnerOrAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOpenEditGroup}
                  className="inline-flex items-center gap-1.5"
                >
                  <IconPencil className="h-3.5 w-3.5 text-primary" />
                  <span>แก้ไขข้อมูลกลุ่ม</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ช่องกรอกรหัสเชิญ */}
        <Card>
          <h2 className="text-lg font-bold text-ink">กรอกรหัสเชิญเข้ากลุ่ม</h2>
          <p className="mt-1 text-xs text-ink-muted">
            หากคุณมีสิทธิ์เป็น &ldquo;ผู้ชม&rdquo; กรุณากรอกรหัสเชิญที่ได้รับจากเจ้าของกลุ่มเพื่อรับสิทธิ์แก้ไขและแชท
          </p>
          <form onSubmit={(e) => void handleRedeemCode(e)} className="mt-4 space-y-3">
            <input
              type="text"
              required
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
              placeholder="เช่น ABCD-1234-EFGH"
              className="min-h-[44px] w-full rounded-xl border border-line bg-surface-alt px-3 py-2 font-mono text-sm uppercase text-ink focus:border-primary focus:outline-none"
            />
            <Button type="submit" disabled={redeeming} className="w-full">
              {redeeming ? 'กำลังตรวจสอบรหัสเชิญ...' : 'ยืนยันรหัสเชิญ'}
            </Button>
          </form>
        </Card>

        {/* สร้างกลุ่มใหม่ */}
        <Card className="md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <div>
              <h2 className="text-lg font-bold text-ink">สร้างกลุ่มใหม่</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                เลือกตั้งชื่อเอง หรือเลือกจากรายวิชาในตารางเรียนเพื่อเติมข้อมูลและคัดลอกคาบเรียนอัตโนมัติ
              </p>
            </div>
            {/* สลับโหมดตั้งชื่อเอง / เลือกจากรายวิชา */}
            <div className="inline-flex rounded-xl border border-line bg-surface-alt p-1">
              <button
                type="button"
                onClick={() => setCreateMode('custom')}
                className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  createMode === 'custom'
                    ? 'bg-primary text-ink-inverted shadow-xs'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                ตั้งชื่อเอง
              </button>
              <button
                type="button"
                onClick={() => setCreateMode('from_course')}
                className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  createMode === 'from_course'
                    ? 'bg-primary text-ink-inverted shadow-xs'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                เลือกจากรายวิชา ({courseOptions.length})
              </button>
            </div>
          </div>

          <form onSubmit={(e) => void handleCreateGroup(e)} className="mt-4 space-y-4">
            {createMode === 'from_course' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-ink">
                    1. เลือกรหัสวิชาที่ต้องการใช้สร้างกลุ่ม:
                  </span>
                  {courseOptions.length > 4 && (
                    <input
                      type="text"
                      value={courseSearch}
                      onChange={(e) => setCourseSearch(e.target.value)}
                      placeholder="ค้นหารหัส/ชื่อวิชา..."
                      className="max-w-[200px] rounded-lg border border-line bg-surface-alt px-2.5 py-1 text-xs text-ink focus:border-primary focus:outline-none"
                    />
                  )}
                </div>

                {loadingCourses ? (
                  <div className="py-6 text-center text-xs text-ink-muted">
                    กำลังโหลดรายวิชาจากตารางเรียน...
                  </div>
                ) : filteredCourses.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-ink-muted">
                    ไม่พบรายวิชาในตารางเรียน คุณสามารถไปเพิ่มวิชาที่หน้า{' '}
                    <Link to="/schedule" className="font-bold text-primary underline">
                      ตารางเรียน (/schedule)
                    </Link>{' '}
                    หรือเลือกโหมด "ตั้งชื่อเอง" ด้านบน
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredCourses.map((c) => {
                      const isSelected = selectedCourseCode === c.course_code
                      const theme = getCourseColorTheme(c.color)
                      return (
                        <div
                          key={`course-opt-${c.course_code}`}
                          onClick={() => handleSelectCourse(c)}
                          className={`group relative cursor-pointer rounded-xl border p-3 transition-all ${
                            isSelected
                              ? 'border-primary bg-primary-soft/25 ring-2 ring-primary/40'
                              : 'border-line bg-surface-alt hover:border-line-strong hover:bg-surface'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-bold ${
                                theme?.bar || 'bg-primary'
                              } text-white`}
                            >
                              {c.course_code}
                            </span>
                            <div
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                                isSelected
                                  ? 'border-primary bg-primary text-ink-inverted'
                                  : 'border-line text-transparent group-hover:border-line-strong'
                              }`}
                            >
                              <IconCheck className="h-3.5 w-3.5" />
                            </div>
                          </div>

                          <div className="mt-1.5 font-semibold text-xs text-ink line-clamp-1">
                            {c.course_name}
                          </div>

                          <div className="mt-1 space-y-0.5 text-[11px] text-ink-muted">
                            <div className="line-clamp-1">
                              {c.scheduleTimes.join(', ') || 'ไม่มีข้อมูลเวลาเรียน'}
                            </div>
                            {c.instructor && (
                              <div className="line-clamp-1 text-ink-secondary">
                                อาจารย์: {c.instructor}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {selectedCourseCode && (
                  <div className="rounded-xl border border-line bg-surface-alt/70 p-3">
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={copyCourseSessions}
                        onChange={(e) => setCopyCourseSessions(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-line text-primary focus:ring-primary"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-ink">
                          คัดลอกวิชาและคาบเรียนนี้ไปไว้ในกลุ่มใหม่โดยอัตโนมัติ
                        </span>
                        <p className="mt-0.5 text-ink-muted">
                          สมาชิกที่เข้าร่วมกลุ่มนี้จะเห็นตารางเรียน ห้องเรียน และผู้สอนของวิชานี้ทันที
                        </p>
                      </div>
                    </label>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3 pt-2">
              <div>
                <div className="flex items-center justify-between pb-1">
                  <label htmlFor="input-group-name" className="text-xs font-bold text-ink">
                    ชื่อกลุ่ม: <span className="text-status-danger-fg">*</span>
                  </label>
                  <span
                    className={`font-mono text-[11px] ${
                      groupName.length > 70 ? 'text-status-warning-fg font-bold' : 'text-ink-muted'
                    }`}
                  >
                    {groupName.length}/80
                  </span>
                </div>
                <input
                  id="input-group-name"
                  type="text"
                  required
                  maxLength={80}
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="เช่น MGT33267 การวิเคราะห์ธุรกิจ Sec 002"
                  className="min-h-[44px] w-full rounded-xl border border-line bg-surface-alt px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="input-group-desc" className="block pb-1 text-xs font-bold text-ink">
                  คำอธิบายกลุ่ม (ไม่บังคับ):
                </label>
                <input
                  id="input-group-desc"
                  type="text"
                  value={groupDesc}
                  onChange={(e) => setGroupDesc(e.target.value)}
                  placeholder="เช่น กลุ่มทำงานโปรเจกต์และแชร์โน้ตสรุป"
                  className="min-h-[44px] w-full rounded-xl border border-line bg-surface-alt px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                />
              </div>

              {/* ธีมสีประจำกลุ่ม */}
              <div>
                <label className="block pb-1.5 text-xs font-bold text-ink">
                  ธีมสีประจำกลุ่ม:
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {COURSE_COLOR_PALETTE.map((pal) => {
                    const isSelected = groupColor === pal.id
                    return (
                      <button
                        key={`pal-group-${pal.id}`}
                        type="button"
                        onClick={() => setGroupColor(pal.id)}
                        className={`group flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium transition ${
                          isSelected
                            ? 'border-primary bg-primary-soft text-primary font-bold shadow-2xs'
                            : 'border-line bg-surface-alt text-ink-secondary hover:text-ink hover:border-line-strong'
                        }`}
                      >
                        <span className={`h-3 w-3 rounded-full ${pal.swatchBg}`} />
                        <span>{pal.label}</span>
                        {isSelected && <IconCheck className="h-3.5 w-3.5 ml-0.5 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={creatingGroup || !groupName.trim()}
              className="w-full sm:w-auto"
            >
              {creatingGroup ? 'กำลังสร้างกลุ่ม...' : 'สร้างกลุ่มใหม่'}
            </Button>
          </form>
        </Card>
      </div>

      {/* รายชื่อสมาชิกในกลุ่ม */}
      {activeGroup && (
        <Card>
          <h2 className="text-lg font-bold text-ink">
            สมาชิกในกลุ่ม &ldquo;{activeGroup.name}&rdquo; ({members.length} คน)
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            แสดงเฉพาะชื่อแสดงผลและบทบาท (ไม่แสดงอีเมลเพื่อความเป็นส่วนตัว)
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-edge text-xs font-semibold text-ink-muted uppercase">
                  <th className="py-2 pr-4">ชื่อสมาชิก</th>
                  <th className="py-2 pr-4">บทบาท (Role)</th>
                  <th className="py-2 pr-4">วันที่เข้าร่วม</th>
                  {isOwner && <th className="py-2 text-right">การจัดการ (เฉพาะเจ้าของ)</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {members.map((m) => {
                  const isSelf = m.user_id === user.id
                  return (
                    <tr key={m.id}>
                      <td className="py-3 pr-4 font-medium text-ink">
                        {m.display_name}{' '}
                        {isSelf && <span className="text-xs text-primary">(คุณ)</span>}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone={m.role === 'owner' ? 'pink' : m.role === 'admin' ? 'sky' : 'mint'}>
                          {getRoleLabelThai(m.role)} ({m.role})
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-xs text-ink-muted">
                        {formatShortDateThai(m.joined_at)}
                      </td>
                      {isOwner && (
                        <td className="py-3 text-right">
                          {!isSelf ? (
                            <div className="inline-flex flex-wrap items-center gap-2">
                              <select
                                aria-label={`เปลี่ยนบทบาทของ ${m.display_name}`}
                                value={m.role}
                                onChange={(e) =>
                                  void handleChangeMemberRole(m.id, e.target.value as GroupRole)
                                }
                                className="min-h-[38px] rounded-lg border border-edge bg-surface-muted px-2 py-1 text-xs text-ink"
                              >
                                <option value="member">ผู้แก้ไข (member)</option>
                                <option value="admin">ผู้ดูแล (admin)</option>
                                <option value="owner">เจ้าของ (owner)</option>
                              </select>
                              <Button
                                type="button"
                                size="sm"
                                variant="danger"
                                onClick={() => void handleRemoveMember(m.id, m.display_name)}
                              >
                                ถอดสมาชิก
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-ink-muted">เจ้าของกลุ่มปัจจุบัน</span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ส่วนสร้างและจัดการรหัสเชิญ (เฉพาะเจ้าของสร้าง/ยกเลิกรหัสได้ และผู้ดูแลดูได้) */}
      {activeGroup && isOwner && (
        <Card>
          <h2 className="text-lg font-bold text-ink">สร้างรหัสเชิญเข้ากลุ่ม (เฉพาะเจ้าของกลุ่ม)</h2>
          <p className="mt-1 text-xs text-ink-muted">
            ระบบจะแสดงรหัสเต็มเพียงครั้งเดียวตอนสร้าง และนำเฉพาะค่า SHA-256 Hash ไปเก็บในฐานข้อมูล
          </p>

          <form
            onSubmit={(e) => void handleGenerateInviteCode(e)}
            className="mt-4 grid gap-3 sm:grid-cols-4"
          >
            <div>
              <label className="block text-xs font-medium text-ink">สิทธิ์ที่จะได้รับ</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-edge bg-surface-muted px-3 py-2 text-sm text-ink"
              >
                <option value="member">ผู้แก้ไข (member)</option>
                <option value="admin">ผู้ดูแล (admin)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink">หมดอายุภายใน (วัน)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={inviteExpiresDays}
                onChange={(e) => setInviteExpiresDays(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-edge bg-surface-muted px-3 py-2 text-sm text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink">จำนวนครั้งที่ใช้ได้สูงสุด</label>
              <input
                type="number"
                min="1"
                max="500"
                value={inviteMaxUses}
                onChange={(e) => setInviteMaxUses(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-edge bg-surface-muted px-3 py-2 text-sm text-ink"
              />
            </div>

            <div className="flex items-end">
              <Button type="submit" disabled={creatingInvite} className="w-full">
                {creatingInvite ? 'กำลังสร้าง...' : 'สร้างรหัสเชิญ'}
              </Button>
            </div>
          </form>

          {oneTimePlainCode && (
            <div className="mt-4 rounded-2xl border-2 border-warning bg-warning-soft p-4">
              <p className="text-xs font-bold text-warning-ink uppercase">
                รหัสเชิญใหม่ของคุณ (แสดงเพียงครั้งเดียวเท่านั้น กรุณาคัดลอกเก็บไว้ทันที):
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <code className="rounded-xl border border-edge bg-surface px-3 py-1.5 font-mono text-lg font-bold tracking-wider text-primary">
                  {oneTimePlainCode}
                </code>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(oneTimePlainCode)
                    setStatusMessage('คัดลอกรหัสเชิญลงคลิปบอร์ดแล้ว')
                  }}
                >
                  คัดลอกรหัสเชิญ
                </Button>
              </div>
            </div>
          )}

          {inviteCodes.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <h3 className="text-sm font-semibold text-ink">ประวัติรหัสเชิญของกลุ่ม (เก็บเฉพาะค่า Hash)</h3>
              <table className="mt-2 w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-edge text-ink-muted">
                    <th className="py-2 pr-3">SHA-256 Hash (ย่อ)</th>
                    <th className="py-2 pr-3">บทบาท</th>
                    <th className="py-2 pr-3">จำนวนที่ใช้</th>
                    <th className="py-2 pr-3">วันหมดอายุ</th>
                    <th className="py-2 pr-3">สถานะ</th>
                    <th className="py-2 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {inviteCodes.map((ic) => (
                    <tr key={ic.id}>
                      <td className="py-2 pr-3 font-mono text-ink-muted">
                        {ic.code_hash.slice(0, 12)}...
                      </td>
                      <td className="py-2 pr-3 font-medium text-ink">{getRoleLabelThai(ic.role)}</td>
                      <td className="py-2 pr-3 text-ink">
                        {ic.used_count} / {ic.max_uses ?? 'ไม่จำกัด'}
                      </td>
                      <td className="py-2 pr-3 text-ink-muted">
                        {ic.expires_at ? formatShortDateThai(ic.expires_at) : 'ไม่มีวันหมดอายุ'}
                      </td>
                      <td className="py-2 pr-3">
                        {ic.revoked ? (
                          <Badge tone="danger">ถูกยกเลิกแล้ว</Badge>
                        ) : (
                          <Badge tone="success">ใช้งานได้</Badge>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {!ic.revoked && (
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            onClick={() => void handleRevokeInviteCode(ic.id)}
                          >
                            ยกเลิกรหัส
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ส่วนลิงก์แชร์ดูอย่างเดียว (เฉพาะ owner/admin) */}
      {activeGroup && isOwnerOrAdmin && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink">ลิงก์แชร์ดูอย่างเดียว (/share/:token)</h2>
              <p className="mt-1 text-xs text-ink-muted">
                ผู้ที่มีลิงก์นี้สามารถเปิดดูตารางเรียนและรายการงานของกลุ่มได้โดยไม่ต้องล็อกอิน (ไม่สามารถแก้ไขข้อมูลได้)
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={creatingShareLink}
              onClick={() => void handleCreateShareLink()}
            >
              {creatingShareLink ? 'กำลังสร้างลิงก์...' : '+ สร้างลิงก์แชร์ใหม่'}
            </Button>
          </div>

          {shareLinks.length > 0 && (
            <div className="mt-4 space-y-2">
              {shareLinks.map((sl) => {
                const fullUrl = `${window.location.origin}/share/${sl.token}`
                return (
                  <div
                    key={sl.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-edge bg-surface-muted p-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-ink">{fullUrl}</p>
                      <p className="mt-0.5 text-ink-muted">
                        สร้างเมื่อ {formatDateTimeThai(sl.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {sl.revoked ? (
                        <Badge tone="danger">ยกเลิกลิงก์แล้ว</Badge>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              void navigator.clipboard.writeText(fullUrl)
                              setStatusMessage('คัดลอกลิงก์แชร์ลงคลิปบอร์ดแล้ว')
                            }}
                          >
                            คัดลอกลิงก์
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            onClick={() => void handleRevokeShareLink(sl.id)}
                          >
                            ยกเลิกลิงก์แชร์
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* โมดอลแก้ไขข้อมูลกลุ่ม (เจ้าของกลุ่มและผู้ดูแล) */}
      {isEditingGroupModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEditingGroupModalOpen(false)
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-5 shadow-2xl sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <IconPencil className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold text-ink">แก้ไขข้อมูลกลุ่ม</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingGroupModalOpen(false)}
                className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-hover hover:text-ink"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveGroupEdit(e)} className="space-y-4">
              <div>
                <div className="flex items-center justify-between pb-1">
                  <label htmlFor="edit-group-name" className="text-xs font-bold text-ink">
                    ชื่อกลุ่ม: <span className="text-status-danger-fg">*</span>
                  </label>
                  <span
                    className={`font-mono text-[11px] ${
                      editGroupName.length > 70 ? 'text-status-warning-fg font-bold' : 'text-ink-muted'
                    }`}
                  >
                    {editGroupName.length}/80
                  </span>
                </div>
                <input
                  id="edit-group-name"
                  type="text"
                  required
                  maxLength={80}
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-line bg-surface-alt px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="edit-group-desc" className="block pb-1 text-xs font-bold text-ink">
                  คำอธิบายกลุ่ม:
                </label>
                <input
                  id="edit-group-desc"
                  type="text"
                  value={editGroupDesc}
                  onChange={(e) => setEditGroupDesc(e.target.value)}
                  placeholder="เช่น กลุ่มทำงานโปรเจกต์และแชร์โน้ตสรุป"
                  className="min-h-[44px] w-full rounded-xl border border-line bg-surface-alt px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-group-course-code"
                  className="block pb-1 text-xs font-bold text-ink"
                >
                  รหัสวิชาประจำกลุ่ม (ไม่บังคับ):
                </label>
                <input
                  id="edit-group-course-code"
                  type="text"
                  value={editGroupCourseCode}
                  onChange={(e) => setEditGroupCourseCode(e.target.value.toUpperCase())}
                  placeholder="เช่น MGT33267"
                  className="min-h-[44px] w-full rounded-xl border border-line bg-surface-alt px-3 py-2 font-mono text-sm uppercase text-ink focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block pb-1.5 text-xs font-bold text-ink">
                  ธีมสีประจำกลุ่ม:
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {COURSE_COLOR_PALETTE.map((pal) => {
                    const isSelected = editGroupColor === pal.id
                    return (
                      <button
                        key={`edit-pal-${pal.id}`}
                        type="button"
                        onClick={() => setEditGroupColor(pal.id)}
                        className={`group flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium transition ${
                          isSelected
                            ? 'border-primary bg-primary-soft text-primary font-bold shadow-2xs'
                            : 'border-line bg-surface-alt text-ink-secondary hover:text-ink hover:border-line-strong'
                        }`}
                      >
                        <span className={`h-3 w-3 rounded-full ${pal.swatchBg}`} />
                        <span>{pal.label}</span>
                        {isSelected && <IconCheck className="h-3.5 w-3.5 ml-0.5 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditingGroupModalOpen(false)}
                >
                  ยกเลิก
                </Button>
                <Button type="submit" disabled={savingGroupEdit || !editGroupName.trim()}>
                  {savingGroupEdit ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default GroupPage
