import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const rawUrl =
  (
    import.meta.env.VITE_SUPABASE_URL ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://cjcwzcjmdzrjnbwjihpr.supabase.co'
  ).trim()

const rawAnonKey =
  (
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    'sb_publishable_epR_RShy2JEL6Kb7YtRfMw_tc2DbZVP'
  ).trim()

export const isSupabaseConfigured = Boolean(rawUrl && rawAnonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(rawUrl, rawAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
