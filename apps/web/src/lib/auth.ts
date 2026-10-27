import { createAuthClient } from "better-auth/react"

const baseURL = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || undefined

export const authClient = createAuthClient({
  baseURL,
  fetchOptions: {
    credentials: "include",
  },
})
