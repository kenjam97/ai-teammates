"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { SearchIcon } from "lucide-react"

import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import type { ChatListItem } from "@/queries/bots"

type ChatSearchProps = {
  chats: ChatListItem[]
}

export function ChatSearch({ chats }: ChatSearchProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  function openChat(chatId: string) {
    setOpen(false)
    router.push(`/chats/${chatId}`)
  }

  return (
    <>
      {/* Looks like an <Input />, behaves like a ghost <Button />. */}
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        className="h-8 w-full min-w-0 justify-start rounded-lg border border-input bg-transparent px-2.5 py-1 text-base font-normal text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent dark:group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0"
      >
        <SearchIcon />
        <span className="group-data-[collapsible=icon]:sr-only">Search</span>
        <KbdGroup className="ml-auto group-data-[collapsible=icon]:hidden">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search chats"
        description="Search your chats by name."
      >
        <Command>
          <CommandInput placeholder="Search chats..." />
          <CommandList>
            <CommandEmpty>No chats found.</CommandEmpty>
            <CommandGroup heading="Chats">
              {chats.map((chat) => (
                <CommandItem
                  key={chat.id}
                  value={chat.id}
                  keywords={[chat.name]}
                  onSelect={() => openChat(chat.id)}
                >
                  <GroupChatAvatar
                    seeds={chat.bots.map((bot) => bot.avatar)}
                    className="size-6"
                  />
                  <span className="truncate">{chat.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
