import { ModelsColumnsDialog } from './models-columns-dialog'
import { ModelsDeleteDialog } from './models-delete-dialog'
import { ModelsGenerateDialog } from './models-generate-dialog'
import { useModels } from './models-provider'

export function ModelsDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useModels()

  return (
    <>
      <ModelsGenerateDialog
        key='model-generate'
        open={open === 'generate'}
        onOpenChange={() => setOpen('generate')}
      />

      {currentRow && (
        <>
          <ModelsColumnsDialog
            key={`model-columns-${currentRow.id}`}
            open={open === 'columns'}
            onOpenChange={() => {
              setOpen('columns')
              setTimeout(() => setCurrentRow(null), 500)
            }}
            currentRow={currentRow}
          />

          <ModelsDeleteDialog
            key={`model-delete-${currentRow.id}`}
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
