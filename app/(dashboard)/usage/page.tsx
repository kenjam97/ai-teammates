import { auth } from "@clerk/nextjs/server";
import { format } from "date-fns";
import { GaugeIcon } from "lucide-react";
import Link from "next/link";

import { ResetCountdown } from "@/components/reset-countdown";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { db } from "@/db";
import { getUsage } from "@/lib/usage";

// Reached from the user menu in the sidebar footer.
export default async function Page() {
	const { userId } = await auth.protect();
	const usage = await getUsage(db, userId);

	if (!usage) {
		return (
			<div className="flex min-h-svh flex-col">
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<GaugeIcon />
						</EmptyMedia>
						<EmptyTitle>No usage on the free plan</EmptyTitle>
						<EmptyDescription>
							Pro comes with AI and sandbox time every month, and this page
							tracks how much is left.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button render={<Link href="/pricing" />}>See plans</Button>
					</EmptyContent>
				</Empty>
			</div>
		);
	}

	const { period } = usage;
	const { limits } = period;

	return (
		<div className="flex min-h-svh flex-col items-center px-4 py-12">
			<div className="flex w-full max-w-2xl flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
					<p className="text-muted-foreground">
						Pro plan, since {format(period.start, "MMMM d")}.{" "}
						{period.end && <ResetCountdown end={period.end} />}
					</p>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>This period</CardTitle>
						<CardDescription>
							{period.end
								? `Limits reset on ${format(period.end, "MMMM d 'at' h:mm a")}, when your plan renews.`
								: "Your plan doesn't renew, so these limits don't reset."}
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-6">
						<Meter
							label="AI usage"
							used={usage.aiCostMicros}
							limit={limits.aiCostMicros}
							detail={`${formatTokens(usage.aiTokens)} tokens used`}
						/>
						<Meter
							label="Sandbox time"
							used={usage.sandboxSeconds}
							limit={limits.sandboxSeconds}
							detail={`${formatHours(usage.sandboxSeconds)} of ${formatHours(limits.sandboxSeconds)} hours`}
						/>
						<Meter
							label="Bots"
							used={usage.bots}
							limit={limits.bots}
							detail={`${usage.bots} of ${limits.bots}`}
						/>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function Meter({
	label,
	used,
	limit,
	detail,
}: {
	label: string;
	used: number;
	limit: number;
	detail: string;
}) {
	const percent = Math.min(100, Math.round((used / limit) * 100));

	return (
		<Progress value={percent}>
			<ProgressLabel>{label}</ProgressLabel>
			<span className="ml-auto text-sm text-muted-foreground tabular-nums">
				{detail} · {percent}%
			</span>
		</Progress>
	);
}

const tokenFormat = new Intl.NumberFormat("en", { notation: "compact" });

function formatTokens(tokens: number) {
	return tokenFormat.format(tokens);
}

function formatHours(seconds: number) {
	return (seconds / 3600).toFixed(1).replace(/\.0$/, "");
}
