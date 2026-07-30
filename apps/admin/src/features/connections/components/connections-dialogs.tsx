import { ConnectionsActionDialog } from './connections-action-dialog'
import { ConnectionsDeleteDialog } from './connections-delete-dialog'
import { useConnections } from './connections-provider'

export function ConnectionsDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useConnections()

  return (
    <>
      <ConnectionsActionDialog
        key='connection-create'
        open={open === 'create'}
        onOpenChange={() => setOpen('create')}
      />

      {currentRow && (
        <>
          <ConnectionsActionDialog
            key={`connection-edit-${currentRow.id}`}
            open={open === 'edit'}
            onOpenChange={() => {
              setOpen('edit')
              setTimeout(() => setCurrentRow(null), 500)
            }}
            currentRow={currentRow}
          />

          <ConnectionsDeleteDialog
            key={`connection-delete-${currentRow.id}`}
            open={open === 'delete'}
            onOpenChange={() => {
              setOpen('delete')
              setTimeout(() => setCurrentRow(null), 500)
            }}
            currentRow={currentRow}
          />
        </>
      )}
    </>
  )
}
