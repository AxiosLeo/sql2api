import { useEffect } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { toast } from 'sonner'
import { createApp, updateApp } from '@/api/apps'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SelectDropdown } from '@/components/select-dropdown'
import { type App } from '../data/schema'

const formSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required.')
    .max(64, 'Name must be at most 64 characters.'),
  description: z.string().optional(),
  status: z.enum(['active', 'disabled']),
})

type AppForm = z.infer<typeof formSchema>

type AppsActionDialogProps = {
  currentRow?: App
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AppsActionDialog({
  currentRow,
  open,
  onOpenChange,
}: AppsActionDialogProps) {
  const isEdit = !!currentRow
  const queryClient = useQueryClient()

  const form = useForm<AppForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      status: 'active',
    },
  })

  useEffect(() => {
    if (!open) return
    if (currentRow) {
      form.reset({
        name: currentRow.name,
        description: currentRow.description || '',
        status: currentRow.status,
      })
    } else {
      form.reset({
        name: '',
        description: '',
        status: 'active',
      })
    }
  }, [open, currentRow, form])

  const mutation = useMutation({
    mutationFn: async (values: AppForm) => {
      if (isEdit && currentRow) {
        return updateApp(currentRow.id, {
          name: values.name,
          description: values.description || '',
          status: values.status,
        })
      }
      return createApp({
        name: values.name,
        description: values.description || '',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] })
      toast.success(isEdit ? 'Application updated.' : 'Application created.')
      onOpenChange(false)
    },
    onError: (err) => {
      if (err instanceof AxiosError && err.response?.status === 409) {
        toast.error('An application with this name already exists.')
        return
      }
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Request failed.'
      toast.error(message)
    },
  })

  const onSubmit = (values: AppForm) => {
    mutation.mutate(values)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        if (!state) form.reset()
        onOpenChange(state)
      }}
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader className='text-start'>
          <DialogTitle>
            {isEdit ? 'Edit Application' : 'Add Application'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update application details. Click save when you are done.'
              : 'Create a new application. Click save when you are done.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id='app-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className='space-y-4'
          >
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder='my-app' autoComplete='off' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Optional description'
                      className='min-h-20'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isEdit && (
              <FormField
                control={form.control}
                name='status'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <SelectDropdown
                      isControlled
                      defaultValue={field.value}
                      onValueChange={field.onChange}
                      placeholder='Select status'
                      items={[
                        { label: 'Active', value: 'active' },
                        { label: 'Disabled', value: 'disabled' },
                      ]}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </form>
        </Form>
        <DialogFooter>
          <Button
            type='submit'
            form='app-form'
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
