"use server"

import { auth } from "@clerk/nextjs/server"
import { z } from "zod"

import { checkAllowance } from "@/lib/allowance"
import { requiredFeatures, type BillingError } from "@/lib/billing"

type GetAllowanceResult = { ok: true } | { ok: false; error: string } | BillingError

const actionSchema = z.enum(
  Object.keys(requiredFeatures) as [keyof typeof requiredFeatures]
)

// Lets the browser check an action before opening its form or panel, so a
// user over a limit finds out straight away. The action itself checks again.
export async function getAllowance(
  action: unknown
): Promise<GetAllowanceResult> {
  const { isAuthenticated } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You need to sign in." }

  // Server Actions are public endpoints, so validate on the server.
  const parsed = actionSchema.safeParse(action)
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) }

  return (await checkAllowance(parsed.data)) ?? { ok: true }
}
