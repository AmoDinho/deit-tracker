import { betterAuth } from "better-auth"
import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import type { Database } from "./db.ts"
import * as schema from "./schema.ts"

export function createAuth(db: Database) {
  const googleId = process.env.GOOGLE_CLIENT_ID
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET
  const trusted = (process.env.BETTER_AUTH_TRUSTED_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)

  return betterAuth({
    appName: "Deit",
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:5173",
    basePath: "/api/auth",
    secret: process.env.BETTER_AUTH_SECRET || "deit-dev-secret-change-in-production-32",
    trustedOrigins: trusted,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ url }) => {
        console.info(`[deit] password reset link: ${url}`)
      },
    },
    socialProviders: googleId && googleSecret
      ? {
          google: {
            clientId: googleId,
            clientSecret: googleSecret,
          },
        }
      : undefined,
    session: {
      expiresIn: 60 * 60 * 24 * 30,
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
