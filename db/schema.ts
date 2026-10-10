import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { nanoid } from "nanoid"

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
