import { google } from "@ai-sdk/google";
import { chat } from "@trigger.dev/sdk/ai";
import {
  convertToModelMessages,
  hasToolCall,
  stepCountIs,
  type ToolSet,
} from "ai";
import { z } from "zod";

import type { Bot } from "@/db/schema";

import { type ChatUIMessage, createChatTools } from "./chat-tools";
import { db } from "./db";

// The chat and its bots, oldest member first.
async function loadChat(chatId: string) {
  const row = await db.query.chats.findFirst({
    where: (chats, { eq }) => eq(chats.id, chatId),
    columns: { kind: true, name: true },
    with: {
      members: {
        orderBy: (members, { asc }) => [
          asc(members.joinedAt),
          asc(members.botId),
        ],
        with: { bot: true },
      },
    },
  });
  if (!row || row.members.length === 0) {
    throw new Error(`No bot found for chat ${chatId}`);
  }
  return { ...row, members: row.members.map((member) => member.bot) };
}

// The handoff in the last reply, when that reply passed the turn on. Only a
// handoff turn starts on an assistant message: every other turn starts on the
// person's message.
function lastHandoff() {
  const last = chat.history.all().at(-1) as ChatUIMessage | undefined;
  if (last?.role !== "assistant") return undefined;
  for (const part of last.parts.toReversed()) {
    if (part.type === "tool-handoff" && part.state === "output-available") {
      return { fromBotId: last.metadata?.botId, ...part.output };
    }
  }
  return undefined;
}

// Who answers this turn: the bot a handoff passed it to, else the one picked
// in the composer, else the chat's first bot (a direct chat has only one).
// The pick comes from the browser, so it only counts when the bot is a member.
async function loadTurn(chatId: string, pickedBotId?: string) {
  const { kind, name, members } = await loadChat(chatId);
  const handoff = lastHandoff();
  const botId = handoff?.botId ?? pickedBotId;
  const bot = botId
    ? members.find((member) => member.id === botId)
    : members[0];
  if (!bot) throw new Error(`Bot ${botId} is not in chat ${chatId}`);
  return {
    bot,
    members,
    group: kind === "group" ? { name: name ?? "Group chat" } : undefined,
    handoffFrom: members.find((member) => member.id === handoff?.fromBotId),
  };
}

type Turn = Awaited<ReturnType<typeof loadTurn>>;

function systemPrompt({ bot, members, group, handoffFrom }: Turn) {
  return [
    `You are ${bot.name}, an AI teammate. Your job is: ${bot.job}.`,
    "You were created by the person you are chatting with to help them with that job. Stay focused on it, and say so plainly when a request falls outside it.",
    bot.instructions &&
      `How they want you to go about your job:\n${bot.instructions}`,
    group &&
      groupPrompt(
        group.name,
        members.filter((member) => member.id !== bot.id),
        handoffFrom,
      ),
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
    memoryPrompt(),
    "Be honest about what you have and haven't done. Never claim to have taken an action or seen a result that didn't happen in this conversation.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Where the memory file lives in every bot's sandbox. createBotSandbox creates
// it empty.
const MEMORY_PATH = "/home/daytona/MEMORY.md";

// Each chat only sees its own history, so the memory file is how a bot carries
// what it learned in its direct chat into group chats, and back.
function memoryPrompt() {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `Your memory is the file ${MEMORY_PATH} in your sandbox. You talk with the person in a private direct chat and may also be in group chats with other bots. Each conversation only shows you its own messages, so that file is the only way to remember anything from one conversation in another.`,
    [
      "Save to it whenever you learn something worth knowing later: facts about the person and their work, their preferences, decisions, commitments and follow-ups, where you put things in your sandbox, and anything they ask you to remember.",
      "Save it in the same turn you learn it, before you reply, without being asked. Read the file first, then write it back whole with the new note added, because writeFile replaces the file.",
      `Keep it short, organised Markdown with headings and bullets. Note where and when you learned each thing, like (direct chat, ${today}). Today is ${today}. Update or remove notes that change or turn out wrong instead of piling up contradictions.`,
    ].join(" "),
    [
      "Read it before you answer whenever earlier conversations might matter: when the person refers to something they told you, asks what you know or remember, or asks about anything you haven't seen in this chat, and at the start of a new conversation.",
      "Never say you don't know or don't remember something until you've checked it. If the file is missing, create it.",
    ].join(" "),
  ].join("\n\n");
}

function groupPrompt(name: string, others: Bot[], handoffFrom?: Bot) {
  return [
    `This is a group chat called "${name}". Besides you and the person, it has these bots, AI teammates with their own jobs and their own sandboxes:`,
    others
      .map((other) => `- ${other.name} (id: ${other.id}): ${other.job}`)
      .join("\n"),
    [
      "The person picks which bot answers each message, and this one is yours to answer.",
      `Replies from the other bots appear as assistant messages that start with their name in brackets, like ${authorLabel("Name")}. Replies without one are yours. Never write that label yourself.`,
      "The other bots' tool calls ran in their own sandboxes, so their files and results aren't in yours, and their work isn't yours to claim.",
    ].join(" "),
    handoffFrom
      ? `${handoffFrom.name} handed the person's latest message to you because it fits your job better. Answer it yourself; you can't hand it off again.`
      : [
          "If the person's latest message clearly fits another bot's job better than yours, call handoff with that bot's id and a short reason instead of answering. That bot then answers in its own message.",
          "Answer it yourself when it fits your job, when it's general, or when no bot fits clearly better. Don't hand off just because another bot is mentioned.",
        ].join(" "),
  ].join("\n\n");
}

function authorLabel(name: string) {
  return `[${name}]`;
}

// In a group chat, labels each reply from another bot with its name, so the
// bot answering doesn't take the others' words and actions for its own. Built
// from the UI history because only it records who wrote each reply.
function groupMessages({ bot, members }: Turn, tools: ToolSet) {
  const history = (chat.history.all() as ChatUIMessage[]).map((message) => {
    const author =
      message.role === "assistant" && message.metadata?.botId !== bot.id
        ? members.find((member) => member.id === message.metadata?.botId)
        : undefined;
    if (!author) return message;
    return {
      ...message,
      parts: [
        { type: "text" as const, text: authorLabel(author.name) },
        ...message.parts,
      ],
    };
  });
  return convertToModelMessages(history, {
    tools,
    ignoreIncompleteToolCalls: true,
  });
}

// One run per conversation. History is kept in the platform's default
// transcript storage, keyed by chat id. In a group chat, the bot picked in the
// composer answers the turn; the transport sends it as client data. A bot can
// pass the turn to another with the handoff tool, and the browser then sends a
// handoff action so the other bot answers in its own message.
export const chatAgent = chat
  .withUIMessage<ChatUIMessage>()
  .withClientData({ schema: z.object({ botId: z.string().optional() }) })
  .agent({
    id: "chat",
    // Resolved every turn. Declared here, not only on streamText, so the
    // screenshots' toModelOutput is re-applied to earlier turns. The turn
    // loads when a tool first runs, so it sees the same history as run().
    tools: ({ chatId, clientData }) => {
      let turn: Promise<Turn> | undefined;
      return createChatTools(
        () => (turn ??= loadTurn(chatId, clientData?.botId)),
      );
    },
    actionSchema: z.object({ type: z.literal("handoff") }),
    // Answers as the bot the last reply handed off to. Does nothing when the
    // last reply wasn't a handoff, so a repeated action can't add a reply.
    onAction: async () => {
      if (lastHandoff()) return chat.turn();
    },
    run: async ({ chatId, clientData, messages, tools, signal, streamText }) => {
      // Load the bot every turn so edits to it apply to the next reply.
      const turn = await loadTurn(chatId, clientData?.botId);
      // Tag the reply with its bot, so a group chat shows who answered.
      chat.setUIMessageStreamOptions({
        messageMetadata: () => ({ botId: turn.bot.id }),
      });
      // A bot that was handed the turn can't pass it on, so two bots can't
      // bounce a message between them.
      const canHandOff = turn.group && !turn.handoffFrom;
      return streamText({
        model: google("gemini-3.5-flash-lite"),
        system: systemPrompt(turn),
        messages: turn.group ? await groupMessages(turn, tools) : messages,
        tools,
        activeTools: (Object.keys(tools) as (keyof typeof tools)[]).filter(
          (name) => canHandOff || name !== "handoff",
        ),
        abortSignal: signal,
        // Desktop tasks take many small steps. A handoff ends the turn.
        stopWhen: [stepCountIs(50), hasToolCall("handoff")],
      });
    },
  });
