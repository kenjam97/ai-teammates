"use server"

import { auth } from "@clerk/nextjs/server"
import { refresh, revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { and, eq, inArray, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"

import { db } from "@/db"
import { checkAllowance } from "@/lib/allowance"
import type { BillingError } from "@/lib/billing"
import { createBotSandbox, deleteBotSandbox } from "@/lib/daytona"
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
  | BillingError

export async function createBot(input: unknown): Promise<CreateBotResult> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You need to sign in." }

  const blocked = await checkAllowance("createBot")
  if (blocked) return blocked

  // Server Actions are public endpoints, so validate again on the server.
  const parsed = insertBotSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error) }
  }

  // Every bot gets its own sandbox. Create it before the rows, outside the
  // transaction, so the slow network call doesn't hold a connection open.
  const botId = nanoid()
  let sandboxId: string
  try {
    sandboxId = await createBotSandbox(botId, userId)
  } catch (error) {
    console.error("Failed to create sandbox", error)
    return { ok: false, error: "Couldn't set up your bot. Try again." }
  }

  // Every bot starts with a direct chat. Create all three rows together so a
  // failure never leaves a bot without its chat.
  let created: { bot: Bot; chat: Chat }
  try {
    created = await db.transaction(async (tx) => {
      const [bot] = await tx
        .insert(bots)
        .values({
          ...parsed.data,
          instructions: parsed.data.instructions || null,
          id: botId,
          userId,
          sandboxId,
        })
        .returning()

      const [chat] = await tx
        .insert(chats)
        .values({ userId, kind: "direct" })
        .returning()

      await tx.insert(chatMembers).values({ chatId: chat.id, botId: bot.id })

      return { bot, chat }
    })
  } catch (error) {
    // Don't leave a sandbox behind for a bot that doesn't exist.
    await deleteBotSandbox(sandboxId).catch((e) =>
      console.error("Failed to delete orphaned sandbox", sandboxId, e)
    )
    throw error
  }
  const { bot, chat } = created

  refresh()

  return { ok: true, bot, chat }
}

type UpdateBotResult =
  | { ok: true; bot: Bot }
  | { ok: false; error: string }
  | BillingError

export async function updateBot(
  botId: unknown,
  input: unknown
): Promise<UpdateBotResult> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You need to sign in." }
  const blocked = await checkAllowance("editBot")
  if (blocked) return blocked

  const parsedId = z.string().min(1).safeParse(botId)
  if (!parsedId.success) return { ok: false, error: "This bot doesn't exist." }

  // Server Actions are public endpoints, so validate again on the server.
  const parsed = insertBotSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error) }
  }

  // Scope the update to the signed-in user so nobody can edit another
  // user's bot by guessing its ID.
  const [bot] = await db
    .update(bots)
    .set({
      ...parsed.data,
      instructions: parsed.data.instructions || null,
    })
    .where(and(eq(bots.id, parsedId.data), eq(bots.userId, userId)))
    .returning()

  if (!bot) return { ok: false, error: "This bot doesn't exist." }

  refresh()

  return { ok: true, bot }
}

// Only failures return. On success the action redirects home, because the
// page the user is on may be the deleted bot's chat.
type DeleteBotResult = { ok: false; error: string }

export async function deleteBot(botId: unknown): Promise<DeleteBotResult> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You need to sign in." }

  const parsedId = z.string().min(1).safeParse(botId)
  if (!parsedId.success) return { ok: false, error: "This bot doesn't exist." }

  // Deleting the bot cascades to its memberships, which would leave its direct
  // chats empty. Delete them in the same transaction.
  const deleted = await db.transaction(async (tx) => {
    const [bot] = await tx
      .delete(bots)
      .where(and(eq(bots.id, parsedId.data), eq(bots.userId, userId)))
      .returning({ sandboxId: bots.sandboxId })
    if (!bot) return null

    const directChats = tx
      .select({ id: chats.id })
      .from(chats)
      .leftJoin(chatMembers, eq(chatMembers.chatId, chats.id))
      .where(and(eq(chats.userId, userId), eq(chats.kind, "direct")))
      .groupBy(chats.id)
      .having(sql`count(${chatMembers.botId}) = 0`)
    await tx.delete(chats).where(inArray(chats.id, directChats))

    return bot
  })

  if (!deleted) return { ok: false, error: "This bot doesn't exist." }

  // The bot is already gone, so a failure here only leaves an orphaned
  // sandbox (labelled with the bot ID). Log it rather than fail the delete.
  try {
    await deleteBotSandbox(deleted.sandboxId)
  } catch (error) {
    console.error("Failed to delete sandbox", deleted.sandboxId, error)
  }

  revalidatePath("/", "layout")
  redirect("/")
}
