import { createClerkClient } from "@clerk/backend"
import { and, count, eq, gte, sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"

import * as schema from "@/db/schema"
import { bots, usageEvents, type NewUsageEvent } from "@/db/schema"
import {
  meteredLimits,
  planLimits,
  type MeteredAction,
  type PlanLimits,
  type PlanSlug,
} from "@/lib/billing"

// Shared by the Next.js server and the Trigger.dev worker, so it takes the
// database as an argument rather than importing one: db/index.ts is
// server-only and trigger/db.ts is for the worker.
type Db = NodePgDatabase<typeof schema>

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

export type BillingPeriod = {
  plan: PlanSlug
  limits: PlanLimits
  start: Date
  // Null for a plan that never renews.
  end: Date | null
}

function isPlanSlug(slug: string | undefined): slug is PlanSlug {
  return slug !== undefined && slug in planLimits
}

// The paid plan the user is in right now and its current period, or null on
// the free plan. Read from Clerk Billing every time, so it is never stale
// after an upgrade, a renewal or a cancellation.
export async function getBillingPeriod(
  userId: string
): Promise<BillingPeriod | null> {
  let subscription
  try {
    subscription = await clerk.billing.getUserBillingSubscription(userId)
  } catch (error) {
    // A user who never picked a plan has no subscription at all.
    if ((error as { status?: number }).status === 404) return null
    throw error
  }

  const now = Date.now()
  const item = subscription.subscriptionItems.find(
    (item) =>
      isPlanSlug(item.plan?.slug) &&
      item.periodStart <= now &&
      (item.periodEnd === null || now < item.periodEnd)
  )
  if (!item || !isPlanSlug(item.plan?.slug)) return null

  return {
    plan: item.plan.slug,
    limits: planLimits[item.plan.slug],
    start: new Date(item.periodStart),
    end: item.periodEnd === null ? null : new Date(item.periodEnd),
  }
}

export type Usage = {
  period: BillingPeriod
  aiCostMicros: number
  aiTokens: number
  sandboxCostMicros: number
  sandboxSeconds: number
  bots: number
}

// What the user has used this period, summed from the ledger. Null on the
// free plan, which has nothing to use.
export async function getUsage(db: Db, userId: string): Promise<Usage | null> {
  const period = await getBillingPeriod(userId)
  if (!period) return null

  const [totals, [botCount]] = await Promise.all([
    db
      .select({
        kind: usageEvents.kind,
        quantity: sql<string>`coalesce(sum(${usageEvents.quantity}), 0)`,
        costMicros: sql<string>`coalesce(sum(${usageEvents.costMicros}), 0)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId),
          gte(usageEvents.createdAt, period.start)
        )
      )
      .groupBy(usageEvents.kind),
    db.select({ value: count() }).from(bots).where(eq(bots.userId, userId)),
  ])

  // Postgres returns sums of integers as bigint, which arrive as strings.
  const ai = totals.find((row) => row.kind === "ai")
  const sandbox = totals.find((row) => row.kind === "sandbox")
  return {
    period,
    aiCostMicros: Number(ai?.costMicros ?? 0),
    aiTokens: Number(ai?.quantity ?? 0),
    sandboxCostMicros: Number(sandbox?.costMicros ?? 0),
    sandboxSeconds: Number(sandbox?.quantity ?? 0),
    bots: botCount.value,
  }
}

const limitMessages = {
  ai: "You've used this period's AI allowance.",
  sandbox: "You've used this period's sandbox time.",
  bots: "You've reached the bot limit for your plan. Delete a bot to make another.",
}

// Why the action is over a limit, or null when there is room for it.
export function overLimit(usage: Usage, action: MeteredAction) {
  const { limits } = usage.period
  const used = {
    ai: usage.aiCostMicros >= limits.aiCostMicros,
    sandbox: usage.sandboxSeconds >= limits.sandboxSeconds,
    bots: usage.bots >= limits.bots,
  }
  const limit = meteredLimits[action].find((limit) => used[limit])
  return limit ? limitMessages[limit] : null
}

// Appends to the ledger.
export async function recordUsage(db: Db, events: NewUsageEvent[]) {
  if (events.length > 0) await db.insert(usageEvents).values(events)
}
