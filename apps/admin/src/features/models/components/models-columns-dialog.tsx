import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { type Model } from '../data/schema'

type ModelsColumnsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: Model
}

export function ModelsColumnsDialog({
  open,
  onOpenChange,
  currentRow,
}: ModelsColumnsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-4xl'>
        <DialogHeader className='text-start'>
          <DialogTitle>Columns — {currentRow.table_name}</DialogTitle>
          <DialogDescription>
            {currentRow.comment || 'Column definitions for this table model.'}
          </DialogDescription>
        </DialogHeader>
        <div className='max-h-[60vh] overflow-auto rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Nullable</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>Comment</TableHead>
                <TableHead>Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentRow.columns.length ? (
                currentRow.columns.map((col) => (
                  <TableRow key={col.name}>
                    <TableCell className='font-medium'>{col.name}</TableCell>
                    <TableCell className='text-nowrap text-sm'>
                      {col.type}
                    </TableCell>
                    <TableCell>{col.nullable ? 'Yes' : 'No'}</TableCell>
                    <TableCell className='text-muted-foreground'>
                      {col.default ?? '—'}
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {col.comment || '—'}
                    </TableCell>
                    <TableCell>
                      <div className='flex flex-wrap gap-1'>
                        {col.is_primary && (
                          <Badge variant='outline'>PK</Badge>
                        )}
                        {col.is_auto_increment && (
                          <Badge variant='outline'>AI</Badge>
                        )}
                        {!col.is_primary && !col.is_auto_increment && (
                          <span className='text-muted-foreground'>—</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className='h-24 text-center'>
                    No columns.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
