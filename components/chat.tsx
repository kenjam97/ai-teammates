"use client";

import { useChat } from "@ai-sdk/react";
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat";
import {
	useLoadTranscript,
	useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react";
import {
	type KeyboardEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { type BundledLanguage, bundledLanguages } from "shiki";

import {
	loadTranscript,
	mintChatAccessToken,
	startChatSession,
} from "@/actions/chat";
import { CodeBlock } from "@/components/ai-elements/code-block";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
	FileTree,
	FileTreeFile,
	FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import { Image } from "@/components/ai-elements/image";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import {
	PromptInput,
	PromptInputBody,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputCommand,
	PromptInputCommandItem,
	PromptInputCommandList,
	PromptInputSelect,
	PromptInputSelectContent,
	PromptInputSelectItem,
	PromptInputSelectTrigger,
	PromptInputSelectValue,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Terminal } from "@/components/ai-elements/terminal";
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
} from "@/components/ai-elements/tool";
import { ChatAvatar } from "@/components/chat-avatar";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { Bot } from "@/db/schema";
import type { chatAgent } from "@/trigger/chat";
import type { ChatUIMessage } from "@/trigger/chat-tools";

type ChatBot = Pick<Bot, "id" | "name" | "avatar">;

type ChatProps = {
	chatId: string;
	// The chat's bots. In a group chat the person picks which one answers.
	bots: ChatBot[];
};

export function Chat({ chatId, bots }: ChatProps) {
	const [botId, setBotId] = useState(bots[0]?.id);
	// The transport reads clientData live and sends it with every turn, so the
	// agent answers as whichever bot is picked when the message goes out.
	const transport = useTriggerChatTransport<typeof chatAgent>({
		task: "chat",
		accessToken: ({ chatId }) => mintChatAccessToken(chatId),
		startSession: ({ chatId, clientData }) =>
			startChatSession({ chatId, clientData }),
		clientData: { botId },
	});
	const { messages, isLoading } = useLoadTranscript(chatId, loadTranscript, {
		transport,
	});

	// useChat takes its initial messages once, so mount it after the history loads.
	if (isLoading) {
		return (
			<div className="flex flex-1 items-center justify-center">
				<Spinner />
			</div>
		);
	}

	return (
		<ChatView
			chatId={chatId}
			transport={transport}
			initialMessages={messages as ChatUIMessage[]}
			bots={bots}
			botId={botId}
			onBotChange={setBotId}
		/>
	);
}

type ChatViewProps = {
	chatId: string;
	transport: TriggerChatTransport;
	initialMessages: ChatUIMessage[];
	bots: ChatBot[];
	botId: string | undefined;
	onBotChange: (botId: string) => void;
};

function ChatView({
	chatId,
	transport,
	initialMessages,
	bots,
	botId,
	onBotChange,
}: ChatViewProps) {
	const [text, setText] = useState("");
	const [mention, setMention] = useState<Mention | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const isGroup = bots.length > 1;
	const { messages, status, sendMessage, stop } = useChat<ChatUIMessage>({
		id: chatId,
		messages: initialMessages,
		transport,
	});

	// Replies already handled, so a handoff is followed once and never again
	// on reload.
	const handledRef = useRef(new Set(initialMessages.map((m) => m.id)));

	// When a reply hands off to another bot, ask the agent for that bot's turn
	// and pick it for what comes next.
	useEffect(() => {
		if (status !== "ready") return;
		const last = messages.at(-1);
		if (last?.role !== "assistant" || handledRef.current.has(last.id)) return;
		handledRef.current.add(last.id);
		const handoff = last.parts.findLast(
			(part) => part.type === "tool-handoff" && part.state === "output-available",
		);
		if (handoff?.type !== "tool-handoff" || !handoff.output) return;
		onBotChange(handoff.output.botId);
		sendMessage(undefined, { body: { action: { type: "handoff" } } });
	}, [status, messages, onBotChange, sendMessage]);

	const mentionMatches = mention
		? bots.filter((bot) =>
				bot.name.toLowerCase().startsWith(mention.query.toLowerCase()),
			)
		: [];
	// Falls back to the first match when the highlighted bot is filtered out.
	const highlightedId = mentionMatches.some(
		(bot) => bot.id === mention?.highlighted,
	)
		? mention?.highlighted
		: mentionMatches[0]?.id;

	// Opens the mention menu while the caret is right after an @word.
	function updateMention(value: string, caret: number) {
		const match = /(?:^|\s)@([^\s@]*)$/.exec(value.slice(0, caret));
		setMention(
			isGroup && match
				? {
						query: match[1],
						start: caret - match[1].length - 1,
						end: caret,
						highlighted: mention?.highlighted ?? "",
					}
				: null,
		);
	}

	// Writes the bot's name in place of the @word and picks the bot, just like
	// the select.
	function pickMention(bot: ChatBot) {
		if (!mention) return;
		const inserted = `@${bot.name} `;
		setText(text.slice(0, mention.start) + inserted + text.slice(mention.end));
		setMention(null);
		onBotChange(bot.id);
		const caret = mention.start + inserted.length;
		requestAnimationFrame(() => {
			textareaRef.current?.focus();
			textareaRef.current?.setSelectionRange(caret, caret);
		});
	}

	function handleMentionKeys(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (!mention || mentionMatches.length === 0) return;
		const index = mentionMatches.findIndex((bot) => bot.id === highlightedId);
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const step = e.key === "ArrowDown" ? 1 : -1;
			const next =
				mentionMatches[(index + step + mentionMatches.length) % mentionMatches.length];
			setMention({ ...mention, highlighted: next.id });
		} else if (e.key === "Enter" || e.key === "Tab") {
			e.preventDefault();
			pickMention(mentionMatches[index]);
		} else if (e.key === "Escape") {
			e.preventDefault();
			setMention(null);
		}
	}

	function handleSubmit(message: PromptInputMessage) {
		if (!message.text.trim()) return;
		// A bot @mentioned in the message answers it, even when its name was
		// typed out rather than picked from the menu.
		const mentioned = isGroup ? lastMentionedBot(message.text, bots) : undefined;
		if (mentioned) onBotChange(mentioned.id);
		const chosenBotId = mentioned?.id ?? botId;
		// Saved on the message so it shows who it was for, and sent as client
		// data too: the transport's only catches up with the pick next render.
		sendMessage(
			{ text: message.text, metadata: { botId: chosenBotId } },
			{ metadata: { botId: chosenBotId } },
		);
		setText("");
		setMention(null);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<Conversation>
				<ConversationContent>
					{messages.map((message) => {
						// Group chats show which bot wrote each reply, and which bot
						// each of the person's messages was for.
						const bot = isGroup
							? bots.find((bot) => bot.id === message.metadata?.botId)
							: undefined;
						const isReply = message.role === "assistant";
						return (
							<Message
								from={message.role}
								key={message.id}
								className={
									bot && isReply ? "flex-row items-start gap-3" : undefined
								}
							>
								{bot && isReply && (
									<ChatAvatar seed={bot.avatar} className="size-6" />
								)}
								<MessageContent>
									{message.parts.map((part, i) => (
										<MessagePart key={`${message.id}-${i}`} part={part} />
									))}
								</MessageContent>
								{bot && !isReply && (
									<Badge variant="secondary" className="ml-auto gap-1.5">
										<ChatAvatar seed={bot.avatar} className="size-3.5" />
										To {bot.name}
									</Badge>
								)}
							</Message>
						);
					})}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			<div className="relative p-4 pt-0">
				{mention && mentionMatches.length > 0 && (
					<PromptInputCommand
						shouldFilter={false}
						value={highlightedId}
						onValueChange={(highlighted) =>
							setMention({ ...mention, highlighted })
						}
						className="absolute bottom-full left-4 z-10 mb-2 size-auto w-64 border shadow-md"
					>
						<PromptInputCommandList>
							{mentionMatches.map((bot) => (
								<PromptInputCommandItem
									key={bot.id}
									value={bot.id}
									onSelect={() => pickMention(bot)}
									// Keep focus in the textarea.
									onMouseDown={(e) => e.preventDefault()}
								>
									<BotOption bot={bot} />
								</PromptInputCommandItem>
							))}
						</PromptInputCommandList>
					</PromptInputCommand>
				)}
				<PromptInput onSubmit={handleSubmit}>
					<PromptInputBody>
						<PromptInputTextarea
							ref={textareaRef}
							value={text}
							placeholder={
								isGroup
									? "Message the group, or @mention a bot"
									: undefined
							}
							onChange={(e) => {
								setText(e.target.value);
								updateMention(e.target.value, e.target.selectionStart);
							}}
							onSelect={(e) =>
								updateMention(
									e.currentTarget.value,
									e.currentTarget.selectionStart,
								)
							}
							onKeyDown={handleMentionKeys}
							onBlur={() => setMention(null)}
						/>
					</PromptInputBody>
					<PromptInputFooter
						className={isGroup ? undefined : "justify-end"}
					>
						{isGroup && (
							<PromptInputTools>
								<BotSelect bots={bots} botId={botId} onBotChange={onBotChange} />
							</PromptInputTools>
						)}
						<PromptInputSubmit
							status={status}
							onStop={stop}
							disabled={!text.trim() && status === "ready"}
						/>
					</PromptInputFooter>
				</PromptInput>
			</div>
		</div>
	);
}

// Picks which bot answers the next message in a group chat.
function BotSelect({
	bots,
	botId,
	onBotChange,
}: {
	bots: ChatBot[];
	botId: string | undefined;
	onBotChange: (botId: string) => void;
}) {
	return (
		<PromptInputSelect
			value={botId ?? null}
			onValueChange={(value) => {
				if (typeof value === "string") onBotChange(value);
			}}
		>
			<PromptInputSelectTrigger size="sm" aria-label="Bot to talk to">
				<PromptInputSelectValue>
					{(value: string | null) => {
						const bot = bots.find((bot) => bot.id === value);
						return bot ? <BotOption bot={bot} /> : "Pick a bot";
					}}
				</PromptInputSelectValue>
			</PromptInputSelectTrigger>
			<PromptInputSelectContent>
				{bots.map((bot) => (
					<PromptInputSelectItem key={bot.id} value={bot.id}>
						<BotOption bot={bot} />
					</PromptInputSelectItem>
				))}
			</PromptInputSelectContent>
		</PromptInputSelect>
	);
}

// An @word being typed in the composer, and the bot highlighted in its menu.
type Mention = {
	query: string;
	start: number;
	end: number;
	highlighted: string;
};

// The bot whose @name appears last in the text. Longer names are tried first
// so "@Ada Lovelace" isn't read as "@Ada".
function lastMentionedBot(text: string, bots: ChatBot[]) {
	const lower = text.toLowerCase();
	let found: { bot: ChatBot; index: number } | undefined;
	for (const bot of [...bots].sort((a, b) => b.name.length - a.name.length)) {
		const pattern = new RegExp(
			`(?:^|\\s)@${bot.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`,
			"g",
		);
		for (const match of lower.matchAll(pattern)) {
			if (!found || match.index > found.index) found = { bot, index: match.index };
		}
	}
	return found?.bot;
}

function BotOption({ bot }: { bot: ChatBot }) {
	return (
		<span className="flex items-center gap-2">
			<ChatAvatar seed={bot.avatar} className="size-4" />
			<span className="truncate">{bot.name}</span>
		</span>
	);
}

type Part = ChatUIMessage["parts"][number];
type ToolPart = Extract<Part, { type: `tool-${string}` }>;

function MessagePart({ part }: { part: Part }) {
	switch (part.type) {
		case "text":
			return <MessageResponse>{part.text}</MessageResponse>;

		case "tool-bash":
			return (
				<ToolCall part={part} title={`Run ${part.input?.command ?? "command"}`}>
					<Terminal
						output={`$ ${part.input?.command ?? ""}\n${
							part.output
								? `${part.output.output}\n[exit code ${part.output.exitCode}]`
								: ""
						}`}
						isStreaming={part.state === "input-available"}
					/>
				</ToolCall>
			);

		case "tool-readFile":
			return (
				<ToolCall part={part} title={`Read ${part.input?.path ?? "file"}`}>
					{part.output && part.input?.path && (
						<CodeBlock
							code={part.output.content}
							language={languageFor(part.input.path)}
						/>
					)}
				</ToolCall>
			);

		case "tool-writeFile":
			return (
				<ToolCall part={part} title={`Write ${part.input?.path ?? "file"}`}>
					{part.input?.path && part.input.content !== undefined && (
						<CodeBlock
							code={part.input.content}
							language={languageFor(part.input.path)}
						/>
					)}
				</ToolCall>
			);

		case "tool-listFiles":
			return (
				<ToolCall part={part} title={`List ${part.input?.path ?? "files"}`}>
					{part.output && (
						<FileTree>{renderTree(buildTree(part.output.entries))}</FileTree>
					)}
				</ToolCall>
			);

		case "tool-mouseClick":
			return (
				<ToolCall
					part={part}
					title={`${part.input?.double ? "Double-click" : "Click"} at ${point(part.input)}`}
				/>
			);

		case "tool-mouseMove":
			return <ToolCall part={part} title={`Move mouse to ${point(part.input)}`} />;

		case "tool-mouseDrag":
			return (
				<ToolCall
					part={part}
					title={`Drag from ${point({ x: part.input?.startX, y: part.input?.startY })} to ${point({ x: part.input?.endX, y: part.input?.endY })}`}
				/>
			);

		case "tool-mouseScroll":
			return (
				<ToolCall
					part={part}
					title={`Scroll ${part.input?.direction ?? ""} at ${point(part.input)}`}
				/>
			);

		case "tool-keyboardType":
			return (
				<ToolCall part={part} title="Type text">
					{part.input?.text && (
						<CodeBlock code={part.input.text} language="log" />
					)}
				</ToolCall>
			);

		case "tool-keyboardPress":
			return (
				<ToolCall
					part={part}
					title={`Press ${[...(part.input?.modifiers ?? []), part.input?.key ?? ""]
						.filter(Boolean)
						.join("+")}`}
				/>
			);

		// The bot looks at the screen for itself, so the image isn't shown.
		case "tool-viewScreen":
			return (
				<ToolCall part={part} title="Look at the screen">
					{null}
				</ToolCall>
			);

		case "tool-showScreen":
			return (
				<ToolCall part={part} title="Show the screen" defaultOpen>
					{part.output && (
						<Image
							alt="Screenshot of the bot's desktop"
							base64={part.output.data}
							mediaType={part.output.mediaType}
							// Image renders from base64 and ignores the bytes.
							uint8Array={new Uint8Array()}
						/>
					)}
				</ToolCall>
			);

		case "tool-handoff":
			return (
				<ToolCall
					part={part}
					title={`Hand off to ${part.output?.botName ?? "another bot"}`}
				>
					{part.input?.reason && (
						<p className="p-4 text-sm text-muted-foreground">
							{part.input.reason}
						</p>
					)}
				</ToolCall>
			);

		default:
			return null;
	}
}

// A tool call, collapsed unless defaultOpen. Without children it shows the
// input instead (pass null to show nothing), and it always shows an error when
// the call failed.
function ToolCall({
	part,
	title,
	defaultOpen,
	children,
}: {
	part: ToolPart;
	title: string;
	defaultOpen?: boolean;
	children?: ReactNode;
}) {
	return (
		<Tool defaultOpen={defaultOpen}>
			<ToolHeader title={title} type={part.type} state={part.state} />
			<ToolContent>
				{children === undefined ? <ToolInput input={part.input} /> : children}
				{part.state === "output-error" && (
					<ToolOutput output={undefined} errorText={part.errorText} />
				)}
			</ToolContent>
		</Tool>
	);
}

function point(input?: { x?: number; y?: number }) {
	return input?.x === undefined || input.y === undefined
		? "…"
		: `${input.x}, ${input.y}`;
}

function languageFor(path: string): BundledLanguage {
	const extension = path.split(".").pop()?.toLowerCase() ?? "";
	return extension in bundledLanguages
		? (extension as BundledLanguage)
		: "log";
}

type TreeNode = {
	name: string;
	path: string;
	isDir: boolean;
	children: TreeNode[];
};

// Nests a flat listing by path. Sorting puts each folder before its contents.
function buildTree(entries: { path: string; isDir: boolean }[]) {
	const nodes = new Map<string, TreeNode>();
	const roots: TreeNode[] = [];
	for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
		const node: TreeNode = {
			name: entry.path.split("/").pop() || entry.path,
			path: entry.path,
			isDir: entry.isDir,
			children: [],
		};
		nodes.set(entry.path, node);
		const parent = nodes.get(entry.path.slice(0, entry.path.lastIndexOf("/")));
		(parent ? parent.children : roots).push(node);
	}
	return roots;
}

function renderTree(nodes: TreeNode[]): ReactNode {
	return nodes.map((node) =>
		node.isDir ? (
			<FileTreeFolder key={node.path} path={node.path} name={node.name}>
				{renderTree(node.children)}
			</FileTreeFolder>
		) : (
			<FileTreeFile key={node.path} path={node.path} name={node.name} />
		),
	);
}
