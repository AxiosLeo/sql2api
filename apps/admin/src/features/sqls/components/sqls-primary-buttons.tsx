import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SqlsPrimaryButtons() {
  return (
    <div className='flex gap-2'>
      <Button className='cursor-pointer' asChild>
        <Link to='/sqls/new'>
          <span>Add SQL API</span> <Plus size={18} />
        </Link>
      </Button>
    </div>
  )
}
