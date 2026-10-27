import { gql } from "./api"

const API_BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? ""

async function resizeImage(file: File, maxEdge = 1024): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext("2d")
  if (!context) {
    bitmap.close()
    throw new Error("This browser could not resize the photo.")
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86))
  if (!blob) throw new Error("Could not prepare that photo.")
  return blob
}

export async function uploadPhoto(file: File, kind: "meal" | "label"): Promise<{ key: string; preview: string }> {
  const blob = await resizeImage(file)
  const preview = URL.createObjectURL(blob)
  const data = await gql<{
    createUploadUrl: { key: string; uploadUrl: string; method: string; contentType: string }
  }>(
    `mutation Upload($contentType: String!, $kind: String!) {
      createUploadUrl(contentType: $contentType, kind: $kind) { key uploadUrl method contentType }
    }`,
    { contentType: "image/jpeg", kind },
  )
  const ticket = data.createUploadUrl
  if (ticket.method === "PUT") {
    const put = await fetch(ticket.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: blob,
    })
    if (!put.ok) throw new Error("Photo upload failed.")
  } else {
    const body = new FormData()
    body.append("key", ticket.key)
    body.append("file", new File([blob], "photo.jpg", { type: "image/jpeg" }))
    const post = await fetch(`${API_BASE}${ticket.uploadUrl}`, {
      method: "POST",
      credentials: "include",
      body,
    })
    if (!post.ok) throw new Error("Photo upload failed.")
  }
  return { key: ticket.key, preview }
}
