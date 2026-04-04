import OnboardingForm from '@/app/_components/OnboardingForm'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function OnboardingPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-neutral-900">
      <header className="border-b border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3">
        <span className="font-bold text-lg text-(--gcal-blue)">NotLate</span>
      </header>
      <main className="flex-1 mx-auto w-full max-w-xl px-4 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Let&apos;s set up your defaults</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-300">
            These are used to automatically create travel blocks. You can change them per event anytime.
          </p>
        </div>
        <OnboardingForm />
      </main>
    </div>
  )
}
