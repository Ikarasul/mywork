import { NavLink } from 'react-router-dom'

interface NavItem {
  path: string
  label: string
}

const navItems: NavItem[] = [
  { path: '/life', label: 'ตารางชีวิต' },
  { path: '/schedule', label: 'ตารางเรียน' },
  { path: '/tasks', label: 'งาน/การบ้าน/สอบ' },
  { path: '/chat', label: 'แชทกลุ่ม' },
]

export function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-indigo-600">
            ระบบจัดตารางชีวิตและการเรียน
          </span>
        </div>

        <nav aria-label="เมนูหลัก" className=" -mx-1 flex overflow-x-auto sm:mx-0">
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
