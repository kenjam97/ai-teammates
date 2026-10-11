import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

import { Chat } from "@/components/chat";
import { ChatHeader } from "@/components/chat-header";
import {
	DesktopPanel,
	DesktopPanelProvider,
} from "@/components/desktop-panel";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { getChat } from "@/queries/chats";

export default async function Page({
	params,
}: PageProps<"/chats/[chatId]">) {
	await auth.protect();

	const { chatId } = await params;
	const chat = await getChat(chatId);
	if (!chat) notFound();

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
							<Chat key={chat.id} chatId={chat.id} />
						</div>
					</ResizablePanel>
					<DesktopPanel />
				</ResizablePanelGroup>
			</div>
		</DesktopPanelProvider>
	);
}
