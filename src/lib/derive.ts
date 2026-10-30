import type { ChainEvent } from '@/lib/eventStore'

const big = (v: unknown): bigint => (typeof v === 'bigint' ? v : 0n)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
export const lower = (v: string) => v.toLowerCase()

export const DAY = 86_400

/* ---------- bounty lookups ---------- */

export interface BountyMeta {
  title: string
  creator: string
  category: string
}

export function bountyMeta(events: ChainEvent[]): Map<string, BountyMeta> {
  const m = new Map<string, BountyMeta>()
  for (const e of events) {
    if (e.name === 'BountyCreated') {
      m.set(big(e.args.bountyId).toString(), { title: str(e.args.title), creator: str(e.args.creator), category: str(e.args.category) })
    }
  }
  return m
}

/* ---------- feed ---------- */

export type FeedKind = 'created' | 'funded' | 'claim' | 'comment' | 'voteStarted' | 'payout'

export interface FeedItem {
  key: string
  kind: FeedKind
  bountyId: bigint
  title: string
  actor: string
  amount?: bigint
  text?: string
  ts: number
  order: bigint
  /** Lowercased addresses this item concerns, used by the "You" tab. */
  involved: string[]
}

export function buildFeed(events: ChainEvent[]): FeedItem[] {
  const meta = bountyMeta(events)
  const items: FeedItem[] = []
  for (const e of events) {
    const bountyId = big(e.args.bountyId)
    const m = meta.get(bountyId.toString())
    const title = m?.title ?? `Bounty #${bountyId}`
    const creator = m?.creator ?? ''
    const base = { key: `${e.txHash}-${e.logIndex}`, bountyId, title, ts: e.ts, order: e.block * 100000n + BigInt(e.logIndex) }
    switch (e.name) {
      case 'BountyCreated':
        items.push({ ...base, kind: 'created', actor: str(e.args.creator), amount: big(e.args.amount), involved: [lower(str(e.args.creator))] })
        break
      case 'Contributed':
        items.push({ ...base, kind: 'funded', actor: str(e.args.contributor), amount: big(e.args.amount), involved: [lower(str(e.args.contributor)), lower(creator)] })
        break
      case 'ClaimSubmitted':
        items.push({ ...base, kind: 'claim', actor: str(e.args.claimant), involved: [lower(str(e.args.claimant)), lower(creator)] })
        break
      case 'CommentAdded':
        items.push({ ...base, kind: 'comment', actor: str(e.args.author), text: str(e.args.text), involved: [lower(str(e.args.author)), lower(creator)] })
        break
      case 'ClaimNominated':
        items.push({ ...base, kind: 'voteStarted', actor: str(e.args.creator), involved: [lower(str(e.args.creator))] })
        break
      case 'BountyPaid':
        items.push({
          ...base,
          kind: 'payout',
          actor: str(e.args.claimant),
          amount: big(e.args.payout),
          involved: [lower(str(e.args.claimant)), lower(creator)],
        })
        break
      default:
        break
    }
  }
  return items.sort((a, b) => (b.order > a.order ? 1 : b.order < a.order ? -1 : 0))
}

/* ---------- people ---------- */

export interface PersonStats {
  address: string
  earned: bigint
  wins: number
  funded: bigint
  created: number
  claims: number
}

export function buildPeople(events: ChainEvent[]): Map<string, PersonStats> {
  const m = new Map<string, PersonStats>()
  const get = (address: string): PersonStats => {
    const k = lower(address)
    let p = m.get(k)
    if (!p) {
      p = { address, earned: 0n, wins: 0, funded: 0n, created: 0, claims: 0 }
      m.set(k, p)
    }
    return p
  }
  for (const e of events) {
    switch (e.name) {
      case 'BountyCreated': {
        const p = get(str(e.args.creator))
        p.created += 1
        p.funded += big(e.args.amount)
        break
      }
      case 'Contributed':
        get(str(e.args.contributor)).funded += big(e.args.amount)
        break
      case 'ContributionWithdrawn':
      case 'RefundClaimed':
        get(str(e.args.contributor)).funded -= big(e.args.amount)
        break
      case 'ClaimSubmitted':
        get(str(e.args.claimant)).claims += 1
        break
      case 'BountyPaid': {
        const p = get(str(e.args.claimant))
        p.earned += big(e.args.payout)
        p.wins += 1
        break
      }
      default:
        break
    }
  }
  return m
}

export function emptyPerson(address: string): PersonStats {
  return { address, earned: 0n, wins: 0, funded: 0n, created: 0, claims: 0 }
}

/* ---------- trending ---------- */

export function trending(events: ChainEvent[], nowSec: number, days = 7): { bountyId: bigint; funded: bigint }[] {
  const since = nowSec - days * DAY
  const m = new Map<string, bigint>()
  for (const e of events) {
    if (e.ts < since) continue
    if (e.name === 'BountyCreated' || e.name === 'Contributed') {
      const k = big(e.args.bountyId).toString()
      m.set(k, (m.get(k) ?? 0n) + big(e.args.amount))
    }
  }
  return [...m.entries()]
    .map(([k, funded]) => ({ bountyId: BigInt(k), funded }))
    .sort((a, b) => (b.funded > a.funded ? 1 : b.funded < a.funded ? -1 : 0))
}

/* ---------- analytics ---------- */

export type ChartFilter = 'all' | 'bounties' | 'funding' | 'claims' | 'voting' | 'payouts'
export type RangeKey = '7d' | '30d' | 'all'
export const CHART_FILTERS: { id: ChartFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'bounties', label: 'Bounties' },
  { id: 'funding', label: 'Funding' },
  { id: 'claims', label: 'Claims' },
  { id: 'voting', label: 'Voting' },
  { id: 'payouts', label: 'Payouts' },
]

function typeOf(name: string): Exclude<ChartFilter, 'all'> | null {
  switch (name) {
    case 'BountyCreated':
    case 'BountyCancelled':
      return 'bounties'
    case 'Contributed':
    case 'ContributionWithdrawn':
    case 'RefundClaimed':
      return 'funding'
    case 'ClaimSubmitted':
      return 'claims'
    case 'ClaimNominated':
    case 'Voted':
    case 'VoteResolved':
      return 'voting'
    case 'BountyPaid':
      return 'payouts'
    default:
      return null
  }
}

function volumeOf(e: ChainEvent): bigint {
  switch (e.name) {
    case 'BountyCreated':
    case 'Contributed':
    case 'ContributionWithdrawn':
    case 'RefundClaimed':
      return big(e.args.amount)
    case 'BountyPaid':
      return big(e.args.payout) + big(e.args.fee)
    default:
      return 0n
  }
}

export interface DayBucket {
  day: string
  txs: Record<ChartFilter, number>
  volume: Record<ChartFilter, bigint>
}

export interface Analytics {
  totalTx: number
  volume: bigint
  dailyAvg: bigint
  peak: { day: string; txs: number } | null
  days: DayBucket[]
}

const dayKey = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10)

const emptyBucket = (day: string): DayBucket => ({
  day,
  txs: { all: 0, bounties: 0, funding: 0, claims: 0, voting: 0, payouts: 0 },
  volume: { all: 0n, bounties: 0n, funding: 0n, claims: 0n, voting: 0n, payouts: 0n },
})

export function buildAnalytics(events: ChainEvent[], range: RangeKey, nowSec: number): Analytics {
  const counted = events.filter((e) => e.ts > 0)
  const firstTs = counted.reduce((min, e) => (e.ts < min ? e.ts : min), nowSec)
  const spanDays = range === '7d' ? 7 : range === '30d' ? 30 : Math.max(1, Math.floor((nowSec - firstTs) / DAY) + 1)
  const dayStart = nowSec - (spanDays - 1) * DAY

  const buckets = new Map<string, DayBucket>()
  for (let i = 0; i < spanDays; i++) {
    const k = dayKey(dayStart + i * DAY)
    buckets.set(k, emptyBucket(k))
  }

  // Count each transaction once per type and once overall.
  const seenAll = new Set<string>()
  const seenType = new Set<string>()
  let volume = 0n
  for (const e of counted) {
    const bucket = buckets.get(dayKey(e.ts))
    if (!bucket) continue
    const t = typeOf(e.name)
    if (!t) continue
    if (!seenAll.has(e.txHash)) {
      seenAll.add(e.txHash)
      bucket.txs.all += 1
    }
    const typeKey = `${e.txHash}:${t}`
    if (!seenType.has(typeKey)) {
      seenType.add(typeKey)
      bucket.txs[t] += 1
    }
    const v = volumeOf(e)
    bucket.volume[t] += v
    bucket.volume.all += v
    volume += v
  }

  // Comments are transactions too, but belong to no chart filter other than "All".
  for (const e of counted) {
    if (e.name !== 'CommentAdded') continue
    const bucket = buckets.get(dayKey(e.ts))
    if (bucket && !seenAll.has(e.txHash)) {
      seenAll.add(e.txHash)
      bucket.txs.all += 1
    }
  }

  const days = [...buckets.values()]
  let peak: Analytics['peak'] = null
  for (const d of days) {
    if (d.txs.all > 0 && (!peak || d.txs.all > peak.txs)) peak = { day: d.day, txs: d.txs.all }
  }
  return {
    totalTx: days.reduce((n, d) => n + d.txs.all, 0),
    volume,
    dailyAvg: volume / BigInt(days.length),
    peak,
    days,
  }
}
