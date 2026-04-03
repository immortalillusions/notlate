"use client"

import React from 'react'

export default function TutorialButton() {
  return (
    <button
      type="button"
      aria-label="Open tutorial"
      title="Open tutorial"
      onClick={() => window.dispatchEvent(new Event('open-tutorial'))}
      className="h-8 w-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-700 hover:bg-zinc-200 transition-colors"
    >
      ?
    </button>
  )
}
