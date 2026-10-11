import "server-only"

import { auth } from "@clerk/nextjs/server"

import { db } from "@/db"
import {
  isMeteredAction,
  limitReached,
  missingFeature,
  planRequired,
  requiredFeatures,
  type BillingError,
  type GatedAction,
} from "@/lib/billing"
import { getUsage, overLimit } from "@/lib/usage"

// Why billing stops the signed-in user from taking the action, or null when
// it doesn't: the plan is missing a feature, or a limit for the period is used
// up. Callers check that the user is signed in first.
export async function checkAllowance(
  action: GatedAction
): Promise<BillingError | null> {
  const { userId, has } = await auth()
  if (!userId) throw new Error("You need to sign in.")

  const missing = missingFeature(has, requiredFeatures[action])
  if (missing) return planRequired(missing)
  if (!isMeteredAction(action)) return null

  const usage = await getUsage(db, userId)
  // The session says the plan has the feature but Clerk has no paid period:
  // the plan has just ended and the session token hasn't caught up.
  if (!usage) return planRequired(requiredFeatures[action][0])
  const message = overLimit(usage, action)
  return message ? limitReached(message) : null
}
