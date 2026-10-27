import { config } from "dotenv"
import path from "node:path"
import { serve } from "@hono/node-server"
import { getApp } from "./app.ts"

config({ path: path.resolve(process.cwd(), "../../.env") })
config({ path: path.resolve(process.cwd(), ".env") })

const port = Number(process.env.PORT || 8787)
const { app } = await getApp()

serve({ fetch: app.fetch, port }, () => {
  console.info(`[deit] API listening on http://localhost:${port}`)
})
