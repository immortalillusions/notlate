import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import SessionProvider from '@/app/_components/SessionProvider'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })

export const metadata: Metadata = {
  title: 'NotLate — Travel Time Calendar',
  description: 'Automatically add travel time blocks to your Google Calendar events.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 antialiased font-sans">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
