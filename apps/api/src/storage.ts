import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const localRoot = () => process.env.UPLOAD_DIR || path.resolve(process.cwd(), "../../.data/uploads")

function s3Config() {
  const bucket = process.env.AWS_S3_BUCKET
  const region = process.env.AWS_REGION || "af-south-1"
  if (!bucket || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) return null
  return {
    bucket,
    region,
    client: new S3Client({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    }),
  }
}

export function safeKey(userId: string, kind: string, extension: string): string {
  const id = crypto.randomUUID()
  const ext = extension.replace(/[^a-z0-9]/gi, "").slice(0, 4) || "jpg"
  const folder = kind === "label" ? "labels" : "meals"
  return `users/${userId}/${folder}/${id}.${ext}`
}

export function assertOwnKey(userId: string, key: string): void {
  const normalized = key.replace(/\\/g, "/")
  if (normalized.includes("..") || !normalized.startsWith(`users/${userId}/`)) {
    throw new Error("That photo does not belong to this account.")
  }
}

export async function createUploadTicket(key: string, contentType: string) {
  const s3 = s3Config()
  if (s3) {
    const command = new PutObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      ContentType: contentType,
    })
    const uploadUrl = await getSignedUrl(s3.client, command, { expiresIn: 300 })
    return { key, uploadUrl, method: "PUT", headers: { "Content-Type": contentType } }
  }
  return { key, uploadUrl: "/api/uploads", method: "POST", headers: {} }
}

export async function saveLocal(key: string, bytes: Uint8Array): Promise<void> {
  assertPath(key)
  const file = path.join(localRoot(), key)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, bytes)
}

export async function readBytes(key: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const s3 = s3Config()
  if (s3) {
    const result = await s3.client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: key }))
    const bytes = Buffer.from(await result.Body!.transformToByteArray())
    return { bytes, mime: result.ContentType || mimeFromKey(key) }
  }
  try {
    assertPath(key)
    const bytes = await readFile(path.join(localRoot(), key))
    return { bytes, mime: mimeFromKey(key) }
  } catch {
    return null
  }
}

export async function displayUrl(key: string): Promise<string> {
  const s3 = s3Config()
  if (s3) {
    const command = new GetObjectCommand({ Bucket: s3.bucket, Key: key })
    return getSignedUrl(s3.client, command, { expiresIn: 60 * 30 })
  }
  return `/api/files/${key}`
}

function mimeFromKey(key: string): string {
  if (key.endsWith(".png")) return "image/png"
  if (key.endsWith(".webp")) return "image/webp"
  return "image/jpeg"
}

function assertPath(key: string): void {
  if (key.includes("..") || path.isAbsolute(key)) throw new Error("Invalid photo key.")
}
