import { Link, NavLink } from 'react-router-dom'
import { getRoleBadgeClass, getRoleLabelThai, useAuth } from '../lib/auth'

interface NavItem {
  path: string
  label: string
}

const navItems: NavItem[] = [
  { path: '/life', label: 'ตารางชีวิต' },
  { path: '/schedule', label: 'ตารางเรียน' },
  { path: '/tasks', label: 'งาน/การบ้าน/สอบ' },
  { path: '/chat', label: 'แชทกลุ่ม' },
  { path: '/group', label: 'จัดการกลุ่ม' },
]

export function Navbar() {
  const { user, displayName, currentRole, activeGroup, signOut } = useAuth()

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link to="/life" className="text-lg font-bold text-indigo-600">
              ระบบจัดตารางชีวิตและการเรียน
            </Link>
            {activeGroup && (
              <span className="hidden rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 sm:inline-block">
                กลุ่ม: {activeGroup.name}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              title="ระดับสิทธิ์ปัจจุบันของคุณ"
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getRoleBadgeClass(currentRole)}`}
            >
              สิทธิ์: {getRoleLabelThai(currentRole)}
            </span>

            {user ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="text-xs font-medium text-slate-700 hover:text-indigo-600"
                >
                  {displayName}
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                >
                  ออกจากระบบ
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="rounded-lg bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                เข้าสู่ระบบ
              </Link>
            )}
          </div>
        </div>

        <nav aria-label="เมนูหลัก" className="-mx-1 flex overflow-x-auto sm:mx-0">
          <ul className="flex w-full items-center gap-1 sm:w-auto">
            {navItems.map((item) => (
              <li key={item.path} className="flex-1 sm:flex-initial">
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `block whitespace-nowrap rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  )
}

export default Navbar
