import { handleUpload } from './_lib/upload.js'

/**
 * Vercel serverless route: POST /api/upload (multipart, field "file") -> { cid }.
 * Requires a wallet signature (see api/_lib/auth.ts) and is rate limited.
 * Set PINATA_JWT, and a Redis REST store for shared rate limits, in the project's environment variables (see .env.example).
 */
export async function POST(request: Request): Promise<Response> {
  return handleUpload(request, { jwt: process.env.PINATA_JWT })
}

export function GET(): Response {
  return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
    status: 405,
    headers: { 'content-type': 'application/json', allow: 'POST' },
  })
}
