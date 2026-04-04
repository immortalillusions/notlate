"use client"

import React from 'react'

export default function TutorialButton() {
  return (
    <button
      type="button"
      aria-label="Open tutorial"
      title="Open tutorial"
      onClick={() => window.dispatchEvent(new Event('open-tutorial'))}
      className="h-8 w-8 rounded-full bg-(--gcal-blue) flex items-center justify-center text-zinc-50 hover:bg-zinc-800 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 transition-colors"
    >
      ?
    </button>
  )
}
