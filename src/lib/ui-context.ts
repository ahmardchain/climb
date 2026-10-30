import { createContext, useContext } from 'react'

export interface UiActions {
  openCreate: () => void
  openClaim: () => void
  openHow: () => void
  openMenu: () => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
}

export const UiContext = createContext<UiActions | null>(null)

export function useUi(): UiActions {
  const ctx = useContext(UiContext)
  if (!ctx) throw new Error('useUi must be used inside UiContext')
  return ctx
}
