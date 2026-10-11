import { type InferUITools, tool, type UIDataTypes, type UIMessage } from "ai";
import { z } from "zod";

import { createSandboxTools } from "./sandbox-tools";

type ChatBot = { id: string; name: string; sandboxId: string };

// Who is answering this turn, and who else is in the chat.
export type TurnBots = { bot: ChatBot; members: ChatBot[] };

// Every tool a bot can have. The set is fixed so message types stay stable;
// handoff is only switched on in group chats (see activeTools in chat.ts).
export function createChatTools(getTurnBots: () => Promise<TurnBots>) {
  return {
    ...createSandboxTools(async () => (await getTurnBots()).bot.sandboxId),

    // Records which bot should answer instead. The bot's turn ends on this
    // call, and the browser then asks the agent for the other bot's turn.
    handoff: tool({
      description:
        "Hand the person's latest message to another bot in this group chat whose job fits it better. That bot answers next, in its own message, and sees this conversation. Call it instead of answering, as your only action, and don't answer the request yourself.",
      inputSchema: z.object({
        botId: z
          .string()
          .min(1)
          .describe("The id of the bot to hand off to, from the group's member list."),
        reason: z
          .string()
          .min(1)
          .describe("One short sentence for the person on why that bot fits better."),
      }),
      execute: async ({ botId, reason }) => {
        const { bot, members } = await getTurnBots();
        const target = members.find((member) => member.id === botId);
        if (!target) throw new Error(`No bot with the id ${botId} is in this chat.`);
        if (target.id === bot.id) throw new Error("You can't hand off to yourself.");
        return { botId: target.id, botName: target.name, reason };
      },
    }),
  };
}

export type ChatTools = ReturnType<typeof createChatTools>;

// In a group chat: the bot that wrote a reply, or the bot a message was for.
export type ChatMessageMetadata = { botId?: string };

export type ChatUIMessage = UIMessage<
  ChatMessageMetadata,
  UIDataTypes,
  InferUITools<ChatTools>
>;
