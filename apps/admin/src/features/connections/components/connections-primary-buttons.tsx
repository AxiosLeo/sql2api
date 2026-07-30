import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConnections } from './connections-provider'

export function ConnectionsPrimaryButtons() {
  const { setOpen } = useConnections()
  return (
    <div className='flex gap-2'>
      <Button className='space-x-1' onClick={() => setOpen('create')}>
        <span>Add Connection</span> <Plus size={18} />
      </Button>
    </div>
  )
}
