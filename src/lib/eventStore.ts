import { parseEventLogs, type Hex, type PublicClient } from 'viem'
import { climbEscrowAbi } from '@/lib/climbAbi'
import { CHAIN_ID, DEPLOY_BLOCK, ESCROW_ADDRESS } from '@/lib/climb'

export interface ChainEvent {
  name: string
  args: Record<string, unknown>
  block: bigint
  txHash: Hex
  logIndex: number
  /** Block timestamp in seconds. */
  ts: number
}

export interface EventStoreState {
  events: ChainEvent[]
  /** First block scanned (the deployment block, or a bounded lookback if it is unknown). */
  startBlock: bigint
  lastBlock: bigint
  headBlock: bigint
}

const LOOKBACK = 5_000n
const MIN_CHUNK = 100n
const MAX_STORED_CHARS = 2_500_000

let store: EventStoreState | null = null
let loadedFromSession = false
let chunkSize = 5_000n
const tsCache = new Map<string, number>()

/* ---------- retry with backoff on rate limits ---------- */

function isRateLimit(err: unknown): boolean {
  const e = err as { status?: number; message?: string; shortMessage?: string; cause?: unknown } | null
  if (!e) return false
  if (e.status === 429) return true
  const text = `${e.shortMessage ?? ''} ${e.message ?? ''}`
  if (/429|rate.?limit|too many requests|exceeded/i.test(text)) return true
  return e.cause ? isRateLimit(e.cause) : false
}

/** Retries rate-limited calls (HTTP 429) with exponential backoff and jitter; other errors pass straight through. */
export async function withBackoff<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let delay = 600
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= tries - 1 || !isRateLimit(err)) throw err
      await new Promise((resolve) => setTimeout(resolve, delay + Math.random() * 250))
      delay *= 2
    }
  }
}

/* ---------- per-session cache (sessionStorage) ---------- */

const storageKey = () => `climb:events:v1:${CHAIN_ID}:${(ESCROW_ADDRESS ?? '').toLowerCase()}`

function persist(state: EventStoreState): void {
  try {
    const text = JSON.stringify({ state, ts: [...tsCache.entries()] }, (_k, v: unknown) =>
      typeof v === 'bigint' ? { $b: v.toString() } : v,
    )
    if (text.length > MAX_STORED_CHARS) return
    sessionStorage.setItem(storageKey(), text)
  } catch {
    // Storage can be full or blocked inside an iframe; the in-memory copy still works.
  }
}

function restore(): void {
  if (loadedFromSession) return
  loadedFromSession = true
  try {
    const text = sessionStorage.getItem(storageKey())
    if (!text) return
    const parsed = JSON.parse(text, (_k, v: unknown) => {
      if (v && typeof v === 'object' && '$b' in v && typeof (v).$b === 'string') {
        return BigInt((v as { $b: string }).$b)
      }
      return v
    }) as { state?: EventStoreState; ts?: [string, number][] }
    if (parsed.state && Array.isArray(parsed.state.events) && typeof parsed.state.lastBlock === 'bigint') {
      store = parsed.state
      for (const [k, v] of parsed.ts ?? []) tsCache.set(k, v)
    }
  } catch {
    // A corrupt cache is ignored and rebuilt from the chain.
  }
}

/* ---------- sync ---------- */

async function timestampsFor(client: PublicClient, blocks: bigint[]): Promise<void> {
  const missing = [...new Set(blocks.map((b) => b.toString()))].filter((b) => !tsCache.has(b))
  let i = 0
  const worker = async () => {
    while (i < missing.length) {
      const key = missing[i++]
      const block = await withBackoff(() => client.getBlock({ blockNumber: BigInt(key) }))
      tsCache.set(key, Number(block.timestamp))
    }
  }
  // Few workers on purpose: a burst of block lookups is what trips rate limits.
  await Promise.all(Array.from({ length: Math.min(3, missing.length) }, worker))
}

/**
 * Reads every ClimbEscrow event from the deployment block (never from block 0),
 * resuming from the last scanned block on later calls and after a page reload in the same session.
 * Progress is kept after every chunk, so a rate-limited run resumes instead of starting over.
 */
export async function syncEvents(client: PublicClient): Promise<EventStoreState> {
  if (!ESCROW_ADDRESS) throw new Error('Contract address is not configured')
  restore()
  const head = await withBackoff(() => client.getBlockNumber())
  const startBlock = store?.startBlock ?? DEPLOY_BLOCK ?? (head > LOOKBACK ? head - LOOKBACK : 0n)
  let cursor = store ? store.lastBlock + 1n : startBlock
  if (cursor > head) return store ?? { events: [], startBlock, lastBlock: head, headBlock: head }

  while (cursor <= head) {
    const to = cursor + chunkSize - 1n > head ? head : cursor + chunkSize - 1n
    let logs
    try {
      logs = await withBackoff(() => client.getLogs({ address: ESCROW_ADDRESS as `0x${string}`, fromBlock: cursor, toBlock: to }))
    } catch (err) {
      // Rate limits are retried above; reaching here with one means we should stop, not shrink the range.
      if (isRateLimit(err) || chunkSize <= MIN_CHUNK) throw err
      chunkSize = chunkSize / 2n < MIN_CHUNK ? MIN_CHUNK : chunkSize / 2n
      continue
    }
    const parsed = parseEventLogs({ abi: climbEscrowAbi, logs })
    await timestampsFor(client, parsed.map((l) => l.blockNumber))
    const fresh: ChainEvent[] = parsed.map((l) => ({
      name: l.eventName,
      args: l.args as Record<string, unknown>,
      block: l.blockNumber,
      txHash: l.transactionHash,
      logIndex: l.logIndex,
      ts: tsCache.get(l.blockNumber.toString()) ?? 0,
    }))
    store = {
      events: [...(store?.events ?? []), ...fresh],
      startBlock,
      lastBlock: to,
      headBlock: head,
    }
    persist(store)
    cursor = to + 1n
  }
  return store ?? { events: [], startBlock, lastBlock: head, headBlock: head }
}
