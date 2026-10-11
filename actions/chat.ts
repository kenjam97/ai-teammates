"use server"

import { auth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import { and, eq, inArray } from "drizzle-orm"
import { refresh } from "next/cache"
import { z } from "zod"

import { db } from "@/db"
import {
  bots,
  chatMembers,
  chats,
  insertGroupChatSchema,
  type Chat,
} from "@/db/schema"
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

type ChatClientData = Parameters<typeof startSession>[0]["clientData"]

// Creates the chat's session and first run. Idempotent on chat id. The client
// data (the bot picked for a group chat) goes to the first run; the agent
// validates it and checks the bot is a member.
export async function startChatSession(params: {
  chatId: string
  clientData?: ChatClientData
}) {
  const chatId = await authorizeChat(params?.chatId)
  return startSession({ chatId, clientData: params?.clientData })
}

// The transport calls this to refresh an expired session token.
export async function mintChatAccessToken(chatId: string) {
  const id = await authorizeChat(chatId)
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

export async function createGroupChat(
  input: unknown
): Promise<CreateGroupChatResult> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You need to sign in." }

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
