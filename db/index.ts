import "server-only"

import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "./schema"

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set")

// Reuse the pool across hot reloads in dev so we don't exhaust connections.
const globalForDb = globalThis as unknown as { pool?: Pool }

const pool =
  globalForDb.pool ?? new Pool({ connectionString: process.env.DATABASE_URL })

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool

export const db = drizzle({ client: pool, schema })
