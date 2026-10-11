import { BotDialog } from "@/components/bot-dialog";
import { ChatAvatar } from "@/components/chat-avatar";
import { DesktopPanelToggle } from "@/components/desktop-panel";
import { GroupChatAvatar } from "@/components/group-chat-avatar";
import { GroupChatDialog } from "@/components/group-chat-dialog";
import { Button } from "@/components/ui/button";
import type { Bot } from "@/db/schema";
import type { ChatDetail } from "@/queries/chats";

type ChatHeaderProps = {
	chat: ChatDetail;
	// The user's bots, offered as members when editing a group chat.
	bots?: Pick<Bot, "id" | "name" | "avatar">[];
};

export function ChatHeader({ chat, bots = [] }: ChatHeaderProps) {
	if (chat.kind === "group") {
		const name = chat.name ?? "Group chat";

		return (
			<header className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
				<h1 className="flex min-w-0 text-sm font-medium">
					<GroupChatDialog
						bots={bots}
						chat={{
							id: chat.id,
							name,
							botIds: chat.members.map((member) => member.bot.id),
						}}
						trigger={
							<Button variant="ghost" size="sm" className="-ml-2 min-w-0 shrink">
								<GroupChatAvatar
									seeds={chat.members.map((member) => member.bot.avatar)}
									className="size-5"
								/>
								<span className="truncate">{name}</span>
							</Button>
						}
					/>
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
