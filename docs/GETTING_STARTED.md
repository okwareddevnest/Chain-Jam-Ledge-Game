# Getting started — build your first casino game

This page walks you from zero to a working casino game running against a local chain. No
Chain.wtf account, backend access, or testnet funds are needed — everything runs on your machine.

## What you are building

A Chain.wtf casino game is two deliverables plus a small metadata file:

1. **A Solidity contract** implementing [`ICasinoGameV2`](./CHAIN_WTF_CASINO_GAMES.md#21-icasinogamev2-full-solidity)
   — it holds all game logic and settles bets against the house liquidity pool.
2. **A static web frontend** (any framework, or none) that the Chain.wtf app embeds as a
   sandboxed iframe. It contains **no wallet code** — it talks to the host page through the
   `@chain/casino-sdk` bridge, and the host signs everything.
3. **A `game.manifest.json`** served next to your frontend, describing the game to the host.

The flow of a bet: the player configures a wager in your UI → your UI asks the host to open a
session → the host signs the transaction → the contract requests verifiable randomness (VRF) →
the contract settles the outcome → your UI animates the result and reveals the payout.

## Step 1 — get the SDK

Download the SDK package: [↓ Download Casino SDK (.zip)](/sdk/casino-sdk.zip)
(if you are reading this inside the unzipped package, you already have everything).

The package contains the bridge SDK sources (`src/`), the canonical Solidity interface
(`simulator/contracts/ICasinoGameV2.sol`), a complete example game (`examples/coinflip-public/`), and the
[local simulator](./LOCAL_SIMULATOR.md) — a full offline test environment.

You will need [Node.js](https://nodejs.org) (v22+) installed — nothing else. The local chain is
an in-memory Hardhat node bundled with the simulator's dependencies.

## Step 2 — run the local stack

From the unzipped package root:

```sh
npm install   # one install covers the simulator, VRF node and example game (npm workspaces)
npm start     # local chain + VRF node + casino deployment + simulator (:3300) + coinflip example (:3100)
```

Open **http://localhost:3300**. The simulator detects the local deployment, fills in its setup
panel and mounts the coinflip example. Place a few bets — this is the exact production host
behavior (optimistic sessions, delayed indexer feed, balance guarding) running against a real
VRF node on your machine. The player account starts with 1,000,000 test chUSD.

Everything you do from here on is: replace the coinflip contract and UI with your own.

## Step 3 — write your game contract

Implement [`ICasinoGameV2`](./CHAIN_WTF_CASINO_GAMES.md#21-icasinogamev2-full-solidity)
(`simulator/contracts/ICasinoGameV2.sol` in the package). The functions that matter most:

| Function          | What it does                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `onSessionStart`  | Validates the bet (`gameData`), sets up session state, usually requests randomness.       |
| `onRandomness`    | Receives the VRF result, computes the outcome, settles (or advances a multi-step game).   |
| `onPlayerAction`  | Optional — mid-session moves for multi-action games (hit/stand, reveal a mine, cash out). |
| `quoteCaps`       | Min/max wager for a given bet configuration.                                              |
| `quoteRiskParams` | Win probability + max payout (WAD-scaled) so the house can price portfolio risk.          |

Two shapes cover almost every game:

- **Instant** (coinflip, dice, slots): `onSessionStart` requests randomness, `onRandomness`
  settles. One transaction from the player's point of view.
- **Multi-action** (blackjack, mines): the session stays open across several `onPlayerAction`
  calls, each optionally requesting more randomness.

Both patterns, with full contract examples, are in
[Building Casino Games §2.3](./CHAIN_WTF_CASINO_GAMES.md#23-contract-patterns-instant-vs-multi-action).

Two rules worth knowing before you write a line of code:

- **Deriving dice/cards from random bytes**: use rejection sampling, never `byte % n` — see
  [Randomness → Dice](./RANDOMNESS_DICE.md).
- **The facet enforces phase rules, timeouts and payout caps** on top of your contract — read
  [Contract Constraints](./CONTRACT_CONSTRAINTS.md) so your state machine doesn't fight it.
  Slots-like games with rare huge payouts additionally need the tiered reserve model in
  [Slots Risk & Reserves](./SLOTS_RISK_AND_RESERVES.md).

## Step 4 — deploy locally and connect it

Drop your `.sol` file into `simulator/contracts/`. The local node watches the folder: it
compiles the file with solc, deploys every contract in it that implements `ICasinoGameV2`,
registers it on the local host and adds it to the simulator's game picker within a couple of
seconds. Edit the file and it redeploys automatically at a fresh address — no restart, no
external toolchain.

If your contract needs constructor arguments, deploy it yourself instead with your usual
toolchain against the simulator's chain (`http://127.0.0.1:8545`; the full deployment is served
at `http://localhost:3300/__local-contracts.json`). For example with Foundry:

```sh
forge create src/MyGame.sol:MyGame --rpc-url http://127.0.0.1:8545 \
  --private-key <dev key> --constructor-args <…>
```

Then paste the deployed address into the simulator's setup panel — unregistered contracts are
registered on the local host automatically. Either way, you can now open sessions against your
contract with a script before any UI exists, and watch them appear in the simulator's session
feed.

## Step 5 — build the guest UI

Start your frontend from the coinflip example (`examples/coinflip-public/`) or from scratch. The
whole bridge surface is small:

```typescript
import { connectGameToHost } from '@chain/casino-sdk/guest';
import type { HostApiV1, HostSnapshotV1 } from '@chain/casino-sdk/guest';

const connection = connectGameToHost({
  setState: async (snapshot: HostSnapshotV1 | null) => {
    // called on every host update: wallet status, balances, session rows
    render(snapshot);
  },
});

const hostApi: HostApiV1 = await connection.promise;

// Place a bet: ABI-encode your bet config as gameData
const { sessionKey } = await hostApi.openSession({
  wager: parseUnits('10', snapshot.token.decimals).toString(),
  gameData: encodeAbiParameters(...),
});

// ...watch snapshot.sessions.items for the row with your sessionKey to reach
// a terminal phase, decode raw.gameState, play your result animation, then:
await hostApi.revealOutcome({ sessionId });
```

The essential guest rules:

- Only enable betting when `snapshot.wallet.status === 'ready'`.
- Clamp the bet input to what the platform accepts right now: `computeMaxWager(snapshot, { maxMultiplierX })` (from `@chain/casino-sdk/guest`) turns the live `snapshot.casino` risk limits into your max wager — see [Building Casino Games §4](./CHAIN_WTF_CASINO_GAMES.md#clamping-the-bet-size-casino-block).
- Match your bet to a session row via the returned `sessionKey`; the row's `phaseName` turning
  terminal (`SETTLED` / `FORFEITED` / `CANCELLED`) is your settle signal.
- **Always call `revealOutcome` when your win animation finishes** — until then the host hides
  the payout from its balance displays so the top bar doesn't spoil the result.
- Call `connection.destroy()` on unmount.

The full lifecycle, snapshot reference, and per-game frontend patterns (coinflip, blackjack,
mines) are in [Building Casino Games §3–6](./CHAIN_WTF_CASINO_GAMES.md#3-bridge-sdk-guest--host).

Point the simulator at your dev server (e.g. `?game=http://localhost:5173`) and iterate. The
setup panel lets you crank up indexer lag, force wallet states, and simulate stuck randomness —
see [Local Simulator](./LOCAL_SIMULATOR.md) for the full tour.

## Step 6 — add the manifest

Serve a `game.manifest.json` from the **same origin** as your game (in a Vite app: `public/`).
Copy `examples/coinflip-public/public/game.manifest.json` and adjust. The `gameId` must follow
the canonical id rules and the host validates `presentation` and `capabilities` — validate yours
locally with `validateCasinoGameManifest` from the SDK
([details](./CHAIN_WTF_CASINO_GAMES.md#5-gamemanifestjson--host-validation)).

## Step 7 — test the unhappy paths

Before shipping, use the simulator to make sure your game survives production reality:

- **Slow indexer** — raise the indexed-feed lag in the setup panel; your game should ride the
  optimistic session rows without flicker or duplicate results.
- **Stuck randomness** — stop the local node and mine ~15 blocks
  (`cast rpc hardhat_mine 0x10`); the cancel-stuck-randomness path should surface cleanly.
- **Wallet not ready** — force `disconnected` / `setup-required` and check your non-ready
  screens.
- **Refresh mid-round** — reload the iframe during an open session; your UI should recover the
  session from the snapshot instead of starting blank.

## Step 8 — ship it

The final deliverables to the Chain.wtf team:

1. Your **audited game contract** (deployed address on the target chain).
2. A **static build of your frontend** hosted at a stable HTTPS URL, with `game.manifest.json`
   at the same origin.

The platform side (contract whitelist on `CasinoGameFacet`, indexer registration, catalog entry)
is wired by the Chain.wtf maintainers.

## Where to next

- [Building Casino Games](./CHAIN_WTF_CASINO_GAMES.md) — the complete reference this page
  summarizes.
- [Local Simulator](./LOCAL_SIMULATOR.md) — everything the local test environment can do.
- [Contract Constraints](./CONTRACT_CONSTRAINTS.md) — the rules the facet enforces on your
  contract.
