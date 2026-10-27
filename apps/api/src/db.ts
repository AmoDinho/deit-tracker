import { mkdirSync } from "node:fs"
import path from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle as drizzlePglite } from "drizzle-orm/pglite"
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { schemaSql } from "./sql.ts"
import * as schema from "./schema.ts"

export type Database = ReturnType<typeof drizzlePglite<typeof schema>>

type Handle = {
  db: Database
  exec: (sql: string) => Promise<void>
  close: () => Promise<void>
  kind: "pglite" | "postgres"
}

let handle: Handle | null = null

function statements(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.endsWith(";") ? part : `${part};`))
}

export async function getDb(): Promise<Handle> {
  if (handle) return handle

  const databaseUrl = process.env.DATABASE_URL
  if (databaseUrl) {
    const client = postgres(databaseUrl, { max: 2, prepare: false })
    const db = drizzlePostgres(client, { schema })
    handle = {
      kind: "postgres",
      db: db as unknown as Database,
      exec: async (sql) => {
        for (const statement of statements(sql)) await client.unsafe(statement)
      },
      close: () => client.end(),
    }
  } else {
    const dataDir = process.env.PGLITE_DATA || path.resolve(process.cwd(), "../../.data/pglite")
    mkdirSync(path.dirname(dataDir), { recursive: true })
    const client = new PGlite(dataDir)
    await client.waitReady
    const db = drizzlePglite(client, { schema })
    handle = {
      kind: "pglite",
      db,
      exec: async (sql) => {
        await client.exec(sql)
      },
      close: () => client.close(),
    }
  }

  await handle.exec(schemaSql)
  try {
    await handle.exec("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
  } catch {
    // Embedded Postgres may not ship pg_trgm. Name search falls back to ILIKE.
  }
  return handle
}

export async function closeDb(): Promise<void> {
  if (!handle) return
  await handle.close()
  handle = null
}
