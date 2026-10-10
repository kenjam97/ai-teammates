import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { createInsertSchema } from "drizzle-zod"
import { nanoid } from "nanoid"
import { z } from "zod"

export const bots = pgTable(
  "bots",
  {
    id: text("id").primaryKey().$defaultFn(() => nanoid()),
    // Clerk user ID (e.g. "user_2abc...")
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    // Seed for the generated bot face
    avatar: text("avatar")
      .notNull()
      .$defaultFn(() => nanoid()),
    // What the bot is for, in a phrase
    job: text("job").notNull(),
    // How it should go about the job
    instructions: text("instructions"),
    // Sandbox provider ID, created lazily
    sandboxId: text("sandbox_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bots_user_id_idx").on(t.userId)]
)

export type Bot = typeof bots.$inferSelect
export type NewBot = typeof bots.$inferInsert

// What a user can set when creating a bot. Ownership and server-managed
// columns are filled in by the server action, never by the client.
export const insertBotSchema = createInsertSchema(bots, {
  name: (s) => s.trim().min(1, "Give your bot a name.").max(50),
  // Required here (unlike the column default) so the face the user picked is
  // the face that gets saved.
  avatar: z.string().min(1),
  job: (s) => s.trim().min(1, "Give your bot a job.").max(100),
  instructions: (s) => s.trim().max(2000),
}).omit({ id: true, userId: true, sandboxId: true, createdAt: true })

export type InsertBot = z.infer<typeof insertBotSchema>
