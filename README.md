# AI Teammates

Create AI teammates ("bots"), give each one a job, and chat with them alone or in group chats. Every bot has its own cloud computer: a Daytona sandbox with a shell, a filesystem and a 1024×768 desktop. Bots use tools to work in that sandbox, and you can watch the desktop live from the chat.

## Features

- **Bots**: each has a name, a generated face (DiceBear), a job, and optional instructions. A sandbox is created with the bot and deleted with it.
- **Direct chats**: every bot gets a private chat when it's created.
- **Group chats**: put two or more bots in one chat. You pick which bot answers each message, or @mention one. A bot can hand a message off to a teammate whose job fits it better.
- **Sandbox tools**: `bash`, `readFile`, `writeFile`, `listFiles`, mouse and keyboard control, and `viewScreen` / `showScreen` for screenshots.
- **Desktop panel**: a live noVNC view of the bot's sandbox desktop, next to the chat.
- **Memory**: each bot keeps notes in `/home/daytona/MEMORY.md` in its sandbox, so what it learns in one chat carries over to the others.
- **Billing**: a free plan and a $20/month Pro plan through Clerk Billing. Pro usage is metered in a ledger (AI tokens and sandbox running time) and capped per billing period. The usage page shows where it went.

## Tech stack

| Area           | Tool                                                                         |
| -------------- | ---------------------------------------------------------------------------- |
| App            | Next.js 16 (App Router), React 19, TypeScript                                |
| UI             | Tailwind CSS 4, shadcn/ui on Base UI, AI Elements                            |
| Auth & billing | Clerk (`@clerk/nextjs`, Clerk Billing)                                       |
| Database       | Postgres (Neon) with Drizzle ORM and `drizzle-zod`                           |
| AI             | AI SDK 7 with Google Gemini (`gemini-3.5-flash-lite`)                        |
| Agent runtime  | Trigger.dev `chat.agent` (durable chat runs, realtime streaming to the page) |
| Sandboxes      | Daytona                                                                      |
| Hosting        | Railway (web app), Trigger.dev Cloud (tasks)                                 |

## How it works

```
Browser (useChat + Trigger.dev transport)
   │  start session / mint token          ┌──────────────────────────┐
   ├────────────── server actions ───────▶│ Next.js on Railway       │
   │                                      │ actions/, queries/, db/  │
   │  stream messages                     └──────────────────────────┘
   └──────────── realtime ──────────────▶ ┌──────────────────────────┐
                                          │ Trigger.dev worker       │
                                          │ trigger/chat.ts (agent)  │──▶ Gemini
                                          │ trigger/meter-sandboxes  │──▶ Daytona sandboxes
                                          └──────────────────────────┘
                                   both read and write Postgres
```

- The **Next.js app** handles pages, auth and the server actions that create bots and chats, start chat sessions and mint realtime tokens.
- The **chat agent** (`trigger/chat.ts`) runs each turn on Trigger.dev. It loads the chat and its bots, works out who answers (a handoff, the bot picked in the composer, or the only bot in a direct chat), builds the system prompt, checks the user's allowance, streams the model's reply with tools, and records token usage.
- **`meter-sandboxes`** is a scheduled task that runs every five minutes. It charges each running sandbox to its owner and stops sandboxes for users who are over their limit or no longer on Pro. Sandboxes stop on their own after 15 idle minutes.

## Project layout

```
actions/       Server actions: bots, chats, desktop URL, usage
app/           Routes: dashboard, chats/[chatId], pricing, usage, sign-in/up
components/    App components; ui/ (shadcn) and ai-elements/ are generated
db/            Drizzle schema (client-safe) and the server-only client
lib/           Billing rules, allowance checks, metering prices, usage ledger, Daytona helpers
queries/       Server-side reads for pages
trigger/       Trigger.dev tasks: chat agent, tools, sandbox metering
proxy.ts       Clerk middleware
```

## Getting started

### Prerequisites

- Node.js 24 (the Trigger.dev worker runs on `node-24`)
- Accounts for [Clerk](https://clerk.com), [Neon](https://neon.tech) (or any Postgres), [Trigger.dev](https://trigger.dev), [Daytona](https://daytona.io), and a [Google AI Studio](https://aistudio.google.com) API key

### 1. Install

```bash
npm install
```

### 2. Configure the environment

Create `.env.local`:

```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/

# Postgres: pooled for the app, direct for drizzle-kit
DATABASE_URL=
DATABASE_URL_UNPOOLED=

# Gemini
GOOGLE_GENERATIVE_AI_API_KEY=

# Trigger.dev (the dev environment's secret key)
TRIGGER_SECRET_KEY=

# Daytona
DAYTONA_API_KEY=
DAYTONA_API_URL=
```

The Trigger.dev worker doesn't read `.env.local` in production. Set `DATABASE_URL`, `CLERK_SECRET_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `DAYTONA_API_KEY` and `DAYTONA_API_URL` on the project's environments in the Trigger.dev dashboard too.

### 3. Set up Clerk Billing

In the Clerk dashboard, enable Billing for users and create a plan with the slug `pro` that has the features `bots` and `sandboxes`. The free plan has neither. The slug and feature keys must match `lib/billing.ts`.

### 4. Create the database tables

```bash
npm run db:push
```

### 5. Run it

Run the Next.js app and the Trigger.dev dev worker in two terminals:

```bash
npm run dev
```

```bash
npx trigger.dev@latest dev
```

Open http://localhost:3000, sign in, subscribe to Pro, and create a bot.

## Scripts

| Command             | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Start the Next.js dev server               |
| `npm run build`     | Build for production                       |
| `npm run start`     | Serve the production build                 |
| `npm run lint`      | Run ESLint                                 |
| `npm run typecheck` | Type-check with `tsc --noEmit`             |
| `npm run format`    | Format `.ts` / `.tsx` files with Prettier  |
| `npm run db:push`   | Push `db/schema.ts` to the database        |
| `npm run db:studio` | Open Drizzle Studio                        |

## Database

Four tables, defined in `db/schema.ts`:

- `bots`: a user's bots, each with its Daytona `sandbox_id`
- `chats`: direct and group chats
- `chat_members`: which bots are in which chat
- `usage_events`: the append-only usage ledger (`ai` tokens or `sandbox` seconds, with the cost in millionths of a dollar)

Schema changes go through `npm run db:push` only. The project doesn't use migrations, and existing data isn't preserved across schema changes.

## Billing and limits

The Pro plan's limits per billing period are in `lib/billing.ts`:

| Limit           | Pro         |
| --------------- | ----------- |
| AI spend        | $6.00       |
| Sandbox time    | 50 hours    |
| Bots            | 10          |

Prices for Gemini tokens and Daytona compute are in `lib/metering.ts`. If you change `CHAT_MODEL`, update its prices there too. A period's usage is the sum of ledger rows since the period started, so the allowance resets when the subscription renews.

## Deployment

- **Web app**: Railway project `ai-teammates`, service `ai-teammates`, environment `production`. Service variables come from `.env.local`, except `TRIGGER_SECRET_KEY`, which uses the Trigger.dev production key and is managed by hand on Railway.
- **Tasks**: deploy the `trigger/` directory to Trigger.dev:

  ```bash
  npx trigger.dev@latest deploy
  ```

## Contributing

Conventions for forms, server actions, the database and git are in [AGENTS.md](AGENTS.md). In short: derive form schemas from Drizzle tables with `drizzle-zod`, validate again in every server action, and leave commits to the person making the change.
