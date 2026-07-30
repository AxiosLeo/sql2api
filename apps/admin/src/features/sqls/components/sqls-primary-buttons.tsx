import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSqls } from './sqls-provider'

export function SqlsPrimaryButtons() {
  const { setOpen } = useSqls()
  return (
    <div className='flex gap-2'>
      <Button className='space-x-1' onClick={() => setOpen('create')}>
        <span>Add SQL API</span> <Plus size={18} />
      </Button>
    </div>
  )
}
