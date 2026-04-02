import OnboardingForm from '@/app/_components/OnboardingForm'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function OnboardingPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-4 py-3">
        <span className="font-bold text-lg">NotLate</span>
      </header>
      <main className="flex-1 mx-auto w-full max-w-xl px-4 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Let&apos;s set up your defaults</h1>
          <p className="mt-1 text-sm text-zinc-500">
            These are used to automatically create travel blocks. You can change them per event anytime.
          </p>
        </div>
        <OnboardingForm />
      </main>
    </div>
  )
}
