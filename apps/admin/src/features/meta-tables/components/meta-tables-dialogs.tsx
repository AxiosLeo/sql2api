import { MetaTablesActionDialog } from './meta-tables-action-dialog'
import { MetaTablesDeleteDialog } from './meta-tables-delete-dialog'
import { useMetaTables } from './meta-tables-provider'

export function MetaTablesDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useMetaTables()

  return (
    <>
      <MetaTablesActionDialog
        key='meta-table-create'
        open={open === 'create'}
        onOpenChange={() => setOpen('create')}
      />

      {currentRow && (
        <>
          <MetaTablesActionDialog
            key={`meta-table-edit-${currentRow.id}`}
            currentRow={currentRow}
            open={open === 'edit'}
            onOpenChange={() => {
              setOpen('edit')
              setTimeout(() => setCurrentRow(null), 500)
            }}
          />

          <MetaTablesDeleteDialog
            key={`meta-table-delete-${currentRow.id}`}
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
