"use client"

import { formatDuration, intervalToDuration } from "date-fns"
import { useEffect, useState } from "react"

// Time left until the usage limits reset, kept current while the page is open.
export function ResetCountdown({ end }: { end: Date }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const left =
    end.getTime() > now
      ? formatDuration(intervalToDuration({ start: now, end }), {
          format: ["days", "hours", "minutes"],
        })
      : ""

  return (
    // The server and the browser render at different moments.
    <span suppressHydrationWarning>
      {left ? `Resets in ${left}` : "Resetting now"}
    </span>
  )
}
