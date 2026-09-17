# Casino SDK

Build **on-chain casino games** — single player vs. the house liquidity pool — that run inside
the Chain.wtf platform as sandboxed iframes.

A game is a Solidity contract implementing `ICasinoGameV2` plus a static web frontend that talks
to the host app through the `@chain/casino-sdk` bridge. Your frontend contains no wallet code:
the host signs every transaction, streams state snapshots into your iframe, and handles gasless
betting, balances and session tracking for you. You focus on game logic and presentation.

The SDK ships with a [local simulator](./LOCAL_SIMULATOR.md) — a one-command offline stack
(local chain, real VRF node, minimal casino deployment, production-faithful host harness) so you
can build and test the whole thing on your machine without any platform access.

**New here? Start with [Getting Started](./GETTING_STARTED.md)** — it takes you step by step
from an empty folder to a working game running locally.

## Documentation

| Guide                                                 | What it covers                                                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Getting Started](./GETTING_STARTED.md)               | **Start here.** Step-by-step: run the local stack, write the contract, build the UI, ship.                                                                 |
| [Local Simulator](./LOCAL_SIMULATOR.md)               | The offline test environment: what it runs, what it replicates from production, how to break things on purpose.                                            |
| [Building Casino Games](./CHAIN_WTF_CASINO_GAMES.md)  | **The complete reference**: host/guest model, Penpal bridge, `gameData` / `actionData`, ABI patterns, full frontend examples (coinflip, blackjack, mines). |
| [Contract Constraints](./CONTRACT_CONSTRAINTS.md)     | `CasinoGameFacet` rules your contract must respect: phases, timeouts, whitelist, portfolio risk, reverting errors.                                         |
| [Randomness → Dice](./RANDOMNESS_DICE.md)             | Deriving unbiased dice/cards from `bytes32` RNG — rejection sampling, never raw `byte % 6`. Canonical Solidity/TS.                                         |
| [Slots Risk & Reserves](./SLOTS_RISK_AND_RESERVES.md) | Why heavy-tail games (slots, jackpots) need `quoteRiskParams` + a tiered jackpot reserve.                                                                  |
| [Visual & UX](./VISUAL_AND_UX.md)                     | Iframe sandbox, theme/locale snapshot, manifest presentation, aligning with the main app's look.                                                           |
| [Repo Structure](./REPO_STRUCTURE.md)                 | What's inside the `@chain/casino-sdk` package.                                                                                                             |
| [Changelog](./CHANGELOG.md)                           | Date-versioned SDK release notes.                                                                                                                          |

## What's in the package

- `src/` — the bridge SDK: `connectGameToHost` (guest), `connectHostToGame` (host), shared
  types, manifest validation. Also distributed via the `@chain/ui` shadcn registry as
  `shadcn add @chain/casino-sdk`.
- `simulator/contracts/ICasinoGameV2.sol` — the canonical on-chain game interface.
- `examples/coinflip-public/` — a complete example game (contract + UI + manifest) to copy from.
- `simulator/` — the local test environment ([docs](./LOCAL_SIMULATOR.md)).

## The short version of shipping a game

1. **Contract**: implement `ICasinoGameV2` — `quoteCaps`, `quoteRiskParams`, `onSessionStart`,
   `onRandomness`, and `onPlayerAction` for multi-step games.
2. **Frontend**: call `connectGameToHost`, render from the host snapshot, place bets via
   `hostApi.openSession` / `submitAction`, and call `revealOutcome` after your win animation.
3. **Manifest**: serve `game.manifest.json` at the same origin as the game URL.
4. **Handoff**: deliver the audited contract + hosted static build; the Chain.wtf maintainers
   wire the whitelist, indexer and catalog.

## Going deeper on risk math

The complete portfolio VaR and slots tiered model lives in the monorepo at
`docs/CASINO_RISK_MANAGEMENT.md` (Section 6.4 — slots). The docs here summarize it; that file is
the authoritative source for risk terminology.
