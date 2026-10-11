<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Git

- Never create branches, worktrees, or commits automatically. Only do so when the user explicitly asks for that specific action in the current request.
- Leave changes uncommitted in the working tree on the current branch and let the user decide when and how to commit.

## Database

- Apply schema changes to the database only with `npm run db:push` (`drizzle-kit push`), after editing `db/schema.ts`.
- Never use migrations: do not run `drizzle-kit generate` or `drizzle-kit migrate`, and do not create migration files or a migrations folder.
- This is a development project. There is no backwards compatibility and the data is worthless. Prefer data loss: never backfill, migrate, or preserve existing rows, and never spend effort on keeping old data working. Every schema change means a clean slate.

## Deployment (Railway)

- The app deploys to Railway: project `ai-teammates`, service `ai-teammates`, environment `production`. Env vars on the service come from `.env.local`.
- Never set, overwrite or sync `TRIGGER_SECRET_KEY` on Railway. Production uses a different Trigger.dev key (the prod environment's) than `.env.local` (the dev environment's), and the user manages that value on Railway by hand. Skip it whenever you push env vars from `.env.local`.

## Forms

Reference implementation: `db/schema.ts` (`insertBotSchema`), `actions/bot.ts` (`createBot`), `components/bot-dialog.tsx` (`BotDialog`).

### Validation schema

- Derive form schemas from the Drizzle table with `createInsertSchema` from `drizzle-zod` (drizzle-orm 0.45 has no built-in zod support). Define the schema next to its table in `db/schema.ts` as `insert<Table>Schema`. Never hand-write a zod schema that duplicates a table.
- Put the user-facing rules in the refinements: `.trim()`, `.min(1, "message")` for required text, and `.max()` limits. Write error messages as short, complete sentences.
- `.omit()` every column the client must not set: `id`, `userId`, server-managed columns, and timestamps.
- When a column has a default but the form always provides a value (e.g. the avatar seed), override it with a plain zod schema (`z.string().min(1)`) so the value is required.
- `db/schema.ts` must stay safe to import on the client. Never import `db/index.ts` (it is `server-only`) from a form component.

### Server actions

- Put server actions in `actions/<resource>.ts` with `"use server"` at the top of the file.
- Start every action with `const { isAuthenticated, userId } = await auth()` from `@clerk/nextjs/server`. Take `userId` from Clerk, never from the client input.
- Accept `input: unknown` and validate it again with the same insert schema (`safeParse`). Server actions are public endpoints.
- Return a result union (`{ ok: true, ... } | { ok: false; error: string }`) instead of throwing for expected failures. Use `z.prettifyError()` for validation errors.
- Store optional text that is empty as `null` (`value || null`).
- Call `refresh()` from `next/cache` after a mutation. Check `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` before using other cache APIs.

### Form components

- Client components (`"use client"`) using `react-hook-form` with `zodResolver(insert<Table>Schema)` from `@hookform/resolvers/zod`. Type values as `z.input<typeof schema>`.
- Render fields with `Controller` + shadcn `Field` / `FieldLabel` / `FieldError` inside a `FieldGroup`. Set `data-invalid` on `Field` and `aria-invalid` on the control. Render `FieldError` only when `fieldState.invalid`.
- Give every control a unique `id` matched by `FieldLabel htmlFor`. Use `autoComplete="off"` on free-text inputs that aren't personal data.
- For nullable columns, pass `value={field.value ?? ""}` to the control.
- Read values the UI depends on (e.g. an avatar preview) with `useWatch`, not `form.watch`.
- Set server errors with `form.setError("root", { message })` and render them with `FieldError` at the end of the `FieldGroup`.
- Disable the submit button with `formState.isSubmitting` and show `<Spinner data-icon="inline-start" />`. Button has no loading prop.
- Give every non-submit button inside a form `type="button"`.
- On success, show a toast with `toast.add({ title, description })` from `@/components/ui/toast` (Base UI, not sonner), then close or reset.

### Dialog forms

- Use `@/components/ui/dialog` (Base UI). Custom triggers use the `render` prop, not `asChild`. Take the trigger as a `trigger: React.ReactElement` prop so server-component pages can pass their own `Button`.
- Control `open` with state. In `onOpenChange`, call `form.reset(freshValues())` when opening so every open starts clean. Generate random defaults (e.g. `nanoid()`) there, not at render time.
- Put the `<form>` inside `DialogContent` and wrap the header, fields and `DialogFooter`, so the submit button is inside the form. Cancel is `<DialogClose render={<Button type="button" variant="outline" />}>`.
- Always include `DialogTitle` and `DialogDescription`.

## DiceBear

Use DiceBear 10. Documentation: https://www.dicebear.com/llms.txt

There are seven native cores with identical output, not one library with
wrappers. Use the one matching this project's language. Do not reach for the
JavaScript core when the project is written in something else:

    JavaScript  @dicebear/core + @dicebear/styles
    PHP         dicebear/core + dicebear/styles
    Python      dicebear-core + dicebear-styles
    Rust        dicebear-core + dicebear-styles
    Go          github.com/dicebear/dicebear-go/v10 + github.com/dicebear/styles/v10
    Dart        dicebear_core + dicebear_styles
    C#          DiceBear.Core + DiceBear.Styles

Every style page carries a loading snippet for all seven, for example
https://www.dicebear.com/styles/lorelei/index.md

HTTP API: https://api.dicebear.com/10.x/<style>/svg?seed=<seed> The seed is a
query parameter, not a path segment. Options are query parameters too; array
values are separated by commas.

Options named after a component end in Variant: eyesVariant, not eyes. This
holds in all seven cores and in the HTTP API. Look up the options of a style at
https://api.dicebear.com/10.x/<style>/options.json

Write these forms, not the ones on the left. The left column is pre-10 and the
API does not reject it, so an outdated call runs and silently does the wrong
thing:

    avatars.dicebear.com/api/<style>/<seed>.svg  ->  api.dicebear.com/10.x/<style>/svg?seed=<seed>
    api.dicebear.com/9.x/<style>/svg             ->  api.dicebear.com/10.x/<style>/svg
    npm install @dicebear/collection             ->  npm install @dicebear/styles
    npm install @dicebear/lorelei                ->  npm install @dicebear/styles
    createAvatar(lorelei, { seed })              ->  new Avatar(new Style(definition), { seed })
    { eyes: ['variant01'] }                      ->  { eyesVariant: ['variant01'] }
    ?radius=50                                   ->  ?borderRadius=50

Only JavaScript and the HTTP API have a pre-10 form. The other six cores were
released in 2026 and never had one, so any older-looking PHP, Python, Rust, Go,
Dart or C# API attributed to DiceBear is invented rather than outdated.

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.agents/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`, `trigger-authoring-tasks`, `trigger-chat-agent-advanced`, `trigger-cost-savings`, `trigger-getting-started`, `trigger-realtime-and-frontend`.
<!-- TRIGGER.DEV SKILLS END -->
