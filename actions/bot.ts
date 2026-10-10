"use server"

import { auth } from "@clerk/nextjs/server"
import { refresh } from "next/cache"
import { z } from "zod"

import { db } from "@/db"
import {
  bots,
  chatMembers,
  chats,
  insertBotSchema,
  type Bot,
  type Chat,
} from "@/db/schema"

type CreateBotResult =
  | { ok: true; bot: Bot; chat: Chat }
  | { ok: false; error: string }

export async function createBot(input: unknown): Promise<CreateBotResult> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You need to sign in." }

  // Server Actions are public endpoints, so validate again on the server.
  const parsed = insertBotSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error) }
  }

  // Every bot starts with a direct chat. Create all three rows together so a
  // failure never leaves a bot without its chat.
  const { bot, chat } = await db.transaction(async (tx) => {
    const [bot] = await tx
      .insert(bots)
      .values({
        ...parsed.data,
        instructions: parsed.data.instructions || null,
        userId,
      })
      .returning()

    const [chat] = await tx
      .insert(chats)
      .values({ userId, kind: "direct" })
      .returning()

    await tx.insert(chatMembers).values({ chatId: chat.id, botId: bot.id })

    return { bot, chat }
  })

  refresh()

  return { ok: true, bot, chat }
}
