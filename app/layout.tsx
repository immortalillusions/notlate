import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import SessionProvider from '@/app/_components/SessionProvider'
import ThemeProvider from '@/app/_components/ThemeProvider'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })

export const metadata: Metadata = {
  title: 'NotLate',
  description: 'Automatically add travel time blocks and personalized reminders to your Google Calendar events.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-neutral-900 text-zinc-900 dark:text-zinc-100 antialiased font-sans">
        <ThemeProvider>
          <SessionProvider>{children}</SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
