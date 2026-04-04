'use client'

import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    // Initialize from document and listen for theme changes dispatched elsewhere in the window
    const update = () => setDark(document.documentElement.classList.contains('dark'))
    update()

    const handler = (e: Event) => {
      // Try to treat the event as a CustomEvent with a typed detail
      const ce = e as CustomEvent<{ isDark?: boolean }>
      if (ce && typeof ce.detail?.isDark !== 'undefined') {
        setDark(Boolean(ce.detail.isDark))
      } else {
        update()
      }
    }

    window.addEventListener('theme-change', handler as EventListener)
    return () => window.removeEventListener('theme-change', handler as EventListener)
  }, [])

  function toggle() {
    const isDark = document.documentElement.classList.toggle('dark')
    setDark(isDark)
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
    // Notify other instances in the same window so they stay in sync
    window.dispatchEvent(new CustomEvent('theme-change', { detail: { isDark } }))
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="rounded-lg p-1.5 text-zinc-500 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
    >
      {dark ? (
        // Sun icon
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        </svg>
      ) : (
        // Moon icon
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  )
}
