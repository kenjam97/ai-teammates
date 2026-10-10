"use server"

import { auth } from "@clerk/nextjs/server"
import { refresh } from "next/cache"
import { z } from "zod"

import { db } from "@/db"
import { bots, insertBotSchema, type Bot } from "@/db/schema"

type CreateBotResult =
  | { ok: true; bot: Bot }
  | { ok: false; error: string }

export async function createBot(input: unknown): Promise<CreateBotResult> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You need to sign in." }

  // Server Actions are public endpoints, so validate again on the server.
  const parsed = insertBotSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error) }
  }

  const [bot] = await db
    .insert(bots)
    .values({
      ...parsed.data,
      instructions: parsed.data.instructions || null,
      userId,
    })
    .returning()

  refresh()

  return { ok: true, bot }
}
