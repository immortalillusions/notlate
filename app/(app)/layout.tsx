import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { signOut } from '@/lib/auth'
import Link from 'next/link'
import OpenTutorialFromQuery from '@/app/_components/OpenTutorialFromQuery'
import TutorialButton from '@/app/_components/TutorialButton'
import TutorialModal from '@/app/_components/TutorialModal'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-bold text-lg">NotLate</span>
            <nav className="flex gap-4 text-sm">
              <Link
                href="/dashboard"
                className="text-zinc-700 hover:text-zinc-900 transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/settings"
                className="text-zinc-700 hover:text-zinc-900 transition-colors"
              >
                Settings
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <TutorialButton />
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/login' })
              }}
            >
              <button
                type="submit"
                className="text-sm text-zinc-700 hover:text-zinc-900 cursor-pointer transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-8">{children}</main>
      <OpenTutorialFromQuery />
      <TutorialModal />
    </div>
  )
}
