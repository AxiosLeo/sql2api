import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'
import { type Sql } from '../data/schema'

type SqlsDialogType = 'create' | 'edit' | 'delete'

type SqlsContextType = {
  open: SqlsDialogType | null
  setOpen: (str: SqlsDialogType | null) => void
  currentRow: Sql | null
  setCurrentRow: React.Dispatch<React.SetStateAction<Sql | null>>
}

const SqlsContext = React.createContext<SqlsContextType | null>(null)

export function SqlsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useDialogState<SqlsDialogType>(null)
  const [currentRow, setCurrentRow] = useState<Sql | null>(null)

  return (
    <SqlsContext value={{ open, setOpen, currentRow, setCurrentRow }}>
      {children}
    </SqlsContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSqls = () => {
  const ctx = React.useContext(SqlsContext)
  if (!ctx) {
    throw new Error('useSqls has to be used within <SqlsProvider>')
  }
  return ctx
}
