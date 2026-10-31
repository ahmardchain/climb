# Deploying climb to Arc mainnet

Mainnet moves real USDC and transactions are irreversible. Arc Studio does not deploy to, sign for, or fund anything on mainnet. You run every step below yourself, from your own wallet. Review each value before you run it.

Before you start:

- Get an independent professional audit of `contracts/ClimbEscrow.sol`. It will hold real money.
- Run `bun run contracts:test` and confirm everything passes.
- Rehearse the whole flow on Arc Testnet first (the app's default).

## 1. Network facts (checked against Arc's registry)

| | Arc mainnet |
|---|---|
| Chain ID | `5042` |
| RPC | `https://rpc.mainnet.arc.io` |
| Explorer | `https://explorer.arc.io` |
| USDC (ERC-20, 6 decimals) | `0x3600000000000000000000000000000000000000` |

On Arc, gas is paid in USDC, so the deploying wallet needs a little USDC for gas.

## 2. Pick your addresses

- `TREASURY`: the wallet that receives the 2.5% fee. Use an address you control and have double-checked.
- `OWNER`: the wallet allowed to change the treasury and fee (capped at 5%). It cannot touch escrowed funds. Use your own wallet or a multisig, not a shared or throwaway one.
- Fee: `250` basis points (2.5%). The contract caps it at `500`.

## 3. Deploy

Constructor order is `(usdc, treasury, feeBps, owner)`. Keep your key out of shell history: import it into an encrypted keystore once, then deploy with `--account`.

```bash
cast wallet import climb-deployer --interactive

forge create contracts/ClimbEscrow.sol:ClimbEscrow \
  --rpc-url https://rpc.mainnet.arc.io \
  --account climb-deployer \
  --broadcast \
  --constructor-args 0x3600000000000000000000000000000000000000 "$TREASURY" 250 "$OWNER"
```

If you prefer an environment variable, replace `--account climb-deployer` with `--private-key "$PRIVATE_KEY"`. Never paste a key into a command, a file, or a chat.

Write down the deployed address from the output.

## 4. Verify what you deployed

```bash
cast call <DEPLOYED_ADDRESS> "treasury()(address)" --rpc-url https://rpc.mainnet.arc.io
cast call <DEPLOYED_ADDRESS> "owner()(address)" --rpc-url https://rpc.mainnet.arc.io
cast call <DEPLOYED_ADDRESS> "feeBps()(uint16)" --rpc-url https://rpc.mainnet.arc.io
cast call <DEPLOYED_ADDRESS> "usdc()(address)" --rpc-url https://rpc.mainnet.arc.io
```

All four must match what you intended. Find the block number it was deployed in:

```bash
cast receipt <DEPLOY_TX_HASH> blockNumber --rpc-url https://rpc.mainnet.arc.io
```

## 5. Point the app at mainnet

Set these as environment variables (Vercel: Project Settings > Environment Variables), then redeploy so the build picks them up:

| Variable | Value |
|---|---|
| `VITE_CLIMB_NETWORK` | `mainnet` |
| `VITE_CLIMB_ESCROW_ADDRESS` | your deployed mainnet address |
| `VITE_CLIMB_DEPLOY_BLOCK` | the block from step 4 |

`PINATA_JWT` and the Redis variables are unchanged. For a local run, put the same three values in `.env` and restart `bun run dev`.

## 6. Smoke test with small amounts

Create a 1 USDC solo bounty from one wallet, submit a claim from another, accept it, and confirm the payout and the fee on the explorer before using it for anything larger.
