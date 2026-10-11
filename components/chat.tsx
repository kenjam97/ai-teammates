"use client";

import { useChat } from "@ai-sdk/react";
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat";
import {
	useLoadTranscript,
	useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react";
import type { UIMessage } from "ai";
import { useState } from "react";

import {
	loadTranscript,
	mintChatAccessToken,
	startChatSession,
} from "@/actions/chat";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
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
	PromptInputSubmit,
	PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Spinner } from "@/components/ui/spinner";
import type { chatAgent } from "@/trigger/chat";

type ChatProps = {
	chatId: string;
};

export function Chat({ chatId }: ChatProps) {
	const transport = useTriggerChatTransport<typeof chatAgent>({
		task: "chat",
		accessToken: ({ chatId }) => mintChatAccessToken(chatId),
		startSession: ({ chatId }) => startChatSession({ chatId }),
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
			initialMessages={messages}
		/>
	);
}

type ChatViewProps = {
	chatId: string;
	transport: TriggerChatTransport;
	initialMessages: UIMessage[];
};

function ChatView({ chatId, transport, initialMessages }: ChatViewProps) {
	const [text, setText] = useState("");
	const { messages, status, sendMessage, stop } = useChat({
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
				<ConversationContent className="mx-auto w-full max-w-3xl">
					{messages.map((message) => (
						<Message from={message.role} key={message.id}>
							<MessageContent>
								{message.parts.map((part, i) =>
									part.type === "text" ? (
										<MessageResponse key={`${message.id}-${i}`}>
											{part.text}
										</MessageResponse>
									) : null,
								)}
							</MessageContent>
						</Message>
					))}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			<div className="mx-auto w-full max-w-3xl p-4 pt-0">
				<PromptInput onSubmit={handleSubmit}>
					<PromptInputBody>
						<PromptInputTextarea
							value={text}
							onChange={(e) => setText(e.target.value)}
						/>
					</PromptInputBody>
					<PromptInputFooter className="justify-end">
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
