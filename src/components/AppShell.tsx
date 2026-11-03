import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { getRoleLabelThai, useAuth } from '../lib/auth'
import { THEME_META, useTheme, type ThemeMode } from '../lib/theme'
import Badge, { type BadgeTone } from './ui/Badge'

interface NavItem {
  path: string
  label: string
  shortLabel: string
  icon: ReactNode
  mobileBottom?: boolean
}

function IconSun() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function IconMoon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function IconSparkleDark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z" />
    </svg>
  )
}

function getThemeIcon(theme: ThemeMode) {
  if (theme === 'light') return <IconSun />
  if (theme === 'dark') return <IconMoon />
  return <IconSparkleDark />
}

function getRoleTone(role: string): BadgeTone {
  if (role === 'owner') return 'pink'
  if (role === 'admin') return 'primary'
  if (role === 'member') return 'mint'
  return 'warning'
}

const ALL_NAV_ITEMS: NavItem[] = [
  {
    path: '/today',
    label: 'วันนี้',
    shortLabel: 'วันนี้',
    mobileBottom: true,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01" />
      </svg>
    ),
  },
  {
    path: '/schedule',
    label: 'ตารางเรียน',
    shortLabel: 'ตารางเรียน',
    mobileBottom: true,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    path: '/tasks',
    label: 'งาน/การบ้าน/สอบ',
    shortLabel: 'งาน/สอบ',
    mobileBottom: true,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    path: '/chat',
    label: 'แชทกลุ่ม',
    shortLabel: 'แชทกลุ่ม',
    mobileBottom: true,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    path: '/life',
    label: 'ตารางชีวิต',
    shortLabel: 'ตารางชีวิต',
    mobileBottom: false,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
  },
  {
    path: '/group',
    label: 'จัดการกลุ่ม',
    shortLabel: 'กลุ่ม',
    mobileBottom: false,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
]

const MOBILE_BOTTOM_ITEMS = ALL_NAV_ITEMS.filter((item) => item.mobileBottom)

export interface AppShellProps {
  children: ReactNode
  headerLogoMascot?: ReactNode
  footerSleepMascot?: ReactNode
  banners?: ReactNode
}

export function AppShell({
  children,
  headerLogoMascot,
  footerSleepMascot,
  banners,
}: AppShellProps) {
  const { user, displayName, currentRole, activeGroup, signOut } = useAuth()
  const { theme, cycleTheme } = useTheme()

  const isViewer = currentRole === 'viewer'

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-app text-ink flex flex-col">
      {/* ส่วนหัวเว็บ (Header) */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:px-5">
          {/* โลโก้ + มาสคอตพิกเซลแมว */}
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              to="/today"
              className="flex min-h-[44px] items-center gap-2.5 rounded-xl px-1.5 py-1 transition hover:bg-surface-hover"
            >
              {headerLogoMascot}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-pixel text-xs tracking-wider text-primary sm:text-sm">
                    NEKO•PLAN
                  </span>
                  <span className="hidden rounded-md bg-accent-pink-soft px-1.5 py-0.5 font-pixel text-[10px] text-accent-pink-fg xl:inline-block">
                    2569
                  </span>
                </div>
                <p className="truncate text-xs font-bold text-ink sm:text-sm">
                  ตารางชีวิตและการเรียน
                </p>
              </div>
            </Link>

            {activeGroup && (
              <span className="hidden rounded-lg border border-line bg-surface-alt px-2.5 py-1 text-xs font-medium text-ink-secondary xl:inline-block">
                กลุ่ม: {activeGroup.name}
              </span>
            )}
          </div>

          {/* แถบเมนูบนสำหรับคอมพิวเตอร์ (>1024px) */}
          <nav
            aria-label="เมนูหลักคอมพิวเตอร์"
            className="hidden lg:flex lg:items-center lg:gap-1"
          >
            {ALL_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-primary text-ink-inverted shadow-2xs'
                      : 'text-ink-secondary hover:bg-surface-hover hover:text-ink'
                  }`
                }
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* ปุ่มสลับธีม + ป้ายบอกสิทธิ์ + ปุ่มล็อกอิน/ออกจากระบบ */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* ทางลัดตารางชีวิตและกลุ่มบนมือถือ */}
            <NavLink
              to="/life"
              title="ตารางชีวิต"
              className={({ isActive }) =>
                `flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border text-xs font-semibold sm:hidden ${
                  isActive
                    ? 'border-primary bg-primary-soft text-primary-fg'
                    : 'border-line bg-surface-alt text-ink-secondary'
                }`
              }
            >
              ชีวิต
            </NavLink>

            <NavLink
              to="/group"
              title="จัดการกลุ่ม"
              className={({ isActive }) =>
                `flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border text-xs font-semibold sm:hidden ${
                  isActive
                    ? 'border-primary bg-primary-soft text-primary-fg'
                    : 'border-line bg-surface-alt text-ink-secondary'
                }`
              }
            >
              กลุ่ม
            </NavLink>

            {/* ปุ่มสลับธีม (สว่าง -> มืด -> ดำสนิท) */}
            <button
              type="button"
              onClick={cycleTheme}
              title={`ธีมปัจจุบัน: ${THEME_META[theme].label} (คลิกเพื่อเปลี่ยนธีม)`}
              aria-label={`สลับธีม ปัจจุบันคือ ${THEME_META[theme].label}`}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-surface-alt px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:bg-surface-hover"
            >
              {getThemeIcon(theme)}
              <span className="hidden md:inline">{THEME_META[theme].shortLabel}</span>
            </button>

            {/* ป้ายบอกสิทธิ์ / โหมดดูอย่างเดียว */}
            <Badge
              tone={getRoleTone(currentRole)}
              className="hidden sm:inline-flex"
              title="ระดับสิทธิ์ปัจจุบันของคุณ"
            >
              {isViewer
                ? 'โหมดดูอย่างเดียว (ผู้ชม)'
                : `สิทธิ์: ${getRoleLabelThai(currentRole)}`}
            </Badge>

            {user ? (
              <div className="flex items-center gap-1.5">
                <Link
                  to="/login"
                  className="hidden max-w-[110px] truncate text-xs font-semibold text-ink-secondary hover:text-primary md:inline-block"
                >
                  {displayName}
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="min-h-[44px] sm:min-h-[38px] rounded-xl border border-status-danger bg-status-danger-soft px-2.5 py-1.5 text-xs font-semibold text-status-danger-fg transition hover:opacity-90"
                >
                  ออก
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="inline-flex min-h-[44px] sm:min-h-[38px] items-center rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-ink-inverted transition hover:bg-primary-hover"
              >
                เข้าสู่ระบบ
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* โครงสร้างหลัก: แถบข้างแบบย่อสำหรับแท็บเล็ต (640-1024px) + พื้นที่เนื้อหา */}
      <div className="mx-auto flex w-full max-w-7xl flex-1">
        {/* แท็บเล็ต (640-1024px): แถบข้างแบบย่อ (ไอคอน) */}
        <aside
          aria-label="แถบข้างเมนูแท็บเล็ต"
          className="hidden sm:flex lg:hidden w-20 shrink-0 flex-col items-center gap-2 border-r border-line bg-surface py-4 px-2"
        >
          {ALL_NAV_ITEMS.map((item) => (
            <NavLink
              key={`tablet-${item.path}`}
              to={item.path}
              title={item.label}
              className={({ isActive }) =>
                `flex min-h-[52px] w-full flex-col items-center justify-center gap-1 rounded-xl p-2 text-[11px] font-semibold transition-all ${
                  isActive
                    ? 'bg-primary text-ink-inverted shadow-2xs'
                    : 'text-ink-secondary hover:bg-surface-hover hover:text-ink'
                }`
              }
            >
              {item.icon}
              <span className="truncate max-w-full">{item.shortLabel}</span>
            </NavLink>
          ))}
        </aside>

        {/* พื้นที่แสดงผลหลัก */}
        <div className="min-w-0 flex-1 pb-24 sm:pb-10">
          {banners}
          <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
            {children}
          </main>
          {footerSleepMascot && (
            <div className="mx-auto max-w-6xl px-3 pb-6 sm:px-6">
              {footerSleepMascot}
            </div>
          )}
        </div>
      </div>

      {/* มือถือ (<640px): แถบเมนูล่างสุด 4 ไอคอนพร้อมป้ายชื่อ รองรับ safe-area */}
      <nav
        aria-label="แถบเมนูด้านล่างสำหรับมือถือ"
        className="safe-bottom-nav fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md sm:hidden"
      >
        <ul className="grid grid-cols-4 gap-1 px-2 pt-1.5">
          {MOBILE_BOTTOM_ITEMS.map((item) => (
            <li key={`mobile-${item.path}`}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-semibold transition-all ${
                    isActive
                      ? 'bg-primary-soft text-primary-fg font-bold'
                      : 'text-ink-muted hover:text-ink'
                  }`
                }
              >
                {item.icon}
                <span className="truncate">{item.shortLabel}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

export default AppShell
export * from './ui'
