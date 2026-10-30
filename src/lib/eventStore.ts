import { parseEventLogs, type Hex, type PublicClient } from 'viem'
import { climbEscrowAbi } from '@/lib/climbAbi'
import { DEPLOY_BLOCK, ESCROW_ADDRESS } from '@/lib/climb'

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

let store: EventStoreState | null = null
let chunkSize = 5_000n
const tsCache = new Map<string, number>()

async function timestampsFor(client: PublicClient, blocks: bigint[]): Promise<void> {
  const missing = [...new Set(blocks.map((b) => b.toString()))].filter((b) => !tsCache.has(b))
  let i = 0
  const worker = async () => {
    while (i < missing.length) {
      const key = missing[i++]
      const block = await client.getBlock({ blockNumber: BigInt(key) })
      tsCache.set(key, Number(block.timestamp))
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, missing.length) }, worker))
}

/**
 * Reads every ClimbEscrow event from the deployment block (never from block 0),
 * resuming from the last scanned block on later calls.
 */
export async function syncEvents(client: PublicClient): Promise<EventStoreState> {
  if (!ESCROW_ADDRESS) throw new Error('Contract address is not configured')
  const head = await client.getBlockNumber()
  const startBlock = store?.startBlock ?? DEPLOY_BLOCK ?? (head > LOOKBACK ? head - LOOKBACK : 0n)
  let cursor = store ? store.lastBlock + 1n : startBlock
  if (cursor > head) return store ?? { events: [], startBlock, lastBlock: head, headBlock: head }

  const fresh: ChainEvent[] = []
  while (cursor <= head) {
    const to = cursor + chunkSize - 1n > head ? head : cursor + chunkSize - 1n
    let logs
    try {
      logs = await client.getLogs({ address: ESCROW_ADDRESS, fromBlock: cursor, toBlock: to })
    } catch (err) {
      if (chunkSize <= MIN_CHUNK) throw err
      chunkSize = chunkSize / 2n < MIN_CHUNK ? MIN_CHUNK : chunkSize / 2n
      continue
    }
    const parsed = parseEventLogs({ abi: climbEscrowAbi, logs })
    await timestampsFor(client, parsed.map((l) => l.blockNumber))
    for (const l of parsed) {
      fresh.push({
        name: l.eventName,
        args: l.args,
        block: l.blockNumber,
        txHash: l.transactionHash,
        logIndex: l.logIndex,
        ts: tsCache.get(l.blockNumber.toString()) ?? 0,
      })
    }
    cursor = to + 1n
  }

  store = {
    events: [...(store?.events ?? []), ...fresh],
    startBlock,
    lastBlock: head,
    headBlock: head,
  }
  return store
}
