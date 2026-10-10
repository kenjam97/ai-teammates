"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { ShuffleIcon } from "lucide-react"
import { nanoid } from "nanoid"
import { Controller, useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { createBot } from "@/actions/bot"
import { insertBotSchema } from "@/db/schema"
import { ChatAvatar } from "@/components/chat-avatar"
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

function emptyValues(): BotFormValues {
  return { name: "", avatar: nanoid(), job: "", instructions: "" }
}

type BotDialogProps = {
  // Element that opens the dialog, e.g. a <Button />.
  trigger: React.ReactElement
}

export function BotDialog({ trigger }: BotDialogProps) {
  const [open, setOpen] = React.useState(false)

  const form = useForm<BotFormValues>({
    resolver: zodResolver(insertBotSchema),
    defaultValues: emptyValues(),
  })

  const avatar = useWatch({ control: form.control, name: "avatar" })

  function handleOpenChange(nextOpen: boolean) {
    // Start every new bot with a fresh face and a clean form.
    if (nextOpen) form.reset(emptyValues())
    setOpen(nextOpen)
  }

  async function onSubmit(values: BotFormValues) {
    const result = await createBot(values)

    if (!result.ok) {
      form.setError("root", { message: result.error })
      return
    }

    toast.add({
      title: `${result.bot.name} is ready`,
      description: "Your new bot has been created.",
    })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <DialogHeader>
            <DialogTitle>New bot</DialogTitle>
            <DialogDescription>
              Give it a face, a name, and a job to do.
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
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && (
                <Spinner data-icon="inline-start" />
              )}
              Create bot
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
