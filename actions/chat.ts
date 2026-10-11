"use server"

import { auth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { chats } from "@/db/schema"
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

// Creates the chat's session and first run. Idempotent on chat id.
export async function startChatSession(params: { chatId: string }) {
  const chatId = await authorizeChat(params?.chatId)
  return startSession({ chatId })
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
