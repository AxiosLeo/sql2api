import { AppsActionDialog } from './apps-action-dialog'
import { AppsDeleteDialog } from './apps-delete-dialog'
import { AppsKeysDialog } from './apps-keys-dialog'
import { useApps } from './apps-provider'

export function AppsDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useApps()

  return (
    <>
      <AppsActionDialog
        key='app-create'
        open={open === 'create'}
        onOpenChange={() => setOpen('create')}
      />

      {currentRow && (
        <>
          <AppsActionDialog
            key={`app-edit-${currentRow.id}`}
            open={open === 'edit'}
            onOpenChange={() => {
              setOpen('edit')
              setTimeout(() => setCurrentRow(null), 500)
            }}
            currentRow={currentRow}
          />

          <AppsDeleteDialog
            key={`app-delete-${currentRow.id}`}
            open={open === 'delete'}
            onOpenChange={() => {
              setOpen('delete')
              setTimeout(() => setCurrentRow(null), 500)
            }}
            currentRow={currentRow}
          />

          <AppsKeysDialog
            key={`app-keys-${currentRow.id}`}
            open={open === 'keys'}
            onOpenChange={() => {
              setOpen('keys')
              setTimeout(() => setCurrentRow(null), 500)
            }}
            currentRow={currentRow}
          />
        </>
      )}
    </>
  )
}
