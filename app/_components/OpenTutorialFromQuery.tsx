"use client"

import { useEffect } from 'react'

export default function OpenTutorialFromQuery() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('tutorial') === '1') {
        window.dispatchEvent(new Event('open-tutorial'))
        // remove the query param so refresh doesn't re-open the tutorial
        params.delete('tutorial')
        const newSearch = params.toString()
        const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash
        window.history.replaceState({}, '', newUrl)
      }
    } catch {
      // ignore
    }
  }, [])

  return null
}
