"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import type { z } from "zod"

import { createGroupChat } from "@/actions/chat"
import { insertGroupChatSchema, type Bot } from "@/db/schema"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

type GroupChatFormValues = z.input<typeof insertGroupChatSchema>

function freshValues(): GroupChatFormValues {
  return { name: "", botIds: [] }
}

type GroupChatDialogProps = {
  // The bots the user can add.
  bots: Pick<Bot, "id" | "name" | "avatar">[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GroupChatDialog({
  bots,
  open,
  onOpenChange,
}: GroupChatDialogProps) {
  const router = useRouter()
  const form = useForm<GroupChatFormValues>({
    resolver: zodResolver(insertGroupChatSchema),
    defaultValues: freshValues(),
  })

  // Start every open with a clean form.
  React.useEffect(() => {
    if (open) form.reset(freshValues())
  }, [open, form])

  async function onSubmit(values: GroupChatFormValues) {
    const result = await createGroupChat(values)

    if (!result.ok) {
      form.setError("root", { message: result.error })
      return
    }

    toast.add({
      title: `${result.chat.name} is ready`,
      description: "Your group chat has been created.",
    })
    onOpenChange(false)
    router.push(`/chats/${result.chat.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <DialogHeader>
            <DialogTitle>New group chat</DialogTitle>
            <DialogDescription>
              Name the group and pick which bots are in it.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="group-chat-name">Name</FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id="group-chat-name"
                    placeholder="Weekend plans"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="botIds"
              control={form.control}
              render={({ field, fieldState }) => (
                <FieldSet data-invalid={fieldState.invalid}>
                  <FieldLegend variant="label">Bots</FieldLegend>
                  <FieldGroup data-slot="checkbox-group" className="gap-3">
                    {bots.map((bot) => (
                      <Field
                        key={bot.id}
                        orientation="horizontal"
                        data-invalid={fieldState.invalid}
                      >
                        <Checkbox
                          id={`group-chat-bot-${bot.id}`}
                          checked={field.value.includes(bot.id)}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked
                                ? [...field.value, bot.id]
                                : field.value.filter((id) => id !== bot.id)
                            )
                          }
                          aria-invalid={fieldState.invalid}
                        />
                        <FieldLabel
                          htmlFor={`group-chat-bot-${bot.id}`}
                          className="font-normal"
                        >
                          <ChatAvatar seed={bot.avatar} className="size-5" />
                          {bot.name}
                        </FieldLabel>
                      </Field>
                    ))}
                  </FieldGroup>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </FieldSet>
              )}
            />

            {form.formState.errors.root && (
              <FieldError errors={[form.formState.errors.root]} />
            )}
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && (
                <Spinner data-icon="inline-start" />
              )}
              Create group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
