import { config } from "dotenv"
import path from "node:path"
import { createAuth } from "./auth.ts"
import { getDb } from "./db.ts"
import { seedDemo, seedReferenceFoods } from "./seed.ts"

config({ path: path.resolve(process.cwd(), "../../.env") })
const { db } = await getDb()
await seedReferenceFoods(db)
await seedDemo(db, createAuth(db))
console.info("Seeded foods and the demo account.")
