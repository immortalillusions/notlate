import { signIn } from '@/lib/auth'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CyclingText from '@/app/_components/CyclingText'
import FeatureList from '@/app/_components/FeatureList'
import OpenTutorialFromQuery from '@/app/_components/OpenTutorialFromQuery'
import TutorialButton from '@/app/_components/TutorialButton'
import ThemeToggle from '@/app/_components/ThemeToggle'
import TutorialModal from '@/app/_components/TutorialModal'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await auth()
  if (session) redirect('/dashboard')

  const { error } = await searchParams
  const calendarDenied = error === 'calendar_scope_denied'

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16 bg-slate-50 dark:bg-neutral-900">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <ThemeToggle />
        <TutorialButton />
      </div>

      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-(--gcal-blue)">NotLate</h1>
        <p className="mt-2 text-zinc-500 dark:text-zinc-300 w-64">
          Auto-adds <CyclingText /> <br></br>Planned for you to leave on cue
        </p>
      </div>

      <div className="bg-white dark:bg-zinc-800 rounded-2xl border border-slate-200 dark:border-zinc-700 p-5 w-full max-w-sm shadow-sm text-center space-y-4">
        <FeatureList />

        {calendarDenied && (
          <p className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
            Calendar access is required. Please sign in again and check the Google Calendar permission.
          </p>
        )}

        <form
          action={async () => {
            'use server'
            await signIn('google')
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-white dark:bg-zinc-700 border border-slate-300 dark:border-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-100 shadow-sm hover:bg-slate-50 dark:hover:bg-zinc-600 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>
        </form>

        <p className="text-xs text-zinc-400 dark:text-zinc-400">
          Requires access to Google Calendar to create events.
        </p>
      </div>

      <OpenTutorialFromQuery />
      <TutorialModal />
    </main>
  )
}
