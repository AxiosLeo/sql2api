import { Loader2, Wand2 } from 'lucide-react'
import type { ReviewIssue, ReviewResult } from '@/api/sqls'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

function isApplicableIssue(issue: ReviewIssue): boolean {
  return issue.severity === 'error' || issue.severity === 'warning'
}

type ReviewCardProps = {
  review: ReviewResult | null
  applying: boolean
  applyingIndex: number | 'all' | null
  onApplyOne: (issue: ReviewIssue, index: number) => void
  onApplyAll: () => void
}

export function ReviewCard({
  review,
  applying,
  applyingIndex,
  onApplyOne,
  onApplyAll,
}: ReviewCardProps) {
  const applicable = review?.issues.filter(isApplicableIssue) ?? []

  return (
    <Card>
      <CardHeader className='border-b'>
        <CardTitle>Review</CardTitle>
        <CardDescription>
          Run Review to audit SQL. Apply suggestions to rewrite with AI.
        </CardDescription>
        {applicable.length > 0 ? (
          <CardAction>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='cursor-pointer'
              disabled={applying}
              onClick={onApplyAll}
            >
              {applying && applyingIndex === 'all' ? (
                <Loader2 className='animate-spin' data-icon='inline-start' />
              ) : (
                <Wand2 data-icon='inline-start' />
              )}
              Apply All
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className='pt-6'>
        {!review ? (
          <p className='text-sm text-muted-foreground'>
            No review yet. Click Review in the toolbar when ready.
          </p>
        ) : (
          <div
            className={cn(
              'flex flex-col gap-3 rounded-md border p-3',
              review.passed
                ? 'border-teal-300 bg-teal-50/50 dark:bg-teal-950/20'
                : 'border-destructive/40 bg-destructive/5'
            )}
          >
            <div className='flex flex-wrap items-center gap-2'>
              <Badge
                variant='outline'
                className={cn(
                  review.passed
                    ? 'border-teal-300 bg-teal-100/50 text-teal-900 dark:text-teal-200'
                    : 'border-red-300 bg-red-100/50 text-red-900 dark:text-red-200'
                )}
              >
                {review.passed ? 'Review passed' : 'Review failed'}
              </Badge>
              {review.sql_type ? (
                <Badge variant='outline' className='capitalize'>
                  {review.sql_type}
                </Badge>
              ) : null}
              {review.method ? (
                <Badge variant='secondary'>{review.method}</Badge>
              ) : null}
              <span className='text-xs text-muted-foreground'>
                {review.issues.length} issue(s)
              </span>
            </div>

            {review.sql_type === 'complex' ? (
              <p className='text-sm text-muted-foreground'>
                Multi-statement or mixed operations will be registered as a
                Complex API (POST), executed in a single transaction.
              </p>
            ) : null}

            {review.issues.length > 0 ? (
              <ul className='flex flex-col gap-3'>
                {review.issues.map((issue, idx) => {
                  const canApply = isApplicableIssue(issue)
                  return (
                    <li key={idx} className='text-sm'>
                      <div className='flex items-start gap-2'>
                        <Badge variant='outline' className='mt-0.5 capitalize'>
                          {issue.severity}
                        </Badge>
                        <div className='min-w-0 flex-1'>
                          <p>{issue.message}</p>
                          {issue.suggestion ? (
                            <p className='text-muted-foreground'>
                              Suggestion: {issue.suggestion}
                            </p>
                          ) : null}
                        </div>
                        {canApply ? (
                          <Button
                            type='button'
                            variant='ghost'
                            size='sm'
                            className='h-7 shrink-0 cursor-pointer px-2 text-xs'
                            disabled={applying}
                            onClick={() => onApplyOne(issue, idx)}
                          >
                            {applying && applyingIndex === idx ? (
                              <Loader2
                                className='animate-spin'
                                data-icon='inline-start'
                              />
                            ) : (
                              <Wand2 data-icon='inline-start' />
                            )}
                            Apply
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
