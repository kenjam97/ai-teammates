import "server-only"

import { auth } from "@clerk/nextjs/server"

import { db } from "@/db"

// The signed-in user's chats, most recent first, each with the bot that
// fronts it. Group chats fall back to their first bot for now.
export async function getChats() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return []

  const chats = await db.query.chats.findMany({
    where: (chats, { eq }) => eq(chats.userId, userId),
    orderBy: (chats, { desc }) => [desc(chats.lastMessagedAt)],
    columns: {
      id: true,
      kind: true,
      name: true,
      lastMessagePreview: true,
      lastMessagedAt: true,
    },
    with: {
      members: {
        orderBy: (members, { asc }) => [asc(members.joinedAt)],
        limit: 1,
        with: {
          bot: { columns: { id: true, name: true, avatar: true } },
        },
      },
    },
  })

  return chats.flatMap(({ members, ...chat }) => {
    const bot = members[0]?.bot
    return bot ? [{ ...chat, bot }] : []
  })
}

export type ChatListItem = Awaited<ReturnType<typeof getChats>>[number]
