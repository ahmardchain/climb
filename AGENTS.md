# [App Name]

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

[Brief description of what the app does and its primary use case]

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Share links

- Starter apps already ship `getShareBase`, `buildShareLink` and `installShareSync` in `src/lib/share.ts`; import them instead of rewriting them.
- Keep shareable state in the URL path or query, not in the `#fragment`.
- Never put a secret (private key, claim secret, seed phrase, session token, API key) in the URL path or query, encoded or not: every in-app path and query is mirrored to the visitor's studio.arc.io address bar and browser history and reaches servers. A bearer claim secret goes only in the `#fragment` appended to the share link (`` `${await buildShareLink('/claim')}#${secret}` ``) and is read from `location.hash` on load. A link to the app's own share URL shown inside the app must be copy-only or open in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Build every link a user copies or sends with `buildShareLink()` from `src/lib/share.ts`.
- Keep the `installShareSync()` call in `src/main.tsx` when editing it; it keeps the Studio address bar in step with in-app navigation.
- Navigate inside the app with relative links.

## To Run

```bash
bun install
bun run dev
```

## climb (bounty escrow)

- Contract: `contracts/ClimbEscrow.sol` (constructor: usdc, treasury, feeBps, owner). 78 Foundry tests in `contracts/test/`. Reviewed; fixes applied: non-reverting payouts (`pendingPayouts`, `withdrawPending`) and a 24h re-nomination cooldown after a failed vote.
- ABI for the app: `src/lib/climbAbi.ts` (regenerate from `contracts/out/ClimbEscrow.sol/ClimbEscrow.json` after contract changes).
- App reads the contract address from `VITE_CLIMB_ESCROW_ADDRESS` (and optional `VITE_CLIMB_DEPLOY_BLOCK`) in `.env`.
- Network: Arc Testnet. Mainnet was not deployed; follow the mainnet warning before any mainnet work.
- Deployed (Arc Testnet): 0x1dec276fc813f203fc2b3462bc3214f5c45061c2 (v2: category + addComment). Earlier v1 at 0x25829e32f9a18c24973c2d77a8051d6504f2cf11 is unused. Owner is the shared platform deployer wallet (can only change treasury and fee). Treasury: 0x67561a4951B99AFE1018919dd3A3FDE883539b03, fee 250 bps.

## Claim images
- Claims upload an image through `POST /api/upload` (`api/upload.ts`, logic in `api/_lib/upload.ts`, also served in dev by a Vite plugin in `vite.config.ts`). It validates type, magic bytes and the 10 MB limit, pins to IPFS via Pinata using `PINATA_JWT` (server-side only), and returns the CID.
- Onchain: `proofURI = ipfs://<CID>`, `note = "<title>\n<description>"` (500 byte cap, see `src/components/ClaimNote.tsx`). Contract unchanged.
- Display: `src/components/ProofImage.tsx` tries gateways in order (`src/lib/ipfs.ts`). https proofs keep the old image/link-card behaviour.
- The static Vercel deploy via the deploy tool does not run `/api/upload` or hold `PINATA_JWT`; hosting uploads needs a Vercel project with the env var set.
- Upload protection: the client signs `uploadMessage(address, timestamp)` (`api/_lib/auth.ts`); the server rebuilds the message, verifies the EOA signature (5 minute TTL), then rate limits 10/wallet/hour and 20/IP/hour (`api/_lib/ratelimit.ts`; Upstash/Vercel KV REST when configured, per-instance memory otherwise). Smart-contract wallets (ERC-1271) are not supported for uploads.
