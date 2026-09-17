# What’s in `@chain/casino-sdk`

This file describes the contents of the **`@chain/casino-sdk`** package.

## Contents

| Path                                          | What it is                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| `README.md` (package root)                    | Package overview + usage.                                                         |
| `src/types.ts`                                | `HostSnapshotV1`, `HostApiV1`, `GuestApiV1`, manifest types.                      |
| `src/manifest.ts`                             | `validateCasinoGameManifest`, `canonicalCasinoGameId`, `resolveManifestMetadata`. |
| `src/guest.ts` / `src/host.ts`                | Penpal bridge connectors (iframe + parent).                                       |
| `src/index.ts`                                | Re-exports types + manifest helpers.                                              |
| `simulator/contracts/ICasinoGameV2.sol`       | Copy of the canonical game interface.                                             |
| `examples/coinflip-public/game.manifest.json` | Example `game.manifest.json` shape the host validates.                            |
| `docs/CHAIN_WTF_CASINO_GAMES.md`              | Main integration guide (host/guest, bridge, ABI patterns).                        |
| `docs/CONTRACT_CONSTRAINTS.md`                | On-chain facet and `ICasinoGameV2` constraints.                                   |
| `docs/SLOTS_RISK_AND_RESERVES.md`             | Slots-specific `quoteRiskParams`, tiered reserve, examples.                       |
| `docs/VISUAL_AND_UX.md`                       | Iframe, manifest, snapshot UX expectations.                                       |

## No shared “game repo” structure

There is **no** required folder layout, toolchain, or release process for third-party games. Each
title is expected to live in **its own repository** (or vendor setup), with its **own** build, test,
and **release pipeline**. The platform only needs a **deployed URL** the host can load in an
**iframe** plus the on-chain game contract and catalog wiring on our side.

Games differ (slots vs. table games, stack choices, asset pipelines), so treat these docs as
**reference**, not a template monorepo to mirror. The TypeScript sources can be pulled into your own
project with `shadcn add @chain/casino-sdk` (see the `@chain/ui` registry) or by vendoring `src/`.
