import { google } from "@ai-sdk/google";
import { chat } from "@trigger.dev/sdk/ai";
import { stepCountIs } from "ai";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { bots, chatMembers, type Bot } from "@/db/schema";

import { db } from "./db";
import { type ChatUIMessage, createSandboxTools } from "./sandbox-tools";

// The bot that answers this turn: the one picked in the composer, or the
// chat's first bot when none was picked (a direct chat has only one). The pick
// comes from the browser, so it only counts when the bot is a member.
async function getChatBot(chatId: string, botId?: string) {
  const [row] = await db
    .select({ bot: bots })
    .from(chatMembers)
    .innerJoin(bots, eq(bots.id, chatMembers.botId))
    .where(
      and(
        eq(chatMembers.chatId, chatId),
        botId ? eq(chatMembers.botId, botId) : undefined,
      ),
    )
    .orderBy(asc(chatMembers.joinedAt))
    .limit(1);
  if (!row) throw new Error(`No bot found for chat ${chatId}`);
  return row.bot;
}

function systemPrompt(bot: Bot) {
  return [
    `You are ${bot.name}, an AI teammate. Your job is: ${bot.job}.`,
    "You were created by the person you are chatting with to help them with that job. Stay focused on it, and say so plainly when a request falls outside it.",
    bot.instructions &&
      `How they want you to go about your job:\n${bot.instructions}`,
    [
      "You have your own sandbox: an isolated Linux computer in the cloud, created for you alone when you were created and deleted with you.",
      "It is a Debian-based machine with its own filesystem, network and process space, running as the user daytona with the home directory /home/daytona.",
      "Nothing else shares it, and what is saved there stays between conversations.",
    ].join(" "),
    [
      "Your tools work in that sandbox. Use bash and the file tools for anything a shell can do; they are faster and more reliable than the desktop.",
      "The sandbox also has a 1024x768 desktop. Use the mouse and keyboard tools for graphical apps, with coordinates in screen pixels from the top left.",
      "Call viewScreen before acting on the screen and again afterwards to check the result, because you can't see it otherwise.",
      "Call showScreen only when the person asks to see the screen; viewScreen is for your own looking.",
    ].join(" "),
    "Be honest about what you have and haven't done. Never claim to have taken an action or seen a result that didn't happen in this conversation.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// One run per conversation. History is kept in the platform's default
// transcript storage, keyed by chat id. In a group chat, the bot picked in the
// composer answers the turn; the transport sends it as client data.
export const chatAgent = chat
  .withUIMessage<ChatUIMessage>()
  .withClientData({ schema: z.object({ botId: z.string().optional() }) })
  .agent({
    id: "chat",
    // Resolved every turn. Declared here, not only on streamText, so the
    // screenshots' toModelOutput is re-applied to earlier turns.
    tools: ({ chatId, clientData }) =>
      createSandboxTools(
        async () => (await getChatBot(chatId, clientData?.botId)).sandboxId,
      ),
    run: async ({ chatId, clientData, messages, tools, signal, streamText }) => {
      // Load the bot every turn so edits to it apply to the next reply.
      const bot = await getChatBot(chatId, clientData?.botId);
      return streamText({
        model: google("gemini-3.5-flash-lite"),
        system: systemPrompt(bot),
        messages,
        tools,
        abortSignal: signal,
        // Desktop tasks take many small steps.
        stopWhen: stepCountIs(50),
      });
    },
  });
