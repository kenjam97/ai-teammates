import { BotDialog } from "@/components/bot-dialog";
import { ChatAvatar } from "@/components/chat-avatar";
import { DesktopPanelToggle } from "@/components/desktop-panel";
import { GroupChatAvatar } from "@/components/group-chat-avatar";
import { Button } from "@/components/ui/button";
import type { ChatDetail } from "@/queries/chats";

type ChatHeaderProps = {
	chat: ChatDetail;
};

export function ChatHeader({ chat }: ChatHeaderProps) {
	if (chat.kind === "group") {
		return (
			<header className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
				<h1 className="flex min-w-0 items-center gap-2 text-sm font-medium">
					<GroupChatAvatar
						seeds={chat.members.map((member) => member.bot.avatar)}
						className="size-5"
					/>
					<span className="truncate">{chat.name}</span>
				</h1>
			</header>
		);
	}

	const bot = chat.members[0]?.bot;

	return (
		<header className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
			<h1 className="flex min-w-0 text-sm font-medium">
				{bot ? (
					<BotDialog
						bot={bot}
						trigger={
							<Button variant="ghost" size="sm" className="-ml-2 min-w-0 shrink">
								<ChatAvatar seed={bot.avatar} className="size-5" />
								<span className="truncate">{chat.name ?? bot.name}</span>
							</Button>
						}
					/>
				) : (
					<span className="truncate">{chat.name}</span>
				)}
			</h1>
			<DesktopPanelToggle className="ml-auto" />
		</header>
	);
}
