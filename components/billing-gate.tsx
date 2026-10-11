"use client"

import { useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"

import { getAllowance } from "@/actions/usage"
import {
  isBillingError,
  isMeteredAction,
  missingFeature,
  planRequired,
  requiredFeatures,
  type BillingError,
  type GatedAction,
} from "@/lib/billing"
import { toast } from "@/components/ui/toast"

// Shows a billing error as a toast with a button to the page that fixes it:
// pricing for a missing feature, usage for a used-up limit.
export function useBillingToast() {
  const router = useRouter()

  return ({ error, billing }: BillingError) =>
    toast.add(
      billing === "plan"
        ? {
            type: "error",
            title: "Upgrade to Pro",
            description: error,
            actionProps: {
              children: "See plans",
              onClick: () => router.push("/pricing"),
            },
          }
        : {
            type: "error",
            title: "Usage limit reached",
            description: error,
            actionProps: {
              children: "See usage",
              onClick: () => router.push("/usage"),
            },
          }
    )
}

// Checks billing before a form or panel opens, so the user finds out before
// doing any work. Resolves true when the action is allowed. The server checks
// again when the action runs: this only gets the answer in early.
export function useBillingGate() {
  const { has, isLoaded } = useAuth()
  const showBillingToast = useBillingToast()

  return async (action: GatedAction) => {
    // The plan is in the session, so a free user gets the toast instantly.
    if (isLoaded && has) {
      const missing = missingFeature(has, requiredFeatures[action])
      if (missing) {
        showBillingToast(planRequired(missing))
        return false
      }
    }
    if (!isMeteredAction(action)) return true

    // Limits are in the ledger, so ask the server.
    try {
      const result = await getAllowance(action)
      if (isBillingError(result)) {
        showBillingToast(result)
        return false
      }
    } catch {
      // Let it through; the action itself will refuse if it must.
    }
    return true
  }
}
