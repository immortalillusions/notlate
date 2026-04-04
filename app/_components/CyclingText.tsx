'use client'

import { useState, useEffect } from 'react'

const PHRASES = ['travel time blocks', 'detailed instructions', 'personalized reminders']

export default function CyclingText() {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex((i) => (i + 1) % PHRASES.length)
        setVisible(true)
      }, 300)
    }, 2500)
    return () => clearInterval(interval)
  }, [])

  return (
    <span className="relative inline-block text-(--gcal-blue) font-medium">
      {/* Invisible longest phrase — fixes the container width so layout never shifts */}
      <span aria-hidden className="invisible">personalized reminders</span>
      {/* Cycling text overlaid absolutely */}
      <span
        className="absolute left-0 top-0"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease' }}
      >
        {PHRASES[index]}
      </span>
    </span>
  )
}
