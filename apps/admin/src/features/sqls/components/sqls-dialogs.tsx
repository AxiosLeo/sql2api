import { SqlsActionDialog } from './sqls-action-dialog'
import { SqlsDeleteDialog } from './sqls-delete-dialog'
import { useSqls } from './sqls-provider'

export function SqlsDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useSqls()

  return (
    <>
      <SqlsActionDialog
        key='sql-create'
        open={open === 'create'}
        onOpenChange={() => setOpen('create')}
      />

      {currentRow && (
        <>
          <SqlsActionDialog
            key={`sql-edit-${currentRow.id}`}
            open={open === 'edit'}
            onOpenChange={() => {
              setOpen('edit')
              setTimeout(() => setCurrentRow(null), 500)
            }}
            currentRow={currentRow}
          />

          <SqlsDeleteDialog
            key={`sql-delete-${currentRow.id}`}
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
