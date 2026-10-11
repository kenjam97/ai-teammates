// Billable features, as set up on the Pro plan in Clerk Billing. Check them
// with has({ feature }) from auth() on the server and useAuth() in the browser.
// The free plan has none of them.
export type Feature = "bots" | "sandboxes"

// What each gated action needs. Shared by the server actions and the browser
// checks that stop a free user before they open a form or panel.
export const requiredFeatures = {
  // Every bot comes with a sandbox.
  createBot: ["bots", "sandboxes"],
  editBot: ["bots"],
  groupChat: ["bots"],
  // Bots answer with tools that run in their sandboxes.
  chat: ["bots", "sandboxes"],
  desktop: ["sandboxes"],
} satisfies Record<string, Feature[]>

export type GatedAction = keyof typeof requiredFeatures

// Which limits each metered action needs headroom on. The other gated
// actions only need the plan.
export const meteredLimits = {
  // Starting a bot's sandbox, which then runs until it stops on its own.
  createBot: ["bots", "sandbox"],
  // The model's tokens. Sandbox time is checked when a tool first runs.
  chat: ["ai"],
  desktop: ["sandbox"],
} as const satisfies Partial<
  Record<GatedAction, readonly ("ai" | "sandbox" | "bots")[]>
>

export type MeteredAction = keyof typeof meteredLimits

export function isMeteredAction(action: string): action is MeteredAction {
  return action in meteredLimits
}

// What a paid plan allows per billing period, sized so a user who maxes out
// every limit still costs less than the plan's $20 a month (see
// lib/metering.ts for the prices). Bots aren't metered: the cap limits the
// number of sandboxes, which cost disk storage even while stopped.
export const planLimits = {
  pro: {
    // Spent on model tokens, in millionths of a US dollar.
    aiCostMicros: 6_000_000,
    // Running time across all of the user's sandboxes.
    sandboxSeconds: 50 * 60 * 60,
    bots: 10,
  },
}

export type PlanSlug = keyof typeof planLimits
export type PlanLimits = (typeof planLimits)[PlanSlug]

// What an action returns when billing stops it: the plan is missing a
// feature, or a limit for the period is used up. The browser shows it as a
// toast that links to the pricing page or the usage page.
export type BillingError = {
  ok: false
  error: string
  billing: "plan" | "limit"
}

const featureMessages: Record<Feature, string> = {
  bots: "Bots are part of the Pro plan.",
  sandboxes: "Sandboxes are part of the Pro plan.",
}

export function isBillingError(result: {
  ok: boolean
}): result is BillingError {
  return "billing" in result
}

export function planRequired(feature: Feature): BillingError {
  return { ok: false, error: featureMessages[feature], billing: "plan" }
}

export function limitReached(message: string): BillingError {
  return { ok: false, error: message, billing: "limit" }
}

// The first feature in the list that the plan is missing.
export function missingFeature(
  has: (params: { feature: string }) => boolean,
  features: Feature[]
) {
  return features.find((feature) => !has({ feature }))
}
