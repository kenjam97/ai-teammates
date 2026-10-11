import { SandboxState, type Sandbox } from "@daytona/sdk";
import { logger, schedules } from "@trigger.dev/sdk";

import { sandboxCostMicros } from "@/lib/metering";
import { getUsage, overLimit, recordUsage } from "@/lib/usage";

import { db } from "./db";
import { daytona } from "./sandbox-tools";

// The states Daytona bills as running (vCPU and memory as well as disk).
const runningStates = [
  SandboxState.CREATING,
  SandboxState.STARTING,
  SandboxState.STARTED,
  SandboxState.STOPPING,
  SandboxState.RESTORING,
  SandboxState.RESIZING,
];

const INTERVAL_SECONDS = 5 * 60;

// Sandboxes run until they stop on their own after 15 idle minutes, whether
// a bot or the desktop started them, so their time is metered by looking:
// every five minutes, each running sandbox is charged to its owner for the
// time since the last look. Users who are out of sandbox time, or no longer on
// a paid plan, have their sandboxes stopped.
export const meterSandboxes = schedules.task({
  id: "meter-sandboxes",
  cron: "*/5 * * * *",
  run: async ({ timestamp, lastTimestamp }) => {
    // A missed run (a deploy, an outage) isn't billed as one long stretch.
    const elapsed = lastTimestamp
      ? (timestamp.getTime() - lastTimestamp.getTime()) / 1000
      : INTERVAL_SECONDS;
    const seconds = Math.round(Math.min(elapsed, 3 * INTERVAL_SECONDS));

    const byUser = new Map<string, Sandbox[]>();
    for await (const sandbox of daytona.list({
      labels: { app: "ai-teammates" },
      states: runningStates,
    })) {
      const userId = sandbox.labels.userId;
      if (!userId) continue;
      byUser.set(userId, [...(byUser.get(userId) ?? []), sandbox]);
    }

    await recordUsage(
      db,
      [...byUser].flatMap(([userId, sandboxes]) =>
        sandboxes.map((sandbox) => ({
          userId,
          kind: "sandbox" as const,
          quantity: seconds,
          costMicros: sandboxCostMicros(seconds, sandbox),
          details: {
            sandboxId: sandbox.id,
            botId: sandbox.labels.botId,
            cpu: sandbox.cpu,
            memory: sandbox.memory,
          },
        })),
      ),
    );

    // Check each user after charging them, so this look counts.
    for (const [userId, sandboxes] of byUser) {
      const usage = await getUsage(db, userId);
      const reason = usage ? overLimit(usage, "desktop") : "no paid plan";
      if (!reason) continue;

      logger.info("Stopping sandboxes", { userId, reason });
      await Promise.all(
        sandboxes
          .filter((sandbox) => sandbox.state === SandboxState.STARTED)
          .map((sandbox) =>
            sandbox.stop().catch((error) =>
              logger.error("Failed to stop sandbox", {
                sandboxId: sandbox.id,
                error,
              }),
            ),
          ),
      );
    }

    return { users: byUser.size, seconds };
  },
});
