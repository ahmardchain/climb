import { useQuery } from '@tanstack/react-query'
import { useAccount, usePublicClient } from 'wagmi'
import { erc20Abi, type Address, type PublicClient } from 'viem'
import { climbEscrowAbi } from '@/lib/climbAbi'
import { syncEvents } from '@/lib/eventStore'
import {
  CHAIN_ID,
  DEPLOY_BLOCK,
  ESCROW_ADDRESS,
  USDC_ADDRESS,
  Status,
  type Bounty,
  type Claim,
} from '@/lib/climb'

const LIST_LIMIT = 200

export interface BountyListItem {
  bounty: Bounty
  claimCount: bigint
}

function useClient() {
  return usePublicClient({ chainId: CHAIN_ID })
}

export function useBountyList() {
  const client = useClient()
  return useQuery({
    queryKey: ['climb', 'list'],
    enabled: !!client && !!ESCROW_ADDRESS,
    refetchInterval: 15_000,
    queryFn: async (): Promise<BountyListItem[]> => {
      if (!client || !ESCROW_ADDRESS) return []
      const escrow = ESCROW_ADDRESS
      const count = await client.readContract({
        address: escrow,
        abi: climbEscrowAbi,
        functionName: 'bountyCount',
      })
      if (count === 0n) return []
      const first = count > BigInt(LIST_LIMIT) ? count - BigInt(LIST_LIMIT) + 1n : 1n
      const ids: bigint[] = []
      for (let id = count; id >= first; id--) ids.push(id)
      return Promise.all(
        ids.map(async (id) => {
          const [bounty, claimCount] = await Promise.all([
            client.readContract({ address: escrow, abi: climbEscrowAbi, functionName: 'getBounty', args: [id] }),
            client.readContract({ address: escrow, abi: climbEscrowAbi, functionName: 'claimCount', args: [id] }),
          ])
          return { bounty: bounty, claimCount }
        }),
      )
    },
  })
}

export interface Contributor {
  address: Address
  amount: bigint
}

export interface BountyDetail {
  bounty: Bounty
  claims: Claim[]
  contributors: Contributor[]
  myContribution: bigint
  iClaimed: boolean
  iVoted: boolean
  nominationAvailableAt: bigint
  winner?: { claimId: bigint; claimant: Address; payout: bigint; fee: bigint }
}

export function useBountyDetail(id: bigint | undefined) {
  const client = useClient()
  const { address } = useAccount()
  return useQuery({
    queryKey: ['climb', 'bounty', id?.toString(), address],
    enabled: !!client && !!ESCROW_ADDRESS && id !== undefined,
    refetchInterval: 10_000,
    queryFn: async (): Promise<BountyDetail | null> => {
      if (!client || !ESCROW_ADDRESS || id === undefined) return null
      const escrow = ESCROW_ADDRESS
      const read = <F extends string>(functionName: F, args: readonly unknown[]) =>
        client.readContract({
          address: escrow,
          abi: climbEscrowAbi,
          functionName: functionName as never,
          args: args,
        }) as Promise<unknown>

      let bounty: Bounty
      try {
        bounty = (await read('getBounty', [id])) as Bounty
      } catch {
        return null
      }
      const [claims, contributorAddrs, nominationAvailableAt] = await Promise.all([
        read('getClaims', [id, 0n, 100n]) as Promise<Claim[]>,
        read('getContributors', [id]) as Promise<Address[]>,
        read('nominationAvailableAt', [id]) as Promise<bigint>,
      ])
      const amounts = await Promise.all(contributorAddrs.map((a) => read('getContribution', [id, a]) as Promise<bigint>))
      const contributors = contributorAddrs
        .map((a, i) => ({ address: a, amount: amounts[i] }))
        .filter((c) => c.amount > 0n)

      let myContribution = 0n
      let iClaimed = false
      let iVoted = false
      if (address) {
        ;[myContribution, iClaimed, iVoted] = (await Promise.all([
          read('getContribution', [id, address]),
          read('hasClaimed', [id, address]),
          read('hasVoted', [id, address]),
        ])) as [bigint, boolean, boolean]
      }

      let winner: BountyDetail['winner']
      if (bounty.status === Status.Paid && DEPLOY_BLOCK !== undefined) {
        try {
          const logs = await client.getContractEvents({
            address: ESCROW_ADDRESS,
            abi: climbEscrowAbi,
            eventName: 'BountyPaid',
            args: { bountyId: id },
            fromBlock: DEPLOY_BLOCK,
          })
          const log = logs[logs.length - 1]
          if (log?.args.claimId !== undefined && log.args.claimant && log.args.payout !== undefined && log.args.fee !== undefined) {
            winner = { claimId: log.args.claimId, claimant: log.args.claimant, payout: log.args.payout, fee: log.args.fee }
          }
        } catch {
          // The explorer link is the fallback when the RPC rejects the log range.
        }
      }
      return { bounty, claims, contributors, myContribution, iClaimed, iVoted, nominationAvailableAt, winner }
    },
  })
}

export interface WalletInfo {
  balance: bigint
  allowance: bigint
  pending: bigint
  feeBps: number
}

export function useWalletInfo() {
  const client = useClient()
  const { address } = useAccount()
  return useQuery({
    queryKey: ['climb', 'wallet', address],
    enabled: !!client && !!ESCROW_ADDRESS,
    refetchInterval: 15_000,
    queryFn: async (): Promise<WalletInfo> => {
      if (!client || !ESCROW_ADDRESS) return { balance: 0n, allowance: 0n, pending: 0n, feeBps: 0 }
      const escrow = ESCROW_ADDRESS
      const feeBps = await client.readContract({ address: escrow, abi: climbEscrowAbi, functionName: 'feeBps' })
      if (!address) return { balance: 0n, allowance: 0n, pending: 0n, feeBps }
      const [balance, allowance, pending] = await Promise.all([
        client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
        client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [address, escrow] }),
        client.readContract({ address: escrow, abi: climbEscrowAbi, functionName: 'pendingPayouts', args: [address] }),
      ])
      return { balance, allowance, pending, feeBps }
    },
  })
}

export function useEvents() {
  const client = useClient()
  return useQuery({
    queryKey: ['climb', 'events'],
    enabled: !!client && !!ESCROW_ADDRESS,
    refetchInterval: 15_000,
    staleTime: 5_000,
    queryFn: () => syncEvents(client as PublicClient),
  })
}

export interface ClaimWithBounty {
  claim: Claim
  bounty: Bounty
}

/** Every claim across the bounties in `list`, newest first. */
export function useAllClaims(list: BountyListItem[] | undefined) {
  const client = useClient()
  const signature = (list ?? []).map((i) => `${i.bounty.id}:${i.claimCount}`).join(',')
  return useQuery({
    queryKey: ['climb', 'claims', signature],
    enabled: !!client && !!ESCROW_ADDRESS && !!list,
    queryFn: async (): Promise<ClaimWithBounty[]> => {
      if (!client || !ESCROW_ADDRESS || !list) return []
      const escrow = ESCROW_ADDRESS
      const withClaims = list.filter((i) => i.claimCount > 0n)
      const pages = await Promise.all(
        withClaims.map(async (i) => {
          const claims = await client.readContract({
            address: escrow,
            abi: climbEscrowAbi,
            functionName: 'getClaims',
            args: [i.bounty.id, 0n, 100n],
          })
          return claims.map((claim) => ({ claim: claim, bounty: i.bounty }))
        }),
      )
      return pages.flat().sort((a, b) => (b.claim.createdAt > a.claim.createdAt ? 1 : b.claim.createdAt < a.claim.createdAt ? -1 : 0))
    },
  })
}
