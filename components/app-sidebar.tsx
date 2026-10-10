"use client"

import * as React from "react"
import Link from "next/link"
import { UserButton } from "@clerk/nextjs"
import { formatDistanceToNowStrict } from "date-fns"
import { BotIcon, PlusIcon, UsersIcon } from "lucide-react"

import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  sidebarMenuButtonVariants,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import type { ChatListItem } from "@/queries/bots"

type AppSidebarProps = {
  chats: ChatListItem[]
}

export function AppSidebar({ chats }: AppSidebarProps) {
  const [botDialogOpen, setBotDialogOpen] = React.useState(false)

  return (
    <Sidebar>
      <SidebarHeader className="flex-row justify-end">
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
        <BotDialog open={botDialogOpen} onOpenChange={setBotDialogOpen} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {chats.map((chat) => (
                <SidebarMenuItem key={chat.id}>
                  <SidebarMenuButton
                    size="lg"
                    render={<Link href={`/chats/${chat.id}`} />}
                  >
                    <ChatAvatar seed={chat.bot.avatar} />
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
                    "rounded-md! text-sidebar-foreground! shadow-none! focus:shadow-none!"
                  ),
                  userButtonBox:
                    "w-full min-w-0 flex-row-reverse! justify-end gap-2!",
                  userButtonOuterIdentifier:
                    "min-w-0 flex-1 truncate ps-0! text-left text-sm! font-medium! text-inherit!",
                  userButtonAvatarBox: "size-8! rounded-lg!",
                  userButtonAvatarImage: "rounded-lg!",
                },
              }}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
