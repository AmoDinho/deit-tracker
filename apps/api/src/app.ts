import { Hono } from "hono"
import { createAuth } from "./auth.ts"
import { getDb } from "./db.ts"
import { createGraphql } from "./graphql.ts"
import { seedDemo, seedReferenceFoods } from "./seed.ts"
import { assertOwnKey, saveLocal } from "./storage.ts"

let ready: Promise<{ app: Hono }> | null = null

export function getApp() {
  ready ??= build()
  return ready
}

async function build() {
  const { db } = await getDb()
  const auth = createAuth(db)
  await seedReferenceFoods(db)
  await seedDemo(db, auth)
  const yoga = createGraphql(db, auth)
  const app = new Hono()
  const origins = (process.env.CORS_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)

  app.use("/api/*", async (c, next) => {
    const origin = c.req.header("origin")
    if (!origin || origins.includes(origin)) {
      c.header("Access-Control-Allow-Origin", origin || origins[0])
      c.header("Access-Control-Allow-Credentials", "true")
      c.header("Access-Control-Allow-Headers", "Content-Type, Authorization")
      c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
      c.header("Vary", "Origin")
    }
    if (c.req.method === "OPTIONS") return c.body(null, 204)
    await next()
  })

  app.get("/api/health", (c) => c.json({ ok: true, service: "deit-api" }))
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
  app.on(["GET", "POST"], "/api/graphql", (c) => yoga.fetch(c.req.raw))

  app.post("/api/uploads", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session?.user) return c.json({ error: "Sign in to upload." }, 401)
    const body = await c.req.parseBody()
    const file = body.file
    const key = typeof body.key === "string" ? body.key : ""
    if (!(file instanceof File) || !key) return c.json({ error: "Missing file." }, 400)
    if (file.size > 8 * 1024 * 1024) return c.json({ error: "Photo must be under 8 MB." }, 400)
    assertOwnKey(session.user.id, key)
    await saveLocal(key, new Uint8Array(await file.arrayBuffer()))
    return c.json({ key })
  })

  app.get("/api/files/*", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session?.user) return c.json({ error: "Sign in to view photos." }, 401)
    const key = c.req.path.replace(/^\/api\/files\//, "")
    assertOwnKey(session.user.id, key)
    const { readFile } = await import("node:fs/promises")
    const path = await import("node:path")
    const root = process.env.UPLOAD_DIR || path.resolve(process.cwd(), "../../.data/uploads")
    try {
      const bytes = await readFile(path.join(root, key))
      const type = key.endsWith(".png") ? "image/png" : key.endsWith(".webp") ? "image/webp" : "image/jpeg"
      return c.body(bytes, 200, { "Content-Type": type, "Cache-Control": "private, max-age=3600" })
    } catch {
      return c.json({ error: "Photo not found." }, 404)
    }
  })

  return { app, auth, db }
}
