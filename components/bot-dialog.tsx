"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { ShuffleIcon, Trash2Icon } from "lucide-react"
import { nanoid } from "nanoid"
import { Controller, useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { createBot, updateBot } from "@/actions/bot"
import { insertBotSchema, type Bot } from "@/db/schema"
import { ChatAvatar } from "@/components/chat-avatar"
import { DeleteBotDialog } from "@/components/delete-bot-dialog"
import { Button } from "@/components/ui/button"
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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { useBillingGate, useBillingToast } from "@/components/billing-gate"
import { isBillingError } from "@/lib/billing"

type BotFormValues = z.input<typeof insertBotSchema>

const templates = [
  {
    job: "Research assistant",
    instructions:
      "Answer briefly, cite sources, and ask before running anything destructive.",
  },
  {
    job: "Code reviewer",
    instructions:
      "Point out bugs first, then readability. Suggest concrete fixes and explain why.",
  },
  {
    job: "Writing editor",
    instructions:
      "Tighten prose without changing my voice. Flag unclear sentences instead of rewriting them.",
  },
  {
    job: "Tutor",
    instructions:
      "Teach step by step. Ask a question to check understanding before moving on.",
  },
]

type EditableBot = Pick<Bot, "id" | "name" | "avatar" | "job" | "instructions">

function freshValues(bot?: EditableBot): BotFormValues {
  if (bot) {
    return {
      name: bot.name,
      avatar: bot.avatar,
      job: bot.job,
      instructions: bot.instructions ?? "",
    }
  }
  return { name: "", avatar: nanoid(), job: "", instructions: "" }
}

type BotDialogProps = {
  // Element that opens the dialog, e.g. a <Button />. Omit it to control
  // the dialog from outside with `open` and `onOpenChange`, e.g. from a menu.
  trigger?: React.ReactElement
  // Pass a bot to edit it instead of creating a new one.
  bot?: EditableBot
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function BotDialog({
  trigger,
  bot,
  open: openProp,
  onOpenChange,
}: BotDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = openProp ?? uncontrolledOpen
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  // Set when the edit dialog reopens after a cancelled delete, so the user's
  // unsaved edits survive the round trip.
  const keepValuesRef = React.useRef(false)

  const form = useForm<BotFormValues>({
    resolver: zodResolver(insertBotSchema),
    defaultValues: freshValues(bot),
  })

  const avatar = useWatch({ control: form.control, name: "avatar" })
  const showBillingToast = useBillingToast()
  const checkBilling = useBillingGate()

  // Read the latest bot without re-running the effect when it changes, so a
  // refresh while the dialog is open never wipes the user's edits.
  const resetForm = React.useEffectEvent(() => {
    if (keepValuesRef.current) {
      keepValuesRef.current = false
      return
    }
    form.reset(freshValues(bot))
  })

  // Start every open with a clean form, however it opened: a fresh face for a
  // new bot, the saved values for an existing one.
  React.useEffect(() => {
    if (open) resetForm()
  }, [open])

  function setOpen(nextOpen: boolean) {
    setUncontrolledOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  // Stop a user who can't make a bot before they fill one in. Editing
  // still opens, because the edit dialog is also where a bot is deleted.
  async function onDialogOpenChange(nextOpen: boolean) {
    if (nextOpen && !bot && !(await checkBilling("createBot"))) return
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

  async function onSubmit(values: BotFormValues) {
    const result = bot
      ? await updateBot(bot.id, values)
      : await createBot(values)

    if (!result.ok) {
      if (isBillingError(result)) showBillingToast(result)
      else form.setError("root", { message: result.error })
      return
    }

    toast.add(
      bot
        ? {
            title: `${result.bot.name} is updated`,
            description: "Your changes have been saved.",
          }
        : {
            title: `${result.bot.name} is ready`,
            description: "Your new bot has been created.",
          }
    )
    setOpen(false)
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
              <DialogTitle>{bot ? "Edit bot" : "New bot"}</DialogTitle>
              <DialogDescription>
                {bot
                  ? "Change its face, name, or job."
                  : "Give it a face, a name, and a job to do."}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap gap-2">
              {templates.map((template) => (
                <Button
                  key={template.job}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    form.setValue("job", template.job, { shouldValidate: true })
                    form.setValue("instructions", template.instructions)
                  }}
                >
                  {template.job}
                </Button>
              ))}
            </div>

            <FieldGroup>
              <Field orientation="horizontal">
                <ChatAvatar seed={avatar} className="size-10" />
                <FieldContent>
                  <FieldTitle>Face</FieldTitle>
                  <FieldDescription>
                    Shuffle until you find one you like.
                  </FieldDescription>
                </FieldContent>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => form.setValue("avatar", nanoid())}
                >
                  <ShuffleIcon data-icon="inline-start" />
                  Shuffle
                </Button>
              </Field>

              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="bot-name">Name</FieldLabel>
                    <Input
                      {...field}
                      id="bot-name"
                      placeholder="Ada"
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
                name="job"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="bot-job">Job</FieldLabel>
                    <Input
                      {...field}
                      id="bot-job"
                      placeholder="Research assistant"
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
                name="instructions"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="bot-instructions">
                      How it should work
                    </FieldLabel>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      id="bot-instructions"
                      placeholder="Answer briefly, cite sources, and ask before running anything destructive."
                      className="min-h-24"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              {form.formState.errors.root && (
                <FieldError errors={[form.formState.errors.root]} />
              )}
            </FieldGroup>

            <DialogFooter>
              {bot && (
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
                {bot ? "Save changes" : "Create bot"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {bot && (
        <DeleteBotDialog
          bot={bot}
          open={deleteOpen}
          onOpenChange={onDeleteOpenChange}
        />
      )}
    </>
  )
}
