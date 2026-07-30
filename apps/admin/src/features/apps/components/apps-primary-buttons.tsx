import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApps } from './apps-provider'

export function AppsPrimaryButtons() {
  const { setOpen } = useApps()
  return (
    <div className='flex gap-2'>
      <Button className='space-x-1' onClick={() => setOpen('create')}>
        <span>Add Application</span> <Plus size={18} />
      </Button>
    </div>
  )
}
