import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "@/db/schema"

// Tasks run outside Next.js, so they can't import db/index.ts (it is
// server-only). This is the same client for the Trigger.dev worker.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set")

export const db = drizzle({
  client: new Pool({ connectionString: process.env.DATABASE_URL }),
  schema,
})
