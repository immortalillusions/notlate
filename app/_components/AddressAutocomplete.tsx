'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface Prediction {
  place_id: string
  description: string
}

interface Props {
  name: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  required?: boolean
}

export default function AddressAutocomplete({
  name,
  value,
  onChange,
  placeholder,
  className,
  required,
}: Props) {
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [dropdownRect, setDropdownRect] = useState({ top: 0, left: 0, width: 0 })

  const inputRef = useRef<HTMLInputElement>(null)
  // Session token persists across keystrokes so all autocomplete calls in one
  // typing session are billed as a single session.  Reset to null after a place
  // is selected so the next search starts a fresh session.
  const sessionTokenRef = useRef<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Snapshot of value when the user focuses the input — used to revert if
  // they exit without selecting a prediction.
  const valueOnFocusRef = useRef(value)

  function getToken(): string {
    if (!sessionTokenRef.current) sessionTokenRef.current = crypto.randomUUID()
    return sessionTokenRef.current
  }

  const fetchPredictions = useCallback(async (input: string) => {
    if (input.length < 2) {
      setPredictions([])
      setOpen(false)
      return
    }
    try {
      const params = new URLSearchParams({ input, sessiontoken: getToken() })
      const res = await fetch(`/api/places/autocomplete?${params}`)
      const data = await res.json()
      const preds: Prediction[] = data.predictions ?? []
      setPredictions(preds)
      setOpen(preds.length > 0)
      setActiveIdx(-1)
    } catch {
      setPredictions([])
      setOpen(false)
    }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchPredictions(e.target.value), 200)
  }

  async function handleSelect(prediction: Prediction) {
    try {
      // Use the SAME session token for details — this closes the billing session.
      const params = new URLSearchParams({
        place_id: prediction.place_id,
        sessiontoken: getToken(),
      })
      const res = await fetch(`/api/places/details?${params}`)
      const data = await res.json()
      onChange(data.address ?? prediction.description)
    } catch {
      onChange(prediction.description)
    }
    // Reset token so the next typing session starts a new billing session.
    sessionTokenRef.current = null
    setPredictions([])
    setOpen(false)
    setActiveIdx(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      onChange(valueOnFocusRef.current)
      setOpen(false)
      setPredictions([])
      return
    }
    if (!open || predictions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, predictions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      handleSelect(predictions[activeIdx])
    }
  }

  // Recalculate dropdown position every time it opens or predictions change.
  // Uses getBoundingClientRect() which returns viewport coords, matching position:fixed.
  useEffect(() => {
    if (!open || !inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    setDropdownRect({ top: r.bottom, left: r.left, width: r.width })
  }, [open, predictions])

  // Close on outside click — revert if user didn't select a prediction
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        if (open) onChange(valueOnFocusRef.current)
        setOpen(false)
        setPredictions([])
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open, onChange])

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        name={name}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          valueOnFocusRef.current = value
          if (predictions.length > 0) setOpen(true)
        }}
        placeholder={placeholder}
        className={className}
        required={required}
        autoComplete="off"
      />

      {open &&
        typeof window !== 'undefined' &&
        createPortal(
          <ul
            style={{
              position: 'fixed',
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              zIndex: 9999,
            }}
            className="bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 rounded-xl shadow-lg py-1 max-h-60 overflow-y-auto"
          >
            {predictions.map((p, i) => (
              <li
                key={p.place_id}
                onMouseDown={(e) => {
                  e.preventDefault() // prevent input blur before click registers
                  handleSelect(p)
                }}
                className={`px-3 py-2 text-sm cursor-pointer text-zinc-900 dark:text-zinc-100 ${
                  i === activeIdx ? 'bg-slate-100 dark:bg-zinc-700' : 'hover:bg-slate-50 dark:hover:bg-zinc-700'
                }`}
              >
                {p.description}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </>
  )
}
