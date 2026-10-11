import "server-only"

import { Daytona, DaytonaNotFoundError } from "@daytona/sdk"

// Pass the config explicitly: the SDK refuses to read DAYTONA_API_URL from the
// environment when it was loaded from .env.local, as Next.js does.
const daytona = new Daytona({
  apiKey: process.env.DAYTONA_API_KEY,
  apiUrl: process.env.DAYTONA_API_URL,
})

// The bot's long-term memory. The chat agent's instructions tell it to read and
// update this file, so what it learns in one chat carries over to the others.
const MEMORY_PATH = "/home/daytona/MEMORY.md"

// Every bot gets its own sandbox. Labels tie it back to the bot so orphans can
// be found in the Daytona dashboard.
export async function createBotSandbox(botId: string, userId: string) {
  const sandbox = await daytona.create({
    labels: { app: "ai-teammates", botId, userId },
  })
  try {
    const { exitCode, result } = await sandbox.process.executeCommand(
      `touch ${MEMORY_PATH}`
    )
    if (exitCode !== 0) {
      throw new Error(`Failed to create ${MEMORY_PATH}: ${result}`)
    }
  } catch (error) {
    await daytona.delete(sandbox).catch((e) =>
      console.error("Failed to delete sandbox", sandbox.id, e)
    )
    throw error
  }
  return sandbox.id
}

// noVNC listens on this port once the desktop is running.
const NOVNC_PORT = 6080

// Starts the sandbox and its desktop if needed and returns a signed noVNC URL
// that can go straight into an iframe. It lasts the maximum of 24 hours so the
// viewer can reconnect for as long as the page stays open.
export async function getSandboxDesktopUrl(sandboxId: string) {
  const sandbox = await daytona.get(sandboxId)
  if (sandbox.state !== "started") await sandbox.start()

  const { status } = await sandbox.computerUse.getStatus()
  if (status !== "active") await sandbox.computerUse.start()

  const { url } = await sandbox.getSignedPreviewUrl(NOVNC_PORT, 24 * 60 * 60)
  const viewer = new URL("vnc.html", url)
  viewer.search = new URLSearchParams({
    autoconnect: "true",
    reconnect: "true",
    resize: "scale",
  }).toString()
  return viewer.toString()
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
