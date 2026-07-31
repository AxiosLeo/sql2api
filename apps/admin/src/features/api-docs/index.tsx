import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { listApps } from '@/api/apps'
import { getOpenApiSpec, type OpenApiSpec } from '@/api/docs'
import { copyToClipboard } from '@/lib/clipboard'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  buildCurl,
  groupByTag,
  parseOperations,
  schemaTypeLabel,
  type OpenApiObject,
  type ParsedOperation,
} from './lib/openapi'

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  POST: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  PUT: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  PATCH: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  DELETE: 'bg-red-500/15 text-red-700 dark:text-red-400',
}

function MethodBadge({ method }: { method: string }) {
  return (
    <Badge
      variant='outline'
      className={cn(
        'font-mono text-[10px] tracking-wide uppercase',
        METHOD_COLORS[method] || ''
      )}
    >
      {method}
    </Badge>
  )
}

async function copyText(text: string, successMsg: string) {
  try {
    await copyToClipboard(text)
    toast.success(successMsg)
  } catch {
    toast.error('Failed to copy.')
  }
}

function downloadSpec(spec: OpenApiSpec) {
  const blob = new Blob([JSON.stringify(spec, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'sql2api.openapi.json'
  a.click()
  URL.revokeObjectURL(url)
  toast.success('OpenAPI JSON downloaded.')
}

function OperationCard({
  op,
  serverUrl,
}: {
  op: ParsedOperation
  serverUrl: string
}) {
  const [open, setOpen] = useState(false)
  const curl = useMemo(() => buildCurl(op, serverUrl), [op, serverUrl])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className='rounded-lg border'>
        <CollapsibleTrigger asChild>
          <button
            type='button'
            className='hover:bg-muted/50 flex w-full items-center gap-3 px-3 py-2.5 text-start'
          >
            <MethodBadge method={op.method} />
            <code className='truncate text-sm font-medium'>{op.path}</code>
            <span className='text-muted-foreground hidden flex-1 truncate text-sm sm:inline'>
              {op.summary}
            </span>
            <ChevronDown
              className={cn(
                'text-muted-foreground size-4 shrink-0 transition-transform',
                open && 'rotate-180'
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className='space-y-4 border-t px-3 py-3'>
            {op.description && (
              <p className='text-muted-foreground text-sm whitespace-pre-wrap'>
                {op.description}
              </p>
            )}

            {op.parameters.length > 0 && (
              <div>
                <h4 className='mb-2 text-sm font-medium'>Parameters</h4>
                <div className='rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>In</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Required</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {op.parameters.map((p) => (
                        <TableRow key={`${p.in}-${p.name}`}>
                          <TableCell className='font-mono text-xs'>
                            {p.name}
                          </TableCell>
                          <TableCell>{p.in}</TableCell>
                          <TableCell className='font-mono text-xs'>
                            {schemaTypeLabel(p.schema)}
                          </TableCell>
                          <TableCell>{p.required ? 'yes' : 'no'}</TableCell>
                          <TableCell className='text-muted-foreground max-w-xs text-xs'>
                            {p.description || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {op.requestBodyExample && (
              <div>
                <div className='mb-2 flex items-center justify-between'>
                  <h4 className='text-sm font-medium'>Request body example</h4>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() =>
                      copyText(op.requestBodyExample!, 'Example copied.')
                    }
                  >
                    <Copy className='size-3.5' />
                    Copy
                  </Button>
                </div>
                <pre className='bg-muted overflow-x-auto rounded-md p-3 text-xs'>
                  {op.requestBodyExample}
                </pre>
              </div>
            )}

            {op.responses.length > 0 && (
              <div>
                <h4 className='mb-2 text-sm font-medium'>Responses</h4>
                <ul className='space-y-1 text-sm'>
                  {op.responses.map((r) => (
                    <li key={r.status} className='flex gap-2'>
                      <Badge variant='secondary' className='font-mono'>
                        {r.status}
                      </Badge>
                      <span className='text-muted-foreground'>
                        {r.description || '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className='mb-2 flex items-center justify-between'>
                <h4 className='text-sm font-medium'>cURL</h4>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => copyText(curl, 'cURL copied.')}
                >
                  <Copy className='size-3.5' />
                  Copy
                </Button>
              </div>
              <pre className='bg-muted overflow-x-auto rounded-md p-3 text-xs'>
                {curl}
              </pre>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

export function ApiDocs() {
  const [appId, setAppId] = useState<string>('all')

  const appsQuery = useQuery({
    queryKey: ['apps', 'api-docs'],
    queryFn: () => listApps({ page: 1, size: 100 }),
  })

  const specQuery = useQuery({
    queryKey: ['openapi-spec', appId],
    queryFn: () =>
      getOpenApiSpec(appId === 'all' ? undefined : { app_id: appId }),
  })

  const serverUrl = useMemo(() => {
    const base = import.meta.env.VITE_API_BASE_URL as string | undefined
    if (base) return base.replace(/\/$/, '')
    if (typeof window !== 'undefined') return window.location.origin
    return 'http://127.0.0.1:13334'
  }, [])

  const directLink = `${serverUrl}/openapi.json?api_key=<YOUR_API_KEY>`

  const grouped = useMemo(() => {
    if (!specQuery.data) return new Map<string, ParsedOperation[]>()
    return groupByTag(parseOperations(specQuery.data as OpenApiObject))
  }, [specQuery.data])

  const tagNames = useMemo(() => Array.from(grouped.keys()).sort(), [grouped])

  return (
    <>
      <Header fixed>
        <Search />
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>API Docs</h2>
            <p className='text-muted-foreground'>
              Browse OpenAPI endpoints and export the full JSON for ApiFox /
              other tools.
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Select value={appId} onValueChange={setAppId}>
              <SelectTrigger className='w-[200px]'>
                <SelectValue placeholder='Filter by app' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All apps</SelectItem>
                {(appsQuery.data?.list || []).map((app) => (
                  <SelectItem key={app.id} value={app.id}>
                    {app.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant='outline'
              disabled={!specQuery.data}
              onClick={() => specQuery.data && downloadSpec(specQuery.data)}
            >
              <Download className='size-4' />
              Download JSON
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Direct link for ApiFox</CardTitle>
            <CardDescription>
              Point ApiFox timed import at this URL. Auth via{' '}
              <code className='text-xs'>?api_key=</code> or{' '}
              <code className='text-xs'>Authorization: Bearer</code>. Dynamic
              SQL endpoints are scoped to the Api-Key&apos;s app.
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-2 sm:flex-row sm:items-center'>
            <Input readOnly value={directLink} className='font-mono text-xs' />
            <div className='flex shrink-0 gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => copyText(directLink, 'Direct link copied.')}
              >
                <Copy className='size-3.5' />
                Copy
              </Button>
              <Button variant='ghost' size='sm' asChild>
                <a
                  href='/openapi.json'
                  target='_blank'
                  rel='noreferrer'
                  title='Requires Api-Key in the browser or query string'
                >
                  <ExternalLink className='size-3.5' />
                  Open
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {specQuery.isLoading && (
          <div className='text-muted-foreground flex items-center gap-2 text-sm'>
            <Loader2 className='size-4 animate-spin' />
            Loading OpenAPI document…
          </div>
        )}

        {specQuery.isError && (
          <p className='text-destructive text-sm'>
            Failed to load OpenAPI document.
          </p>
        )}

        {specQuery.data && (
          <div className='space-y-4'>
            {tagNames.map((tag) => (
              <div key={tag} className='space-y-2'>
                <h3 className='text-sm font-semibold tracking-tight'>{tag}</h3>
                <div className='space-y-2'>
                  {(grouped.get(tag) || []).map((op) => (
                    <OperationCard
                      key={`${op.method}:${op.path}:${op.operationId}:${tag}`}
                      op={op}
                      serverUrl={serverUrl}
                    />
                  ))}
                </div>
              </div>
            ))}
            {tagNames.length === 0 && (
              <p className='text-muted-foreground text-sm'>
                No endpoints in this document.
              </p>
            )}
          </div>
        )}
      </Main>
    </>
  )
}
