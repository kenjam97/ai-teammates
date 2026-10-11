"use client";

import { cn } from "cn";
import { MonitorIcon, RefreshCwIcon } from "lucide-react";
import { createContext, use, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { getDesktopUrl } from "@/actions/desktop";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable";
import { Spinner } from "@/components/ui/spinner";
import { useBillingGate, useBillingToast } from "@/components/billing-gate";
import { isBillingError } from "@/lib/billing";

type Desktop =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; url: string }
	| { status: "error"; error: string };

type DesktopPanelContextValue = {
	open: boolean;
	toggle: () => void;
	botName: string;
	desktop: Desktop;
	reload: () => void;
	fullscreen: boolean;
	setFullscreen: (fullscreen: boolean) => void;
	setPanelSlot: (slot: HTMLElement | null) => void;
	setDialogSlot: (slot: HTMLElement | null) => void;
};

const DesktopPanelContext = createContext<DesktopPanelContextValue | null>(
	null,
);

function useDesktopPanel() {
	const context = use(DesktopPanelContext);
	if (!context) {
		throw new Error("useDesktopPanel must be used within DesktopPanelProvider.");
	}
	return context;
}

// Owns the desktop for one chat. The VNC viewer loads the first time the panel
// opens and then stays mounted, so closing and reopening the panel or going
// fullscreen never reconnects.
export function DesktopPanelProvider({
	chatId,
	botName,
	children,
}: {
	chatId: string;
	botName: string;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const [fullscreen, setFullscreen] = useState(false);
	const [desktop, setDesktop] = useState<Desktop>({ status: "idle" });
	// Bumped to remount the iframe when the person asks for a reload.
	const [viewerKey, setViewerKey] = useState(0);
	const [panelSlot, setPanelSlot] = useState<HTMLElement | null>(null);
	const [dialogSlot, setDialogSlot] = useState<HTMLElement | null>(null);
	const showBillingToast = useBillingToast();
	const checkBilling = useBillingGate();

	async function load() {
		setDesktop({ status: "loading" });
		try {
			const result = await getDesktopUrl(chatId);
			if (isBillingError(result)) showBillingToast(result);
			setDesktop(
				result.ok
					? { status: "ready", url: result.url }
					: { status: "error", error: result.error },
			);
		} catch {
			setDesktop({
				status: "error",
				error: "The desktop couldn't be started. Try again.",
			});
		}
	}

	async function toggle() {
		// Don't open the panel at all without the plan or sandbox time left.
		if (!open && !(await checkBilling("desktop"))) return;
		if (!open && desktop.status === "idle") load();
		setOpen(!open);
	}

	// Reconnects the viewer once it has loaded, or tries loading again.
	function reload() {
		if (desktop.status === "ready") setViewerKey((key) => key + 1);
		else load();
	}

	return (
		<DesktopPanelContext
			value={{
				open,
				toggle,
				botName,
				desktop,
				reload,
				fullscreen,
				setFullscreen,
				setPanelSlot,
				setDialogSlot,
			}}
		>
			{children}
			<DesktopDialog />
			{desktop.status === "ready" && (
				<DesktopViewer
					key={viewerKey}
					url={desktop.url}
					panelSlot={open ? panelSlot : null}
					dialogSlot={dialogSlot}
				/>
			)}
		</DesktopPanelContext>
	);
}

export function DesktopPanelToggle({ className }: { className?: string }) {
	const { open, toggle } = useDesktopPanel();

	return (
		<Button
			variant={open ? "secondary" : "ghost"}
			size="icon-sm"
			aria-label="Desktop"
			aria-pressed={open}
			className={className}
			onClick={toggle}
		>
			<MonitorIcon />
		</Button>
	);
}

export function DesktopPanel() {
	const { open, botName, desktop, reload, setFullscreen, setPanelSlot } =
		useDesktopPanel();
	if (!open) return null;

	return (
		<>
			<ResizableHandle />
			<ResizablePanel id="desktop" defaultSize="50" minSize="25">
				<div className="flex flex-col items-center gap-3 px-6 pt-2 pb-6">
					<div className="flex w-full justify-end">
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Reload desktop"
							disabled={desktop.status === "loading"}
							onClick={reload}
						>
							<RefreshCwIcon />
						</Button>
					</div>
					<div className="w-full max-w-2xl rounded-xl border bg-card p-2 shadow-sm">
						{desktop.status === "ready" ? (
							// The viewer is drawn over this button without taking pointer
							// events, so a click anywhere on the preview lands here.
							<button
								ref={setPanelSlot}
								type="button"
								aria-label="Open desktop in fullscreen"
								className="block aspect-4/3 w-full cursor-zoom-in rounded-md bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onClick={() => setFullscreen(true)}
							/>
						) : (
							<div className="flex aspect-4/3 w-full items-center justify-center rounded-md bg-muted p-4">
								<DesktopStatus />
							</div>
						)}
					</div>
					<p className="text-sm text-muted-foreground">
						{botName}&apos;s screen
					</p>
				</div>
			</ResizablePanel>
		</>
	);
}

function DesktopStatus() {
	const { desktop } = useDesktopPanel();

	if (desktop.status === "error") {
		return (
			<p className="text-center text-sm text-muted-foreground">
				{desktop.error}
			</p>
		);
	}

	return (
		<div className="flex items-center gap-2 text-sm text-muted-foreground">
			<Spinner />
			Starting the desktop…
		</div>
	);
}

function DesktopDialog() {
	const { botName, fullscreen, setFullscreen, setDialogSlot } =
		useDesktopPanel();

	return (
		<Dialog
			open={fullscreen}
			// Not modal: a modal dialog makes everything outside it inert, which
			// would include the viewer drawn over it.
			modal={false}
			disablePointerDismissal
			onOpenChange={(nextOpen, eventDetails) => {
				// Only the close button closes it. Escape, outside clicks and focus
				// moves are easy to trigger by accident while using the desktop.
				if (!nextOpen && eventDetails.reason !== "close-press") {
					eventDetails.cancel();
					return;
				}
				setFullscreen(nextOpen);
			}}
		>
			<DialogContent className="flex h-[calc(100svh-2rem)] max-w-[calc(100%-2rem)] flex-col sm:max-w-[calc(100%-2rem)]">
				<DialogHeader>
					<DialogTitle>Desktop</DialogTitle>
					<DialogDescription>
						{botName}&apos;s sandbox. Use the mouse and keyboard to control it.
					</DialogDescription>
				</DialogHeader>
				<div ref={setDialogSlot} className="min-h-0 flex-1 rounded-lg bg-muted" />
			</DialogContent>
		</Dialog>
	);
}

// The one VNC iframe. Moving an iframe in the DOM reloads it, so it stays in
// a fixed layer on <body> and is drawn over whichever slot is showing: the
// dialog while it is open, otherwise the panel, otherwise nothing.
function DesktopViewer({
	url,
	panelSlot,
	dialogSlot,
}: {
	url: string;
	panelSlot: HTMLElement | null;
	dialogSlot: HTMLElement | null;
}) {
	const layerRef = useRef<HTMLDivElement>(null);
	const slot = dialogSlot ?? panelSlot;

	// Follow the slot every frame: it moves and resizes with panel drags and
	// the dialog's open animation, which no observer reports.
	useEffect(() => {
		const layer = layerRef.current;
		if (!layer) return;
		if (!slot) {
			layer.style.visibility = "hidden";
			return;
		}

		let last = "";
		let frame = 0;
		const follow = () => {
			const { left, top, width, height } = slot.getBoundingClientRect();
			const next = `${left},${top},${width},${height}`;
			if (next !== last) {
				last = next;
				Object.assign(layer.style, {
					visibility: "visible",
					transform: `translate(${left}px, ${top}px)`,
					width: `${width}px`,
					height: `${height}px`,
				});
			}
			frame = requestAnimationFrame(follow);
		};
		follow();
		return () => cancelAnimationFrame(frame);
	}, [slot]);

	return createPortal(
		<div
			ref={layerRef}
			className={cn(
				"invisible fixed top-0 left-0 overflow-hidden",
				// Over the dialog it takes input. Over the panel it stays under
				// other popups and lets clicks through to the slot's button.
				slot === dialogSlot
					? "z-60 rounded-lg"
					: "pointer-events-none z-40 rounded-md",
			)}
		>
			<iframe
				src={url}
				title="Desktop"
				allow="clipboard-read; clipboard-write"
				className="size-full border-0"
			/>
		</div>,
		document.body,
	);
}
