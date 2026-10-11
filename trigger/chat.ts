import { google } from "@ai-sdk/google";
import { chat } from "@trigger.dev/sdk/ai";

// One run per conversation. History is kept in the platform's default
// transcript storage, keyed by chat id.
export const chatAgent = chat.agent({
  id: "chat",
  run: async ({ messages, signal, streamText }) =>
    streamText({
      model: google("gemini-3.5-flash-lite"),
      messages,
      abortSignal: signal,
    }),
});
