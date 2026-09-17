# LEDGE

**Chain Jam Vol. 1 entry.** Five priced piles sit on a ledge. You get five coins. Spread
them across the lanes and topple what you can.

Bigger pile, bigger prize, harder to shift. Every coin is worth exactly the same expected
return wherever you drop it — the lane only chooses your volatility.

```
┌────┬────┬────┬────┬────┐
│ ▪▪ │ ▪▪▪│ ███│████│▓▓▓▓│   the piles are the paytable
│ 1x │ 2x │ 5x │ 15x│ 50x│
├────┼────┼────┼────┼────┤
│ ●● │ ●  │ ●● │    │    │   your five coins
└────┴────┴────┴────┴────┘
         [ D R O P ]
```

- **Declared theoretical RTP: 96.00%**, identical across all 126 possible allocations
- **Max multiplier 50x** on one lane, 73x across a full spread
- One transaction, one VRF request, instant settle
- Runs standalone outside the host iframe as a playable demo

## Where things are

| Path | What it is |
| ---- | ---------- |
| [`examples/ledge/`](./examples/ledge) | The game — frontend, math, tests |
| [`examples/ledge/DESIGN.md`](./examples/ledge/DESIGN.md) | The math, derived, and why the design is what it is |
| [`examples/ledge/README.md`](./examples/ledge/README.md) | Run it, deploy it, host it |
| [`simulator/contracts/LedgeGame.sol`](./simulator/contracts/LedgeGame.sol) | The game contract (`ICasinoGameV2`) |
| [`examples/ledge/ARCHITECTURE.md`](./examples/ledge/ARCHITECTURE.md) | Bet lifecycle, state machine and trust boundary, in mermaid |
| [`scripts/deploy-ledge.ts`](./scripts/deploy-ledge.ts) | Deploys to Base; dry run by default |

## Quick start

```sh
npm install
npm start          # local chain + VRF + simulator (:3300) + the game (:3101)
```

Open <http://localhost:3300>, expand the setup panel, set **Game contract** to `LedgeGame`,
then **Restart harness**. Or open <http://localhost:3101> directly for the standalone demo.

```sh
npm --prefix examples/ledge test    # 64 tests
```

The suite includes a parity proof that runs the deployed contract against the TypeScript
mirror over all 126 allocations and 150 random seeds, so the animation can never show one
result while the chain pays another.

## Live

| | |
| --- | --- |
| Contract | [`0x5d07b33fa3c335b65b10313ff6b9db487020afc4`](https://sepolia.basescan.org/address/0x5d07b33fa3c335b65b10313ff6b9db487020afc4) on Base Sepolia |
| Verified | All 126 allocations and 150 random seeds cross-checked against the deployed bytecode |

## Deploying

See [examples/ledge/README.md](./examples/ledge/README.md#deploying-for-real). Short version:

```sh
cp .env.example .env.deploy        # fill in RPC + deployer key
set -a; . ./.env.deploy; set +a
npm run deploy:ledge                        # dry run — sends nothing
LEDGE_CONFIRM=84532 npm run deploy:ledge    # broadcast to Base Sepolia
```

A deployed contract cannot take a bet until the Chain.wtf team whitelists it on
`CasinoGameFacet`. That is theirs to do; send them the address and the hosted URL.

## What is mine and what is vendored

Everything under `examples/ledge/`, `simulator/contracts/LedgeGame.sol`, `scripts/`, and the
hosting config at the root is this entry's own work.

The rest of the tree is the **Chain casino SDK v0.2.0**, vendored unmodified as the build
baseline — `src/`, `simulator/` (except `LedgeGame.sol`), `local-verify-network/`, `docs/`,
and `examples/coinflip-public/`. Its own README is kept at
[`docs/SDK_README.md`](./docs/SDK_README.md). Licensing of that code is Chain.wtf's.
