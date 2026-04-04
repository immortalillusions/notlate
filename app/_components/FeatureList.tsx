'use client'

import { motion } from 'framer-motion'

const features = [
  'Reads your calendar events with a location',
  'Creates "Leave by" blocks automatically',
  'Auto-updates when events change',
  'Includes weather at your destination',
  'AI sets the perfect reminder time',
]

export default function FeatureList() {
  return (
    <div className="space-y-1">
      {features.map((text, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.12, duration: 0.3 }}
          className="flex items-start gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
        >
          <motion.svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            className="mt-0.5 shrink-0 text-(--gcal-blue)"
          >
            <motion.path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: i * 0.12 + 0.1, duration: 0.35 }}
            />
          </motion.svg>
          <span className="text-sm text-zinc-600 dark:text-zinc-200">{text}</span>
        </motion.div>
      ))}
    </div>
  )
}
