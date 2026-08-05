import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'
import { type MetaTable } from '../data/schema'

type MetaTablesDialogType = 'create' | 'edit' | 'delete'

type MetaTablesContextType = {
  open: MetaTablesDialogType | null
  setOpen: (str: MetaTablesDialogType | null) => void
  currentRow: MetaTable | null
  setCurrentRow: React.Dispatch<React.SetStateAction<MetaTable | null>>
}

const MetaTablesContext = React.createContext<MetaTablesContextType | null>(
  null
)

export function MetaTablesProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = useDialogState<MetaTablesDialogType>(null)
  const [currentRow, setCurrentRow] = useState<MetaTable | null>(null)

  return (
    <MetaTablesContext value={{ open, setOpen, currentRow, setCurrentRow }}>
      {children}
    </MetaTablesContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useMetaTables = () => {
  const ctx = React.useContext(MetaTablesContext)
  if (!ctx) {
    throw new Error('useMetaTables has to be used within <MetaTablesProvider>')
  }
  return ctx
}
