# climb

A social bounty app on Arc. Post a task with a USDC reward held in escrow, others submit proof, and the reward is paid out onchain when the proof is accepted. Solo bounties are decided by the creator. Open bounties are crowdfunded and decided by a funder vote.

Built with [Arc Studio](https://studio.arc.io)

## Features

- Feed, Leaderboard, Explore (search, categories, trending), Profile, Analytics and a How it works guide
- Categories on bounties, comments on every bounty, share links
- Light and dark mode, mobile-first with a bottom navigation bar
- Claims require an image proof, uploaded to IPFS through Pinata (JPG, PNG, WebP or GIF, up to 10 MB)
- All activity is read from the contract's onchain events, with no backend

## Tech stack

- React, Vite, TypeScript, Tailwind CSS
- wagmi, viem, ConnectKit
- Solidity and Foundry (`contracts/`)
- Arc Testnet, USDC

## Development

Prerequisites: [Bun](https://bun.sh), [Foundry](https://getfoundry.sh), and a browser wallet.

Install and run:

```bash
bun install
bun run dev
```

Build and test:

```bash
bun run build
bun run contracts:build
bun run contracts:test
```

### Environment variables

- `VITE_CLIMB_ESCROW_ADDRESS`: address of the deployed ClimbEscrow contract.
- `PINATA_JWT`: server-side only. Pinata API key (Files: Write) used by the `/api/upload` route to pin claim images. Get one at https://app.pinata.cloud/developers/api-keys. Never prefix it with `VITE_`. See `.env.example`.
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (or Vercel KV's `KV_REST_API_URL`, `KV_REST_API_TOKEN`): server-side, optional. Shared store for the upload rate limits (10 per wallet and 20 per IP per hour). Without it the limits only hold per server instance.
- `VITE_CLIMB_DEPLOY_BLOCK`: block the contract was deployed at (optional, used to show who won a paid bounty).
- `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS`: provisioned by Arc Studio (optional outside Arc Studio).

Restart the dev server after changing `.env`.

Image uploads run through `api/upload.ts` (a Vercel serverless route). `bun run dev` serves the same code locally. Uploads need a wallet signature (valid 5 minutes) and are rate limited. A static-only host will not run it, so deploy to Vercel (or another host with serverless routes) and set `PINATA_JWT` there.
