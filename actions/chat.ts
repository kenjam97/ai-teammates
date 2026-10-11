"use server"

import { auth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import { and, eq, inArray, notInArray } from "drizzle-orm"
import { refresh, revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { db } from "@/db"
import {
  bots,
  chatMembers,
  chats,
  insertGroupChatSchema,
  type Chat,
} from "@/db/schema"
import { checkAllowance } from "@/lib/allowance"
import type { BillingError } from "@/lib/billing"
import type { chatAgent } from "@/trigger/chat"

const startSession = chat.createStartSessionAction<typeof chatAgent>("chat")
const loadChatTranscript = chat.createLoadTranscriptAction(defaultStorage)

// The chat transport calls these actions with a chat id from the browser, and
// expects a value back rather than a result union, so they throw on failure.
// Every one checks that the signed-in user owns the chat, because the default
// storage reads by chat id alone.
async function authorizeChat(chatId: unknown) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("You need to sign in.")

  const parsedId = z.string().min(1).safeParse(chatId)
  if (!parsedId.success) throw new Error("This chat doesn't exist.")

  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, parsedId.data), eq(chats.userId, userId)),
    columns: { id: true },
  })
  if (!chat) throw new Error("This chat doesn't exist.")

  return chat.id
}

// Checked when the session starts and every time its token is refreshed
// (hourly). The browser checks before sending, so this only throws for a
// bypassed client, and the agent checks the limits again every turn.
async function requireChatAllowance() {
  const blocked = await checkAllowance("chat")
  if (blocked) throw new Error(blocked.error)
}

type ChatClientData = Parameters<typeof startSession>[0]["clientData"]

// Creates the chat's session and first run. Idempotent on chat id. The client
// data (the bot picked for a group chat) goes to the first run; the agent
// validates it and checks the bot is a member.
export async function startChatSession(params: {
  chatId: string
  clientData?: ChatClientData
}) {
  const chatId = await authorizeChat(params?.chatId)
  await requireChatAllowance()
  return startSession({ chatId, clientData: params?.clientData })
}

// The transport calls this to refresh an expired session token.
export async function mintChatAccessToken(chatId: string) {
  const id = await authorizeChat(chatId)
  await requireChatAllowance()
  return triggerAuth.createPublicToken({
    scopes: { read: { sessions: id }, write: { sessions: id } },
    expirationTime: "1h",
  })
}

// The chat's saved history, rendered before the chat connects.
export async function loadTranscript(params: { chatId: string }) {
  const chatId = await authorizeChat(params?.chatId)
  return loadChatTranscript({ chatId })
}

type CreateGroupChatResult =
  | { ok: true; chat: Chat }
  | { ok: false; error: string }
  | BillingError

export async function createGroupChat(
  input: unknown
): Promise<CreateGroupChatResult> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You need to sign in." }
  const blocked = await checkAllowance("groupChat")
  if (blocked) return blocked

  // Server Actions are public endpoints, so validate again on the server.
  const parsed = insertGroupChatSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error) }
  }
  const { name, botIds } = parsed.data
  const uniqueBotIds = [...new Set(botIds)]

  // Only the user's own bots can join.
  const owned = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(inArray(bots.id, uniqueBotIds), eq(bots.userId, userId)))
  if (owned.length !== uniqueBotIds.length || owned.length < 2) {
    return { ok: false, error: "Pick at least two of your bots." }
  }

  const chat = await db.transaction(async (tx) => {
    const [chat] = await tx
      .insert(chats)
      .values({ userId, kind: "group", name })
      .returning()

    await tx
      .insert(chatMembers)
      .values(uniqueBotIds.map((botId) => ({ chatId: chat.id, botId })))

    return chat
  })

  refresh()

  return { ok: true, chat }
}

type UpdateGroupChatResult =
  | { ok: true; chat: Chat }
  | { ok: false; error: string }
  | BillingError

export async function updateGroupChat(
  chatId: unknown,
  input: unknown
): Promise<UpdateGroupChatResult> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You need to sign in." }
  const blocked = await checkAllowance("groupChat")
  if (blocked) return blocked

  const parsedId = z.string().min(1).safeParse(chatId)
  if (!parsedId.success) return { ok: false, error: "This chat doesn't exist." }

  // Server Actions are public endpoints, so validate again on the server.
  const parsed = insertGroupChatSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error) }
  }
  const { name, botIds } = parsed.data
  const uniqueBotIds = [...new Set(botIds)]

  // Only the user's own bots can join.
  const owned = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(inArray(bots.id, uniqueBotIds), eq(bots.userId, userId)))
  if (owned.length !== uniqueBotIds.length || owned.length < 2) {
    return { ok: false, error: "Pick at least two of your bots." }
  }

  const chat = await db.transaction(async (tx) => {
    // Scope the update to the signed-in user's group chats so nobody can edit
    // another user's chat, or turn a direct chat into a group.
    const [chat] = await tx
      .update(chats)
      .set({ name })
      .where(
        and(
          eq(chats.id, parsedId.data),
          eq(chats.userId, userId),
          eq(chats.kind, "group")
        )
      )
      .returning()
    if (!chat) return null

    await tx
      .delete(chatMembers)
      .where(
        and(
          eq(chatMembers.chatId, chat.id),
          notInArray(chatMembers.botId, uniqueBotIds)
        )
      )
    // Bots that stay keep their join time, so the group avatar doesn't
    // reshuffle.
    await tx
      .insert(chatMembers)
      .values(uniqueBotIds.map((botId) => ({ chatId: chat.id, botId })))
      .onConflictDoNothing()

    return chat
  })

  if (!chat) return { ok: false, error: "This chat doesn't exist." }

  refresh()

  return { ok: true, chat }
}

// Only failures return. On success the action redirects home, because the
// page the user is on is the deleted chat.
type DeleteGroupChatResult = { ok: false; error: string }

export async function deleteGroupChat(
  chatId: unknown
): Promise<DeleteGroupChatResult> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You need to sign in." }

  const parsedId = z.string().min(1).safeParse(chatId)
  if (!parsedId.success) return { ok: false, error: "This chat doesn't exist." }

  // Direct chats go with their bot, so only group chats are deleted here.
  // Memberships cascade.
  const [deleted] = await db
    .delete(chats)
    .where(
      and(
        eq(chats.id, parsedId.data),
        eq(chats.userId, userId),
        eq(chats.kind, "group")
      )
    )
    .returning({ id: chats.id })

  if (!deleted) return { ok: false, error: "This chat doesn't exist." }

  revalidatePath("/", "layout")
  redirect("/")
}
