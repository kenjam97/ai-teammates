import "server-only"

import { auth } from "@clerk/nextjs/server"

import { db } from "@/db"

// The signed-in user's chats, most recent first, each with its bots in the
// order they joined.
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
        // Bots added together share a join time, so break ties by id to keep
        // the group avatar stable.
        orderBy: (members, { asc }) => [
          asc(members.joinedAt),
          asc(members.botId),
        ],
        with: {
          bot: { columns: { id: true, name: true, avatar: true } },
        },
      },
    },
  })

  return chats.flatMap(({ members, ...chat }) => {
    const bots = members.map((member) => member.bot)
    if (bots.length === 0) return []
    // Direct chats are named after their bot.
    return [{ ...chat, name: chat.name ?? bots[0].name, bots }]
  })
}

export type ChatListItem = Awaited<ReturnType<typeof getChats>>[number]
