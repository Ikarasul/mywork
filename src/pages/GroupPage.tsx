import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
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
import { supabase } from '../lib/supabase'
import type { GroupRole, InviteCodeItem, ShareLinkItem } from '../types'

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
  const [groupName, setGroupName] = useState('')
  const [groupDesc, setGroupDesc] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)

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
      const { data, error } = await supabase
        .from('groups')
        .insert({
          name: trimmedName,
          description: groupDesc.trim(),
          created_by: user.id,
        })
        .select('*')
        .single()

      if (error) throw error

      setGroupName('')
      setGroupDesc('')
      if (data?.id) {
        setActiveGroupId(data.id as string)
      }
      await refreshGroupContext()
      setStatusMessage(`สร้างกลุ่ม "${trimmedName}" สำเร็จ! คุณเป็นเจ้าของกลุ่ม (Owner)`)
    } catch (err) {
      setErrorMessage(formatSupabaseErrorThai(err))
    } finally {
      setCreatingGroup(false)
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

        {groups.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-edge pt-4">
            <label htmlFor="select-active-group" className="text-sm font-medium text-ink">
              กลุ่มที่เลือกใช้งาน:
            </label>
            <select
              id="select-active-group"
              value={activeGroup?.id ?? ''}
              onChange={(e) => setActiveGroupId(e.target.value)}
              className="min-h-[44px] rounded-xl border border-edge bg-surface-muted px-3 py-1.5 text-sm font-medium text-ink"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
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
              className="min-h-[44px] w-full rounded-xl border border-edge bg-surface-muted px-3 py-2 font-mono text-sm uppercase text-ink focus:border-primary focus:outline-none"
            />
            <Button type="submit" disabled={redeeming} className="w-full">
              {redeeming ? 'กำลังตรวจสอบรหัสเชิญ...' : 'ยืนยันรหัสเชิญ'}
            </Button>
          </form>
        </Card>

        {/* สร้างกลุ่มใหม่ */}
        <Card>
          <h2 className="text-lg font-bold text-ink">สร้างกลุ่มใหม่</h2>
          <p className="mt-1 text-xs text-ink-muted">
            เมื่อสร้างกลุ่มใหม่ คุณจะได้รับสิทธิ์เป็นเจ้าของกลุ่ม (Owner) โดยอัตโนมัติ
          </p>
          <form onSubmit={(e) => void handleCreateGroup(e)} className="mt-4 space-y-3">
            <input
              type="text"
              required
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="ชื่อกลุ่มเรียน เช่น กลุ่มบริหารธุรกิจ ปี 4"
              className="min-h-[44px] w-full rounded-xl border border-edge bg-surface-muted px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
            <input
              type="text"
              value={groupDesc}
              onChange={(e) => setGroupDesc(e.target.value)}
              placeholder="คำอธิบายกลุ่ม (ไม่บังคับ)"
              className="min-h-[44px] w-full rounded-xl border border-edge bg-surface-muted px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
            <Button type="submit" disabled={creatingGroup} className="w-full">
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
    </div>
  )
}

export default GroupPage
