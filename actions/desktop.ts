"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { bots, chatMembers, chats } from "@/db/schema"
import { checkAllowance } from "@/lib/allowance"
import type { BillingError } from "@/lib/billing"
import { getSandboxDesktopUrl } from "@/lib/daytona"

type GetDesktopUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string }
  | BillingError

// Returns a noVNC URL for the desktop of a direct chat's bot. Group chats have
// no desktop.
export async function getDesktopUrl(
  input: unknown,
): Promise<GetDesktopUrlResult> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You need to sign in." }
  const blocked = await checkAllowance("desktop")
  if (blocked) return blocked

  // Server Actions are public endpoints, so validate on the server.
  const parsed = z.string().min(1).safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error) }
  }

  const [row] = await db
    .select({ sandboxId: bots.sandboxId })
    .from(chats)
    .innerJoin(chatMembers, eq(chatMembers.chatId, chats.id))
    .innerJoin(bots, eq(bots.id, chatMembers.botId))
    .where(
      and(
        eq(chats.id, parsed.data),
        eq(chats.userId, userId),
        eq(chats.kind, "direct")
      )
    )
    .limit(1)
  if (!row) return { ok: false, error: "This chat has no bot." }

  try {
    return { ok: true, url: await getSandboxDesktopUrl(row.sandboxId) }
  } catch (error) {
    console.error("Failed to open desktop", row.sandboxId, error)
    return { ok: false, error: "The desktop couldn't be started. Try again." }
  }
}
