import "server-only"

import { Daytona, DaytonaNotFoundError } from "@daytona/sdk"

// Pass the config explicitly: the SDK refuses to read DAYTONA_API_URL from the
// environment when it was loaded from .env.local, as Next.js does.
const daytona = new Daytona({
  apiKey: process.env.DAYTONA_API_KEY,
  apiUrl: process.env.DAYTONA_API_URL,
})

// Every bot gets its own sandbox. Labels tie it back to the bot so orphans can
// be found in the Daytona dashboard.
export async function createBotSandbox(botId: string, userId: string) {
  const sandbox = await daytona.create({
    labels: { app: "ai-teammates", botId, userId },
  })
  return sandbox.id
}

// Deleting a sandbox that is already gone counts as success.
export async function deleteBotSandbox(sandboxId: string) {
  try {
    const sandbox = await daytona.get(sandboxId)
    await daytona.delete(sandbox)
  } catch (error) {
    if (error instanceof DaytonaNotFoundError) return
    throw error
  }
}
