import "server-only"

import { auth } from "@clerk/nextjs/server"

import { db } from "@/db"

// One of the signed-in user's chats with its bots, oldest member first.
// Returns null when the chat doesn't exist or belongs to someone else.
export async function getChat(chatId: string) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return null

  const chat = await db.query.chats.findFirst({
    where: (chats, { and, eq }) =>
      and(eq(chats.id, chatId), eq(chats.userId, userId)),
    columns: {
      id: true,
      kind: true,
      name: true,
    },
    with: {
      members: {
        orderBy: (members, { asc }) => [
          asc(members.joinedAt),
          asc(members.botId),
        ],
        with: {
          bot: {
            columns: {
              id: true,
              name: true,
              avatar: true,
              job: true,
              instructions: true,
            },
          },
        },
      },
    },
  })

  return chat ?? null
}

export type ChatDetail = NonNullable<Awaited<ReturnType<typeof getChat>>>
