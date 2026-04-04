import { createClient } from '@supabase/supabase-js'

// Client-side Supabase client — uses the anon key, safe to expose.
// Only used in browser components (Realtime subscriptions).
export const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
