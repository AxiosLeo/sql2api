import { SqlsDeleteDialog } from './sqls-delete-dialog'
import { useSqls } from './sqls-provider'

export function SqlsDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useSqls()

  return (
    <>
      {currentRow && (
        <SqlsDeleteDialog
          key={`sql-delete-${currentRow.id}`}
          open={open === 'delete'}
          onOpenChange={() => {
            setOpen('delete')
            setTimeout(() => setCurrentRow(null), 500)
          }}
          currentRow={currentRow}
        />
      )}
    </>
  )
}
