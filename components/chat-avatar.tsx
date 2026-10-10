import Image from "next/image"
import { Avatar, Style } from "@dicebear/core"
import sprouts from "@dicebear/styles/sprouts.json" with { type: "json" }

import { cn } from "@/lib/utils"

const style = new Style(sprouts)

type ChatAvatarProps = {
  seed: string
  animated?: boolean
  className?: string
}

export function ChatAvatar({
  seed,
  animated = false,
  className,
}: ChatAvatarProps) {
  const src = new Avatar(style, {
    seed,
    tags: animated ? ["animation"] : [],
  }).toDataUri()

  return (
    <Image
      src={src}
      alt=""
      width={32}
      height={32}
      unoptimized
      className={cn("size-8 shrink-0 rounded-full", className)}
    />
  )
}
