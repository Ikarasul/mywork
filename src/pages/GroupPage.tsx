import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  formatSupabaseErrorThai,
  getRoleBadgeClass,
  getRoleLabelThai,
  useAuth,
} from '../lib/auth'
import {
  generateSecureInviteCode,
  generateSecureShareToken,
  sha256Hex,
} from '../lib/crypto'
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
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h1 className="text-2xl font-bold text-slate-900">จัดการกลุ่มและรหัสเชิญ</h1>
        <p className="mt-2 text-sm text-slate-600">
          กรุณาเข้าสู่ระบบก่อนใช้งานระบบกลุ่มเรียน การกรอกรหัสเชิญ และการสร้างลิงก์แชร์
        </p>
        <Link
          to="/login"
          className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          ไปหน้าเข้าสู่ระบบ (/login)
        </Link>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">จัดการกลุ่มและรหัสเชิญ</h1>
            <p className="mt-1 text-sm text-slate-500">
              สร้างกลุ่ม กรอกรหัสเชิญเพื่อรับสิทธิ์แก้ไข จัดการสมาชิก และสร้างลิงก์แชร์ดูอย่างเดียว
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getRoleBadgeClass(currentRole)}`}
          >
            สิทธิ์ในกลุ่มนี้: {getRoleLabelThai(currentRole)}
          </span>
        </div>

        {statusMessage && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {statusMessage}
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}

        {groups.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <label htmlFor="select-active-group" className="text-sm font-medium text-slate-700">
              กลุ่มที่เลือกใช้งาน:
            </label>
            <select
              id="select-active-group"
              value={activeGroup?.id ?? ''}
              onChange={(e) => setActiveGroupId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ช่องกรอกรหัสเชิญ */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-lg font-bold text-slate-900">กรอกรหัสเชิญเข้ากลุ่ม</h2>
          <p className="mt-1 text-xs text-slate-500">
            หากคุณมีสิทธิ์เป็น &ldquo;ผู้ชม&rdquo; กรุณากรอกรหัสเชิญที่ได้รับจากเจ้าของกลุ่มเพื่อรับสิทธิ์แก้ไขและแชท
          </p>
          <form onSubmit={(e) => void handleRedeemCode(e)} className="mt-4 space-y-3">
            <input
              type="text"
              required
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
              placeholder="เช่น ABCD-1234-EFGH"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={redeeming}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {redeeming ? 'กำลังตรวจสอบรหัสเชิญ...' : 'ยืนยันรหัสเชิญ'}
            </button>
          </form>
        </section>

        {/* สร้างกลุ่มใหม่ */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-lg font-bold text-slate-900">สร้างกลุ่มใหม่</h2>
          <p className="mt-1 text-xs text-slate-500">
            เมื่อสร้างกลุ่มใหม่ คุณจะได้รับสิทธิ์เป็นเจ้าของกลุ่ม (Owner) โดยอัตโนมัติ
          </p>
          <form onSubmit={(e) => void handleCreateGroup(e)} className="mt-4 space-y-3">
            <input
              type="text"
              required
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="ชื่อกลุ่มเรียน เช่น กลุ่มบริหารธุรกิจ ปี 3"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <input
              type="text"
              value={groupDesc}
              onChange={(e) => setGroupDesc(e.target.value)}
              placeholder="คำอธิบายกลุ่ม (ไม่บังคับ)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={creatingGroup}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {creatingGroup ? 'กำลังสร้างกลุ่ม...' : 'สร้างกลุ่มใหม่'}
            </button>
          </form>
        </section>
      </div>

      {/* รายชื่อสมาชิกในกลุ่ม */}
      {activeGroup && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-lg font-bold text-slate-900">
            สมาชิกในกลุ่ม &ldquo;{activeGroup.name}&rdquo; ({members.length} คน)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            แสดงเฉพาะชื่อแสดงผลและบทบาท (ไม่แสดงอีเมลเพื่อความเป็นส่วนตัว)
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                  <th className="py-2 pr-4">ชื่อสมาชิก</th>
                  <th className="py-2 pr-4">บทบาท (Role)</th>
                  <th className="py-2 pr-4">วันที่เข้าร่วม</th>
                  {isOwner && <th className="py-2 text-right">การจัดการ (เฉพาะเจ้าของ)</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => {
                  const isSelf = m.user_id === user.id
                  return (
                    <tr key={m.id}>
                      <td className="py-3 pr-4 font-medium text-slate-900">
                        {m.display_name} {isSelf && <span className="text-xs text-indigo-600">(คุณ)</span>}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getRoleBadgeClass(m.role)}`}
                        >
                          {getRoleLabelThai(m.role)} ({m.role})
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-xs text-slate-500">
                        {new Date(m.joined_at).toLocaleDateString('th-TH')}
                      </td>
                      {isOwner && (
                        <td className="py-3 text-right">
                          {!isSelf ? (
                            <div className="inline-flex items-center gap-2">
                              <select
                                aria-label={`เปลี่ยนบทบาทของ ${m.display_name}`}
                                value={m.role}
                                onChange={(e) =>
                                  void handleChangeMemberRole(m.id, e.target.value as GroupRole)
                                }
                                className="rounded border border-slate-300 px-2 py-1 text-xs"
                              >
                                <option value="member">ผู้แก้ไข (member)</option>
                                <option value="admin">ผู้ดูแล (admin)</option>
                                <option value="owner">เจ้าของ (owner)</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => void handleRemoveMember(m.id, m.display_name)}
                                className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                              >
                                ถอดสมาชิก
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">เจ้าของกลุ่มปัจจุบัน</span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ส่วนสร้างและจัดการรหัสเชิญ (เฉพาะเจ้าของสร้าง/ยกเลิกรหัสได้ และผู้ดูแลดูได้) */}
      {activeGroup && isOwner && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-lg font-bold text-slate-900">สร้างรหัสเชิญเข้ากลุ่ม (เฉพาะเจ้าของกลุ่ม)</h2>
          <p className="mt-1 text-xs text-slate-500">
            ระบบจะแสดงรหัสเต็มเพียงครั้งเดียวตอนสร้าง และนำเฉพาะค่า SHA-256 Hash ไปเก็บในฐานข้อมูล
          </p>

          <form
            onSubmit={(e) => void handleGenerateInviteCode(e)}
            className="mt-4 grid gap-3 sm:grid-cols-4"
          >
            <div>
              <label className="block text-xs font-medium text-slate-700">สิทธิ์ที่จะได้รับ</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="member">ผู้แก้ไข (member)</option>
                <option value="admin">ผู้ดูแล (admin)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">หมดอายุภายใน (วัน)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={inviteExpiresDays}
                onChange={(e) => setInviteExpiresDays(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">จำนวนครั้งที่ใช้ได้สูงสุด</label>
              <input
                type="number"
                min="1"
                max="500"
                value={inviteMaxUses}
                onChange={(e) => setInviteMaxUses(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={creatingInvite}
                className="w-full rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {creatingInvite ? 'กำลังสร้าง...' : 'สร้างรหัสเชิญ'}
              </button>
            </div>
          </form>

          {oneTimePlainCode && (
            <div className="mt-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
              <p className="text-xs font-bold text-amber-900 uppercase">
                รหัสเชิญใหม่ของคุณ (แสดงเพียงครั้งเดียวเท่านั้น กรุณาคัดลอกเก็บไว้ทันที):
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <code className="rounded bg-white px-3 py-1.5 font-mono text-lg font-bold tracking-wider text-indigo-700 shadow-xs">
                  {oneTimePlainCode}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(oneTimePlainCode)
                    setStatusMessage('คัดลอกรหัสเชิญลงคลิปบอร์ดแล้ว')
                  }}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  คัดลอกรหัสเชิญ
                </button>
              </div>
            </div>
          )}

          {inviteCodes.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <h3 className="text-sm font-semibold text-slate-800">ประวัติรหัสเชิญของกลุ่ม (เก็บเฉพาะค่า Hash)</h3>
              <table className="mt-2 w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3">SHA-256 Hash (ย่อ)</th>
                    <th className="py-2 pr-3">บทบาท</th>
                    <th className="py-2 pr-3">จำนวนที่ใช้</th>
                    <th className="py-2 pr-3">วันหมดอายุ</th>
                    <th className="py-2 pr-3">สถานะ</th>
                    <th className="py-2 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inviteCodes.map((ic) => (
                    <tr key={ic.id}>
                      <td className="py-2 pr-3 font-mono text-slate-600">
                        {ic.code_hash.slice(0, 12)}...
                      </td>
                      <td className="py-2 pr-3 font-medium">{getRoleLabelThai(ic.role)}</td>
                      <td className="py-2 pr-3">
                        {ic.used_count} / {ic.max_uses ?? 'ไม่จำกัด'}
                      </td>
                      <td className="py-2 pr-3">
                        {ic.expires_at
                          ? new Date(ic.expires_at).toLocaleDateString('th-TH')
                          : 'ไม่มีวันหมดอายุ'}
                      </td>
                      <td className="py-2 pr-3">
                        {ic.revoked ? (
                          <span className="rounded bg-rose-100 px-2 py-0.5 text-rose-700">
                            ถูกยกเลิกแล้ว
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-700">
                            ใช้งานได้
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {!ic.revoked && (
                          <button
                            type="button"
                            onClick={() => void handleRevokeInviteCode(ic.id)}
                            className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                          >
                            ยกเลิกรหัส
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ส่วนลิงก์แชร์ดูอย่างเดียว (เฉพาะ owner/admin) */}
      {activeGroup && isOwnerOrAdmin && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">ลิงก์แชร์ดูอย่างเดียว (/share/:token)</h2>
              <p className="mt-1 text-xs text-slate-500">
                ผู้ที่มีลิงก์นี้สามารถเปิดดูตารางเรียนและรายการงานของกลุ่มได้โดยไม่ต้องล็อกอิน (ไม่สามารถแก้ไขข้อมูลได้)
              </p>
            </div>
            <button
              type="button"
              disabled={creatingShareLink}
              onClick={() => void handleCreateShareLink()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {creatingShareLink ? 'กำลังสร้างลิงก์...' : '+ สร้างลิงก์แชร์ใหม่'}
            </button>
          </div>

          {shareLinks.length > 0 && (
            <div className="mt-4 space-y-2">
              {shareLinks.map((sl) => {
                const fullUrl = `${window.location.origin}/share/${sl.token}`
                return (
                  <div
                    key={sl.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-slate-700">{fullUrl}</p>
                      <p className="mt-0.5 text-slate-400">
                        สร้างเมื่อ {new Date(sl.created_at).toLocaleString('th-TH')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {sl.revoked ? (
                        <span className="rounded bg-rose-100 px-2.5 py-1 font-medium text-rose-700">
                          ยกเลิกลิงก์แล้ว
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(fullUrl)
                              setStatusMessage('คัดลอกลิงก์แชร์ลงคลิปบอร์ดแล้ว')
                            }}
                            className="rounded border border-indigo-200 bg-white px-2.5 py-1 font-medium text-indigo-700 hover:bg-indigo-50"
                          >
                            คัดลอกลิงก์
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRevokeShareLink(sl.id)}
                            className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1 font-medium text-rose-700 hover:bg-rose-100"
                          >
                            ยกเลิกลิงก์แชร์
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default GroupPage
