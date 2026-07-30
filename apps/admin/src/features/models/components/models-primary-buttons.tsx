import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useModels } from './models-provider'

export function ModelsPrimaryButtons() {
  const { setOpen } = useModels()
  return (
    <div className='flex gap-2'>
      <Button className='space-x-1' onClick={() => setOpen('generate')}>
        <span>Generate Models</span> <Plus size={18} />
      </Button>
    </div>
  )
}
