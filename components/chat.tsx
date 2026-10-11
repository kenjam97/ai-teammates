"use client";

import { useChat } from "@ai-sdk/react";
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat";
import {
	useLoadTranscript,
	useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react";
import { type ReactNode, useState } from "react";
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
import { Spinner } from "@/components/ui/spinner";
import type { Bot } from "@/db/schema";
import type { chatAgent } from "@/trigger/chat";
import type { ChatUIMessage } from "@/trigger/sandbox-tools";

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
	const { messages, status, sendMessage, stop } = useChat<ChatUIMessage>({
		id: chatId,
		messages: initialMessages,
		transport,
	});

	function handleSubmit(message: PromptInputMessage) {
		if (!message.text.trim()) return;
		sendMessage({ text: message.text });
		setText("");
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<Conversation>
				<ConversationContent>
					{messages.map((message) => (
						<Message from={message.role} key={message.id}>
							<MessageContent>
								{message.parts.map((part, i) => (
									<MessagePart key={`${message.id}-${i}`} part={part} />
								))}
							</MessageContent>
						</Message>
					))}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			<div className="p-4 pt-0">
				<PromptInput onSubmit={handleSubmit}>
					<PromptInputBody>
						<PromptInputTextarea
							value={text}
							onChange={(e) => setText(e.target.value)}
						/>
					</PromptInputBody>
					<PromptInputFooter
						className={bots.length > 1 ? undefined : "justify-end"}
					>
						{bots.length > 1 && (
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

		default:
			return null;
	}
}

// A collapsible tool call. Without children it shows the input instead (pass
// null to show nothing), and it always shows an error when the call failed.
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
