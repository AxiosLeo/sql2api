import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMetaTables } from './meta-tables-provider'

export function MetaTablesPrimaryButtons() {
  const { setOpen } = useMetaTables()
  return (
    <div className='flex gap-2'>
      <Button className='space-x-1' onClick={() => setOpen('create')}>
        <span>Add Table</span> <Plus size={18} />
      </Button>
    </div>
  )
}
