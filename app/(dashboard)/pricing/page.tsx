import { PricingTable } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

// Reached from the upgrade toast, not the sidebar.
export default async function Page() {
	await auth.protect();

	return (
		<div className="flex min-h-svh flex-col items-center gap-8 px-4 py-12">
			<div className="flex max-w-xl flex-col items-center gap-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					Pick a plan
				</h1>
				<p className="text-muted-foreground">
					Pro unlocks bots and their sandboxes: create bots, chat with them,
					and use their desktops.
				</p>
			</div>
			<div className="w-full max-w-3xl">
				<PricingTable newSubscriptionRedirectUrl="/" />
			</div>
		</div>
	);
}
