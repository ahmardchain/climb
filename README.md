# climb

A social bounty app on Arc. Post a task with a USDC reward held in escrow, others submit proof, and the reward is paid out onchain when the proof is accepted. Solo bounties are decided by the creator. Open bounties are crowdfunded and decided by a funder vote.

Built with [Arc Studio](https://studio.arc.io)

## Features

- Feed, Leaderboard, Explore (search, categories, trending), Profile, Analytics and a How it works guide
- Categories on bounties, comments on every bounty, share links
- Light and dark mode, mobile-first with a bottom navigation bar
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
- `VITE_CLIMB_DEPLOY_BLOCK`: block the contract was deployed at (optional, used to show who won a paid bounty).
- `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS`: provisioned by Arc Studio (optional outside Arc Studio).

Restart the dev server after changing `.env`.
