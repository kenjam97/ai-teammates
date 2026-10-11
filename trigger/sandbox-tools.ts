import { Daytona, type Sandbox } from "@daytona/sdk";
import { tool } from "ai";
import { z } from "zod";

// Pass the config explicitly: the SDK refuses to read DAYTONA_API_URL from the
// environment when it was loaded from .env.local, as `trigger dev` does.
const daytona = new Daytona({
  apiKey: process.env.DAYTONA_API_KEY,
  apiUrl: process.env.DAYTONA_API_URL,
});

// Output past this is cut so one noisy command can't flood the context.
const MAX_OUTPUT_CHARS = 20_000;

function truncate(text: string) {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `[…${text.length - MAX_OUTPUT_CHARS} characters cut]\n${text.slice(-MAX_OUTPUT_CHARS)}`;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

// Gets the sandbox and starts it if it has stopped or been archived.
async function connect(sandboxId: string) {
  const sandbox = await daytona.get(sandboxId);
  if (sandbox.state !== "started") await sandbox.start();
  return sandbox;
}

// Starts the desktop (Xvfb, xfce4, VNC) if it isn't running. Starting it again
// is harmless, so this only skips the call when it is already up.
async function startDesktop(sandbox: Sandbox) {
  const { status } = await sandbox.computerUse.getStatus();
  if (status !== "active") await sandbox.computerUse.start();
  return sandbox;
}

// Caches a promise for the rest of the turn, but retries after a failure.
function lazy<T>(load: () => Promise<T>) {
  let promise: Promise<T> | undefined;
  return () =>
    (promise ??= load().catch((error) => {
      promise = undefined;
      throw error;
    }));
}

async function takeScreenshot(sandbox: Sandbox) {
  const { screenshot } = await sandbox.computerUse.screenshot.takeCompressed({
    format: "jpeg",
    quality: 70,
    showCursor: true,
  });
  if (!screenshot) throw new Error("The screenshot came back empty.");
  return { mediaType: "image/jpeg", data: screenshot };
}

const point = {
  x: z.number().int().min(0).describe("Pixels from the left of the screen."),
  y: z.number().int().min(0).describe("Pixels from the top of the screen."),
};

// The bot's tools, bound to its sandbox. Nothing connects until a tool runs.
export function createSandboxTools(getSandboxId: () => Promise<string>) {
  const getSandbox = lazy(async () => connect(await getSandboxId()));
  const getDesktop = lazy(async () => startDesktop(await getSandbox()));

  return {
    bash: tool({
      description:
        "Run a bash command in your sandbox and get its exit code and output (stdout and stderr). Commands run as the user daytona, in /home/daytona unless you pass cwd.",
      inputSchema: z.object({
        command: z.string().min(1),
        cwd: z.string().optional().describe("Working directory."),
        timeoutSeconds: z
          .number()
          .int()
          .min(1)
          .max(600)
          .optional()
          .describe("Defaults to 60. Run longer jobs in the background."),
      }),
      execute: async ({ command, cwd, timeoutSeconds = 60 }) => {
        const sandbox = await getSandbox();
        const { exitCode, result } = await sandbox.process.executeCommand(
          command,
          cwd,
          undefined,
          timeoutSeconds,
        );
        return { exitCode, output: truncate(result) };
      },
    }),

    readFile: tool({
      description: "Read a text file from your sandbox.",
      inputSchema: z.object({
        path: z.string().min(1).describe("Absolute, or relative to /home/daytona."),
      }),
      execute: async ({ path }) => {
        const sandbox = await getSandbox();
        const content = await sandbox.fs.downloadFile(path);
        return { content: truncate(content.toString("utf8")) };
      },
    }),

    writeFile: tool({
      description:
        "Write a text file in your sandbox, creating missing folders. Replaces the file if it exists.",
      inputSchema: z.object({
        path: z.string().min(1).describe("Absolute, or relative to /home/daytona."),
        content: z.string(),
      }),
      execute: async ({ path, content }) => {
        const sandbox = await getSandbox();
        const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
        if (folder) {
          await sandbox.process.executeCommand(`mkdir -p ${shellQuote(folder)}`);
        }
        const data = Buffer.from(content, "utf8");
        await sandbox.fs.uploadFile(data, path);
        return { bytes: data.length };
      },
    }),

    listFiles: tool({
      description: "List the files and folders in a folder in your sandbox.",
      inputSchema: z.object({
        path: z
          .string()
          .min(1)
          .default("/home/daytona")
          .describe("Absolute, or relative to /home/daytona."),
        depth: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe("How many levels deep to list. Defaults to 1."),
      }),
      execute: async ({ path, depth }) => {
        const sandbox = await getSandbox();
        const files = await sandbox.fs.listFiles(path, { depth });
        return {
          entries: files.slice(0, 500).map((file) => ({
            path: file.path ?? file.name,
            isDir: file.isDir,
            size: file.size,
          })),
          truncated: files.length > 500,
        };
      },
    }),

    mouseClick: tool({
      description: "Click the mouse at a point on the screen.",
      inputSchema: z.object({
        ...point,
        button: z.enum(["left", "right", "middle"]).default("left"),
        double: z.boolean().default(false).describe("Double-click."),
      }),
      execute: async ({ x, y, button, double }) => {
        const sandbox = await getDesktop();
        await sandbox.computerUse.mouse.click(x, y, button, double);
        return { ok: true };
      },
    }),

    mouseMove: tool({
      description: "Move the mouse to a point on the screen, e.g. to hover.",
      inputSchema: z.object(point),
      execute: async ({ x, y }) => {
        const sandbox = await getDesktop();
        await sandbox.computerUse.mouse.move(x, y);
        return { ok: true };
      },
    }),

    mouseDrag: tool({
      description: "Drag with the left mouse button from one point to another.",
      inputSchema: z.object({
        startX: point.x,
        startY: point.y,
        endX: point.x,
        endY: point.y,
      }),
      execute: async ({ startX, startY, endX, endY }) => {
        const sandbox = await getDesktop();
        await sandbox.computerUse.mouse.drag(startX, startY, endX, endY);
        return { ok: true };
      },
    }),

    mouseScroll: tool({
      description: "Scroll the mouse wheel at a point on the screen.",
      inputSchema: z.object({
        ...point,
        direction: z.enum(["up", "down", "left", "right"]),
        amount: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(3)
          .describe("Wheel notches. Each moves a few lines."),
      }),
      execute: async ({ x, y, direction, amount }) => {
        const sandbox = await getDesktop();
        await sandbox.computerUse.mouse.scroll(x, y, direction, amount);
        return { ok: true };
      },
    }),

    keyboardType: tool({
      description:
        "Type text into whatever has keyboard focus. Newlines press Enter. Click the target first.",
      inputSchema: z.object({ text: z.string().min(1) }),
      execute: async ({ text }) => {
        const sandbox = await getDesktop();
        await sandbox.computerUse.keyboard.type(text);
        return { ok: true };
      },
    }),

    keyboardPress: tool({
      description:
        "Press a key, optionally with modifiers. Keys: enter, escape, tab, backspace, delete, space, up, down, left, right, home, end, pageup, pagedown, f1-f24, a-z, 0-9 and punctuation.",
      inputSchema: z.object({
        key: z.string().min(1),
        modifiers: z.array(z.enum(["ctrl", "alt", "shift", "cmd"])).optional(),
      }),
      execute: async ({ key, modifiers }) => {
        const sandbox = await getDesktop();
        await sandbox.computerUse.keyboard.press(key, modifiers);
        return { ok: true };
      },
    }),

    viewScreen: tool({
      description:
        "Take a screenshot so you can see the screen. Only you see it. Use it before acting on the screen and to check the result afterwards.",
      inputSchema: z.object({}),
      execute: async () => takeScreenshot(await getDesktop()),
      toModelOutput: ({ output }) => ({
        type: "content",
        value: [
          {
            type: "file",
            mediaType: output.mediaType,
            data: { type: "data", data: output.data },
          },
        ],
      }),
    }),

    showScreen: tool({
      description:
        "Take a screenshot and show it to the person you're chatting with. Use it only when they ask to see the screen. You see it too.",
      inputSchema: z.object({}),
      execute: async () => takeScreenshot(await getDesktop()),
      toModelOutput: ({ output }) => ({
        type: "content",
        value: [
          { type: "text", text: "The screenshot is shown in the chat." },
          {
            type: "file",
            mediaType: output.mediaType,
            data: { type: "data", data: output.data },
          },
        ],
      }),
    }),
  };
}

export type SandboxTools = ReturnType<typeof createSandboxTools>;
