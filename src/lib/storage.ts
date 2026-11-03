import type { StorageAdapter } from '../types'

const STORAGE_PREFIX = 'lsp:'

function withPrefix(key: string): string {
  return key.startsWith(STORAGE_PREFIX) ? key : `${STORAGE_PREFIX}${key}`
}

function stripPrefix(key: string): string {
  return key.startsWith(STORAGE_PREFIX) ? key.slice(STORAGE_PREFIX.length) : key
}

class LocalStorageAdapter implements StorageAdapter {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = window.localStorage.getItem(withPrefix(key))
      if (raw === null) return null
      return JSON.parse(raw) as T
    } catch (error) {
      console.error(`Error reading key "${key}" from localStorage:`, error)
      return null
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      const serialized = JSON.stringify(value)
      window.localStorage.setItem(withPrefix(key), serialized)
    } catch (error) {
      console.error(`Error writing key "${key}" to localStorage:`, error)
      throw error
    }
  }

  async remove(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(withPrefix(key))
    } catch (error) {
      console.error(`Error removing key "${key}" from localStorage:`, error)
      throw error
    }
  }

  async list<T = unknown>(prefix = ''): Promise<Array<{ key: string; value: T }>> {
    const fullPrefix = withPrefix(prefix)
    const results: Array<{ key: string; value: T }> = []

    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const rawKey = window.localStorage.key(i)
        if (rawKey && rawKey.startsWith(fullPrefix)) {
          const rawVal = window.localStorage.getItem(rawKey)
          if (rawVal !== null) {
            try {
              results.push({
                key: stripPrefix(rawKey),
                value: JSON.parse(rawVal) as T,
              })
            } catch {
              // ข้ามรายการที่ไม่ใช่ JSON ที่ถูกต้อง
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error listing keys with prefix "${prefix}" from localStorage:`, error)
    }

    return results
  }
}

export const storage: StorageAdapter = new LocalStorageAdapter()
export default storage
