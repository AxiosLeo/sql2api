import { forwardRef } from 'react'
import { Settings2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ruleToBadges } from './parse-serialize'

type RuleSummaryProps = {
  value: string
  onConfigure: () => void
  className?: string
}

export const RuleSummary = forwardRef<HTMLDivElement, RuleSummaryProps>(
  function RuleSummary({ value, onConfigure, className }, ref) {
    const badges = ruleToBadges(value)

    return (
      <div
        ref={ref}
        className={cn('flex min-h-9 items-center gap-1.5', className)}
      >
        <button
          type='button'
          onClick={onConfigure}
          className='hover:bg-muted/50 flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-1 rounded-md border px-2 py-1.5 text-start transition-colors'
        >
          {badges.length === 0 ? (
            <span className='text-muted-foreground text-xs'>No rules</span>
          ) : (
            badges.map((part, i) => (
              <Badge
                key={`${part}-${i}`}
                variant='secondary'
                className='max-w-full truncate font-mono text-[10px]'
              >
                {part}
              </Badge>
            ))
          )}
        </button>
        <Button
          type='button'
          variant='outline'
          size='icon'
          className='size-9 shrink-0 cursor-pointer'
          onClick={onConfigure}
          aria-label='Configure rule'
        >
          <Settings2 className='size-4' />
        </Button>
      </div>
    )
  }
)
