"use client"

import * as React from "react"

import { deleteBot } from "@/actions/bot"
import type { Bot } from "@/db/schema"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { FieldError } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"

type DeleteBotDialogProps = {
  bot: Pick<Bot, "id" | "name">
  open: boolean
  // Called with false when the user backs out. A successful delete navigates
  // away instead of closing.
  onOpenChange: (open: boolean) => void
}

export function DeleteBotDialog({
  bot,
  open,
  onOpenChange,
}: DeleteBotDialogProps) {
  const [error, setError] = React.useState<string>()
  const [isPending, startTransition] = React.useTransition()

  function setOpen(nextOpen: boolean) {
    if (isPending) return
    // Clear the failed attempt so the next open starts clean.
    if (!nextOpen) setError(undefined)
    onOpenChange(nextOpen)
  }

  function onDelete() {
    startTransition(async () => {
      // Only returns on failure. On success the action redirects home, and the
      // transition stays pending until the navigation finishes.
      const result = await deleteBot(bot.id)
      if (result && !result.ok) setError(result.error)
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {bot.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the bot and its direct chat. You can&apos;t undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <FieldError>{error}</FieldError>}
        <AlertDialogFooter>
          <AlertDialogCancel type="button" disabled={isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={onDelete}
          >
            {isPending && <Spinner data-icon="inline-start" />}
            Delete bot
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
