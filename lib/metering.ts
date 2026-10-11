import type { LanguageModelUsage } from "ai"

// The model every bot runs on. Its prices are below, so change both together.
export const CHAT_MODEL = "gemini-3.5-flash-lite"

// Gemini 3.5 Flash-Lite, standard paid tier, in US dollars per million tokens.
// Output includes thinking tokens. From ai.google.dev/gemini-api/docs/pricing
// (October 2026).
const aiPrices = { input: 0.3, cachedInput: 0.03, output: 2.5 }

// What a model call cost, in millionths of a dollar. A dollar per million
// tokens is one millionth of a dollar per token, so the prices apply as is.
export function aiCostMicros(usage: LanguageModelUsage) {
  const input = usage.inputTokens ?? 0
  const cached = usage.inputTokenDetails.cacheReadTokens ?? 0
  const output = usage.outputTokens ?? 0
  return Math.ceil(
    (input - cached) * aiPrices.input +
      cached * aiPrices.cachedInput +
      output * aiPrices.output
  )
}

// Daytona, in US dollars per hour of a running sandbox. From
// daytona.io/pricing (October 2026). Disk ($0.000108 per GiB-hour, first
// 5 GiB free) isn't metered: it is billed even while stopped, and the bot
// limit caps it instead.
const sandboxPrices = { vcpuHour: 0.0504, memoryGibHour: 0.0162 }

// What running a sandbox of this size for this long cost, in millionths of a
// dollar.
export function sandboxCostMicros(
  seconds: number,
  { cpu, memory }: { cpu: number; memory: number }
) {
  const perHour =
    cpu * sandboxPrices.vcpuHour + memory * sandboxPrices.memoryGibHour
  return Math.ceil((seconds / 3600) * perHour * 1_000_000)
}
