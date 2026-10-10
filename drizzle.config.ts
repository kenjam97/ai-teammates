import { loadEnvConfig } from "@next/env"
import { defineConfig } from "drizzle-kit"

loadEnvConfig(process.cwd())

// Migrations need a direct (non-pooled) connection; PgBouncer breaks session state.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is not set")

export default defineConfig({
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
