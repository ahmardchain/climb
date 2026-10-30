import { useEffect, useState } from 'react'

const EVENT = 'climb:navigate'

export function navigate(to: string) {
  if (to === window.location.pathname + window.location.search) return
  window.history.pushState({}, '', to)
  window.dispatchEvent(new Event(EVENT))
  window.scrollTo({ top: 0 })
}

export interface Route {
  path: string
  search: URLSearchParams
}

export function useRoute(): Route {
  const read = () => `${window.location.pathname}${window.location.search}`
  const [key, setKey] = useState(read)
  useEffect(() => {
    const update = () => setKey(read())
    window.addEventListener('popstate', update)
    window.addEventListener(EVENT, update)
    return () => {
      window.removeEventListener('popstate', update)
      window.removeEventListener(EVENT, update)
    }
  }, [])
  const q = key.indexOf('?')
  return { path: q === -1 ? key : key.slice(0, q), search: new URLSearchParams(q === -1 ? '' : key.slice(q)) }
}

/** Click handler for in-app anchors: keeps modified clicks (new tab) native. */
export function link(to: string) {
  return {
    href: to,
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      navigate(to)
    },
  }
}
