import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { signOut } from '@/lib/auth'
import Link from 'next/link'

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
                className="text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/settings"
                className="text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                Settings
              </Link>
            </nav>
          </div>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/login' })
            }}
          >
            <button
              type="submit"
              className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-8">{children}</main>
    </div>
  )
}
