import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SettingsForm from '@/app/_components/SettingsForm'
import type { User } from '@/lib/supabase-types'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { data: user } = await supabase
    .from('users')
    .select(
      'default_departure, default_travel_mode, default_buffer_minutes, reminder_mode, fixed_reminder_minutes'
    )
    .eq('id', session.user.id)
    .single<
      Pick<
        User,
        | 'default_departure'
        | 'default_travel_mode'
        | 'default_buffer_minutes'
        | 'reminder_mode'
        | 'fixed_reminder_minutes'
      >
    >()

  if (!user) redirect('/login')

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Change your defaults. These apply to all new events unless overridden per-event.
        </p>
      </div>
      <SettingsForm user={user} />
    </div>
  )
}
