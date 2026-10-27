import { handle } from "hono/aws-lambda"
import { getApp } from "./app.ts"

const { app } = await getApp()

export const handler = handle(app)
