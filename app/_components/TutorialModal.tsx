"use client"

import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'

export default function TutorialModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onOpen() {
      setOpen(true)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('open-tutorial', onOpen)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('open-tutorial', onOpen)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!open) return null

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-2xl rounded-lg bg-white p-6 shadow-lg max-[480px]:max-w-md max-[360px]:max-w-sm max-[375px]:max-w-[18rem] max-[375px]:p-3">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold max-[375px]:text-base">Tutorial</h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close tutorial"
            className="rounded-full bg-zinc-100 px-3 py-1 text-sm hover:bg-zinc-200 max-[375px]:px-2 max-[375px]:py-0.5 max-[375px]:text-xs"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm text-zinc-700 max-[375px]:text-xs">
          <p>
            Welcome!
          </p>

          <ol className="list-decimal list-inside space-y-2">
            <li>
              Events with a location in your Google Calendar appear on the Dashboard. NotLate auto creates a travel event for each using your default settings, so you know when to leave.
            </li>
            <li>
              The Event card shows the suggested departure, travel mode, buffer and reminder. Click the card to open the side panel where you can override departure, mode, or buffer for that event.
            </li>
            <li>
              &quot;Get routes&quot; fetches route options from the Directions API; choose one with &quot;Choose this route&quot; to save it and update the travel block on your calendar.
            </li>
            <li>
              The reminder for the travel-block is only changed when you click &quot;Update reminder on calendar&quot;. Background refreshes preserve the existing reminder.
            </li>
            <li>
              Webhooks keep the Dashboard in sync automatically. If an event is deleted or changed, the corresponding travel-block will too.
            </li>
          </ol>

          <p className="text-zinc-500 text-xs">
            Tip: Click &quot;Refresh&quot; for an event to get live traffic-adjusted travel times.
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}
