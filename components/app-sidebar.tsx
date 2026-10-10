"use client";

import { UserButton } from "@clerk/nextjs";
import { formatDistanceToNowStrict } from "date-fns";
import { BotIcon, PlusIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { BotDialog } from "@/components/bot-dialog";
import { ChatAvatar } from "@/components/chat-avatar";
import { ChatSearch } from "@/components/chat-search";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	sidebarMenuButtonVariants,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { ChatListItem } from "@/queries/bots";

type AppSidebarProps = {
	chats: ChatListItem[];
};

export function AppSidebar({ chats }: AppSidebarProps) {
	const [botDialogOpen, setBotDialogOpen] = React.useState(false);

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<div className="flex justify-end">
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button variant="ghost" size="icon" aria-label="New chat" />
							}
						>
							<PlusIcon />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-auto">
							<DropdownMenuItem onClick={() => setBotDialogOpen(true)}>
								<BotIcon />
								Create a new bot
							</DropdownMenuItem>
							<DropdownMenuItem>
								<UsersIcon />
								Create a group chat
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<BotDialog open={botDialogOpen} onOpenChange={setBotDialogOpen} />
				<ChatSearch chats={chats} />
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu className="group-data-[collapsible=icon]:gap-2">
							{chats.map((chat) => (
								<SidebarMenuItem key={chat.id}>
									<SidebarMenuButton
										size="lg"
										tooltip={chat.name ?? chat.bot.name}
										render={<Link href={`/chats/${chat.id}`} />}
										className="group-data-[collapsible=icon]:p-2!"
									>
										<ChatAvatar
											seed={chat.bot.avatar}
											className="group-data-[collapsible=icon]:size-4"
										/>
										<div className="grid min-w-0 flex-1 leading-tight">
											<div className="flex items-baseline gap-2">
												<span className="flex-1 truncate font-medium">
													{chat.name ?? chat.bot.name}
												</span>
												<time
													dateTime={chat.lastMessagedAt.toISOString()}
													className="shrink-0 text-xs text-muted-foreground"
													// Relative time differs between server and client
													suppressHydrationWarning
												>
													{formatDistanceToNowStrict(chat.lastMessagedAt)}
												</time>
											</div>
											<span className="truncate text-xs text-muted-foreground">
												{chat.lastMessagePreview}
											</span>
										</div>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<UserButton
							showName
							appearance={{
								elements: {
									rootBox: "w-full",
									userButtonTrigger: cn(
										sidebarMenuButtonVariants({ size: "lg" }),
										"rounded-md! text-sidebar-foreground! shadow-none! focus:shadow-none! group-data-[collapsible=icon]:p-2!",
									),
									userButtonBox:
										"w-full min-w-0 flex-row-reverse! justify-end gap-2!",
									userButtonOuterIdentifier:
										"min-w-0 flex-1 truncate ps-0! text-left text-sm! font-medium! text-inherit!",
									userButtonAvatarBox:
										"size-8! rounded-lg! group-data-[collapsible=icon]:size-4!",
									userButtonAvatarImage: "rounded-lg!",
								},
							}}
						/>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
