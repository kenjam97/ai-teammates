import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

import { Chat } from "@/components/chat";
import { ChatHeader } from "@/components/chat-header";
import {
	DesktopPanel,
	DesktopPanelProvider,
} from "@/components/desktop-panel";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { getBots } from "@/queries/bots";
import { getChat } from "@/queries/chats";

export default async function Page({
	params,
}: PageProps<"/chats/[chatId]">) {
	await auth.protect();

	const { chatId } = await params;
	const chat = await getChat(chatId);
	if (!chat) notFound();

	const bots = chat.members.map((member) => member.bot);

	// Group chats have no desktop: each bot has its own sandbox.
	if (chat.kind === "group") {
		const userBots = await getBots();

		return (
			<div className="flex h-svh flex-col">
				<ChatHeader chat={chat} bots={userBots} />
				<Chat key={chat.id} chatId={chat.id} bots={bots} />
			</div>
		);
	}

	return (
		<DesktopPanelProvider
			key={chat.id}
			chatId={chat.id}
			botName={chat.members[0]?.bot.name ?? chat.name ?? "Bot"}
		>
			{/* The group sets an inline height: 100%, so the fixed height goes on a
			    wrapper. Without it the group grows with the chat and the page
			    scrolls instead of the messages. */}
			<div className="h-svh">
				<ResizablePanelGroup>
					<ResizablePanel id="chat" minSize="30">
						<div className="flex h-full flex-col">
							<ChatHeader chat={chat} />
							<Chat key={chat.id} chatId={chat.id} bots={bots} />
						</div>
					</ResizablePanel>
					<DesktopPanel />
				</ResizablePanelGroup>
			</div>
		</DesktopPanelProvider>
	);
}
