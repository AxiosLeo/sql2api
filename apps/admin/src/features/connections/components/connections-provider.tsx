import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'
import { type Connection } from '../data/schema'

type ConnectionsDialogType = 'create' | 'edit' | 'delete'

type ConnectionsContextType = {
  open: ConnectionsDialogType | null
  setOpen: (str: ConnectionsDialogType | null) => void
  currentRow: Connection | null
  setCurrentRow: React.Dispatch<React.SetStateAction<Connection | null>>
}

const ConnectionsContext = React.createContext<ConnectionsContextType | null>(
  null
)

export function ConnectionsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = useDialogState<ConnectionsDialogType>(null)
  const [currentRow, setCurrentRow] = useState<Connection | null>(null)

  return (
    <ConnectionsContext
      value={{ open, setOpen, currentRow, setCurrentRow }}
    >
      {children}
    </ConnectionsContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useConnections = () => {
  const ctx = React.useContext(ConnectionsContext)
  if (!ctx) {
    throw new Error(
      'useConnections has to be used within <ConnectionsProvider>'
    )
  }
  return ctx
}
