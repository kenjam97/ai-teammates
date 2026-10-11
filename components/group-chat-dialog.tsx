"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import type { z } from "zod"

import { createGroupChat, updateGroupChat } from "@/actions/chat"
import { insertGroupChatSchema, type Bot } from "@/db/schema"
import { ChatAvatar } from "@/components/chat-avatar"
import { DeleteGroupChatDialog } from "@/components/delete-group-chat-dialog"
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
  DialogTrigger,
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
import { useBillingGate, useBillingToast } from "@/components/billing-gate"
import { isBillingError } from "@/lib/billing"

type GroupChatFormValues = z.input<typeof insertGroupChatSchema>

type EditableGroupChat = { id: string; name: string; botIds: string[] }

function freshValues(chat?: EditableGroupChat): GroupChatFormValues {
  if (chat) return { name: chat.name, botIds: chat.botIds }
  return { name: "", botIds: [] }
}

type GroupChatDialogProps = {
  // The bots the user can add.
  bots: Pick<Bot, "id" | "name" | "avatar">[]
  // Element that opens the dialog, e.g. a <Button />. Omit it to control
  // the dialog from outside with `open` and `onOpenChange`, e.g. from a menu.
  trigger?: React.ReactElement
  // Pass a group chat to edit it instead of creating a new one.
  chat?: EditableGroupChat
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function GroupChatDialog({
  bots,
  trigger,
  chat,
  open: openProp,
  onOpenChange,
}: GroupChatDialogProps) {
  const router = useRouter()
  const showBillingToast = useBillingToast()
  const checkBilling = useBillingGate()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = openProp ?? uncontrolledOpen
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  // Set when the edit dialog reopens after a cancelled delete, so the user's
  // unsaved edits survive the round trip.
  const keepValuesRef = React.useRef(false)

  const form = useForm<GroupChatFormValues>({
    resolver: zodResolver(insertGroupChatSchema),
    defaultValues: freshValues(chat),
  })

  // Read the latest chat without re-running the effect when it changes, so a
  // refresh while the dialog is open never wipes the user's edits.
  const resetForm = React.useEffectEvent(() => {
    if (keepValuesRef.current) {
      keepValuesRef.current = false
      return
    }
    form.reset(freshValues(chat))
  })

  // Start every open with a clean form: empty for a new group, the saved
  // values for an existing one.
  React.useEffect(() => {
    if (open) resetForm()
  }, [open])

  function setOpen(nextOpen: boolean) {
    setUncontrolledOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  // Stop a user who can't make a group before they fill one in. Editing
  // still opens, because the edit dialog is also where a group is deleted.
  async function onDialogOpenChange(nextOpen: boolean) {
    if (nextOpen && !chat && !(await checkBilling("groupChat"))) return
    setOpen(nextOpen)
  }

  // Swap the edit dialog for the delete confirmation, and swap back if the
  // user cancels.
  function confirmDelete() {
    setOpen(false)
    setDeleteOpen(true)
  }

  function onDeleteOpenChange(nextOpen: boolean) {
    setDeleteOpen(nextOpen)
    if (!nextOpen) {
      keepValuesRef.current = true
      setOpen(true)
    }
  }

  async function onSubmit(values: GroupChatFormValues) {
    const result = chat
      ? await updateGroupChat(chat.id, values)
      : await createGroupChat(values)

    if (!result.ok) {
      if (isBillingError(result)) showBillingToast(result)
      else form.setError("root", { message: result.error })
      return
    }

    toast.add(
      chat
        ? {
            title: `${result.chat.name} is updated`,
            description: "Your changes have been saved.",
          }
        : {
            title: `${result.chat.name} is ready`,
            description: "Your group chat has been created.",
          }
    )
    setOpen(false)
    if (!chat) router.push(`/chats/${result.chat.id}`)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onDialogOpenChange}>
        {trigger && <DialogTrigger render={trigger} />}
        <DialogContent className="sm:max-w-md">
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <DialogHeader>
              <DialogTitle>
                {chat ? "Edit group chat" : "New group chat"}
              </DialogTitle>
              <DialogDescription>
                {chat
                  ? "Rename the group, or add and remove bots."
                  : "Name the group and pick which bots are in it."}
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
              {chat && (
                <Button
                  type="button"
                  variant="destructive"
                  className="sm:mr-auto"
                  onClick={confirmDelete}
                >
                  <Trash2Icon data-icon="inline-start" />
                  Delete
                </Button>
              )}
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && (
                  <Spinner data-icon="inline-start" />
                )}
                {chat ? "Save changes" : "Create group"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {chat && (
        <DeleteGroupChatDialog
          chat={chat}
          open={deleteOpen}
          onOpenChange={onDeleteOpenChange}
        />
      )}
    </>
  )
}
