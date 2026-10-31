export type Env = Record<string, string | undefined>

export interface LimitResult {
  allowed: boolean
  count: number
  /** Seconds until the current window ends. */
  retryAfter: number
}

const memory = new Map<string, number>()
let warned = false

function redisConfig(env: Env): { url: string; token: string } | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN
  return url && token ? { url: url.replace(/\/$/, ''), token } : null
}

function memoryIncr(key: string): number {
  const next = (memory.get(key) ?? 0) + 1
  memory.set(key, next)
  if (memory.size > 5000) {
    // Drop the oldest entries so a flood of keys cannot grow memory without bound.
    for (const k of memory.keys()) {
      memory.delete(k)
      if (memory.size <= 2500) break
    }
  }
  return next
}

async function redisIncr(cfg: { url: string; token: string }, key: string, ttl: number): Promise<number> {
  const res = await fetch(`${cfg.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, ttl],
    ]),
  })
  if (!res.ok) throw new Error(`Redis responded ${res.status}`)
  const out = (await res.json()) as { result?: unknown }[]
  const n = Number(out[0]?.result)
  if (!Number.isFinite(n)) throw new Error('Unexpected Redis response')
  return n
}

/**
 * Fixed-window counter. Uses Upstash Redis / Vercel KV when its REST env vars are set, so the limit holds
 * across serverless instances. Without them it falls back to per-instance memory (fine in dev, best-effort in production).
 */
export async function consume(env: Env, name: string, limit: number, windowSeconds: number, nowSeconds: number): Promise<LimitResult> {
  const bucket = Math.floor(nowSeconds / windowSeconds)
  const key = `climb:rl:${name}:${bucket}`
  const retryAfter = Math.max(1, (bucket + 1) * windowSeconds - nowSeconds)

  let count: number
  const cfg = redisConfig(env)
  if (cfg) {
    try {
      count = await redisIncr(cfg, key, windowSeconds * 2)
    } catch (err) {
      console.error('Rate-limit store unavailable, using memory:', err instanceof Error ? err.message : err)
      count = memoryIncr(key)
    }
  } else {
    if (!warned) {
      warned = true
      console.warn('No UPSTASH_REDIS_REST_URL / KV_REST_API_URL set: upload rate limits are per server instance only.')
    }
    count = memoryIncr(key)
  }
  return { allowed: count <= limit, count, retryAfter }
}

export function formatWait(seconds: number): string {
  if (seconds < 90) return 'a minute'
  const minutes = Math.ceil(seconds / 60)
  return minutes >= 90 ? `${Math.ceil(minutes / 60)} hours` : `${minutes} minutes`
}
