import { ChatAvatar } from "@/components/chat-avatar"
import { cn } from "@/lib/utils"

// Bots shown before the rest collapse into a count.
const MAX_VISIBLE = 3

// Where each tile sits in the square, by how many tiles there are. Two overlap
// on the diagonal, three form a triangle, and four fill a 2x2 grid.
const layouts: Record<number, string[]> = {
  2: ["top-0 left-0 size-[64%]", "right-0 bottom-0 size-[64%]"],
  3: [
    "top-0 left-1/4 size-1/2",
    "bottom-0 left-0 size-1/2",
    "right-0 bottom-0 size-1/2",
  ],
  4: [
    "top-0 left-0 size-[48%]",
    "top-0 right-0 size-[48%]",
    "bottom-0 left-0 size-[48%]",
    "right-0 bottom-0 size-[48%]",
  ],
}

type GroupChatAvatarProps = {
  // Avatar seeds of the chat's bots, in display order.
  seeds: string[]
  className?: string
}

// The face of a chat. One bot shows its own avatar; more share the same square,
// so a group takes exactly the space of a single avatar wherever it's rendered.
// Size it with className, as you would a ChatAvatar.
export function GroupChatAvatar({ seeds, className }: GroupChatAvatarProps) {
  if (seeds.length <= 1) {
    return <ChatAvatar seed={seeds[0] ?? ""} className={className} />
  }

  const visible = seeds.slice(0, MAX_VISIBLE)
  const hidden = seeds.length - visible.length
  const slots = layouts[visible.length + (hidden > 0 ? 1 : 0)]

  return (
    <span
      className={cn("@container relative size-8 shrink-0", className)}
      aria-hidden
    >
      {visible.map((seed, i) => (
        <ChatAvatar
          key={`${seed}-${i}`}
          seed={seed}
          className={cn("absolute", slots[i])}
        />
      ))}
      {hidden > 0 && (
        <span
          className={cn(
            "absolute flex items-center justify-center rounded-full bg-muted text-[length:24cqw] leading-none font-medium text-muted-foreground tabular-nums",
            slots[visible.length]
          )}
        >
          +{hidden}
        </span>
      )}
    </span>
  )
}
