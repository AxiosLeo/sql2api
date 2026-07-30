import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'
import { type App } from '../data/schema'

type AppsDialogType = 'create' | 'edit' | 'delete' | 'keys'

type AppsContextType = {
  open: AppsDialogType | null
  setOpen: (str: AppsDialogType | null) => void
  currentRow: App | null
  setCurrentRow: React.Dispatch<React.SetStateAction<App | null>>
}

const AppsContext = React.createContext<AppsContextType | null>(null)

export function AppsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useDialogState<AppsDialogType>(null)
  const [currentRow, setCurrentRow] = useState<App | null>(null)

  return (
    <AppsContext value={{ open, setOpen, currentRow, setCurrentRow }}>
      {children}
    </AppsContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useApps = () => {
  const ctx = React.useContext(AppsContext)
  if (!ctx) {
    throw new Error('useApps has to be used within <AppsProvider>')
  }
  return ctx
}
