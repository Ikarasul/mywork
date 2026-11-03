import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type ThemeMode = 'light' | 'dark' | 'oled'

const THEME_STORAGE_KEY = 'lsp:ui_theme'

export const THEME_META: Record<
  ThemeMode,
  { label: string; shortLabel: string; description: string }
> = {
  light: {
    label: 'ธีมสว่าง (สดใส)',
    shortLabel: 'สว่าง',
    description: 'พื้นสะอาด สีเน้นสดใส มุมโค้งมน',
  },
  dark: {
    label: 'ธีมมืด',
    shortLabel: 'มืด',
    description: 'พื้นเทาเข้มอมม่วง สบายตาในที่แสงน้อย',
  },
  oled: {
    label: 'ธีมดำสนิท (OLED)',
    shortLabel: 'ดำสนิท',
    description: 'พื้นหลังดำสนิท ประหยัดพลังงานหน้าจอ',
  },
}

export function getPreferredSystemTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  try {
    if (
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark'
    }
  } catch {
    // ignore
  }
  return 'light'
}

export function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'oled') {
      return saved
    }
  } catch {
    // ignore
  }
  return getPreferredSystemTheme()
}

export function applyThemeToDom(theme: ThemeMode): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('theme-light', 'theme-dark', 'theme-oled')
  root.classList.add(`theme-${theme}`)
  root.setAttribute('data-theme', theme)
}

export function saveThemeToLocal(theme: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // ignore
  }
  applyThemeToDom(theme)
}

export function getNextTheme(current: ThemeMode): ThemeMode {
  if (current === 'light') return 'dark'
  if (current === 'dark') return 'oled'
  return 'light'
}

interface ThemeContextValue {
  theme: ThemeMode
  setTheme: (mode: ThemeMode) => void
  cycleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => getInitialTheme())

  useEffect(() => {
    applyThemeToDom(theme)
  }, [theme])

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode)
    saveThemeToLocal(mode)
  }, [])

  const cycleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = getNextTheme(prev)
      saveThemeToLocal(next)
      return next
    })
  }, [])

  return createElement(
    ThemeContext.Provider,
    { value: { theme, setTheme, cycleTheme } },
    children,
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider')
  }
  return ctx
}
