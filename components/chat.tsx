"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";

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

type ChatProps = {
	chatId: string;
};

export function Chat({ chatId }: ChatProps) {
	const [text, setText] = useState("");
	const { messages, status, sendMessage, stop } = useChat({ id: chatId });

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
