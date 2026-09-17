# Casino SDK simulator

A fully standalone local test setup for casino games: a Vite + React harness that mounts any game
iframe by URL and drives it through the exact same `@chain/casino-sdk` bridge as the Chain.wtf
host app, plus a one-command local backend — its own chain, a minimal casino deployment, and a
real Verify Network VRF node. Everything runs on your machine; no Chain.wtf account or backend
access is needed.

## Quick start

No chain tooling is required — the local backend spawns an in-memory Hardhat node from its own
dependencies (already running your own chain? Point `RPC_URL` at it and it is used instead).

From the SDK package root (one directory up — it is an npm workspace covering the simulator, the
VRF node and the example game):

```sh
npm install   # installs every workspace package in one go
npm start     # local chain + VRF node + deployment + harness (:3300) + coinflip example (:3100)
```

Open http://localhost:3300 — the harness polls for the local deployment, fills the setup panel
and starts itself as soon as the chain is up. The pieces also run individually from this
directory: `npm run local-node` (chain + VRF + deployment) and `npm run dev` (harness only).

The player defaults to dev-mnemonic account #0, which holds 1,000,000 test chUSD, and the game URL to
`http://localhost:3100` (the coinflip example). Pick your game's address in the collapsible setup
panel — an unregistered game contract is registered on the host automatically under the
configured name. Query params override the saved setup:
`?game=http://localhost:3100&gameAddress=0x…&rpc=…`.

## What `npm run local-node` runs

1. **Chain** — attaches to `RPC_URL` (default `http://127.0.0.1:8545`) or spawns the bundled
   in-memory Hardhat node if nothing is listening.
2. **Verify Network VRF** — deploys the real router (vendored bytecode) via
   `../local-verify-network`, registers the local node (dev account #3) and keeps fulfilling
   requests with real ECVRF proofs.
3. **Minimal casino** (`contracts/`, precompiled into `src/local-node/artifacts.ts`):
   - `LocalTestToken` — freely mintable 18-decimals chUSD stand-in.
   - `LocalCasinoHost` + `LocalCasinoVault` — a minimal stand-in for the production
     `CasinoGameFacet` that runs the full `ICasinoGameV2` session lifecycle (open → randomness /
     player actions → settle, escrow deltas, payout caps, forfeit + cancel-stuck-randomness) with
     the production's **stateless sessions** (only a hash is stored; the encoded snapshot from
     `contracts/casino/` is emitted every step and echoed back) and emits **byte-identical
     events**, requesting VRF straight from the router. No diamond, no whitelist governance, no
     portfolio risk accounting.
   - `CoinflipGame` — the real production coinflip contract, vendored as its compiled artifact
     (`src/local-node/coinflip-game-artifact.ts`), so the harness works out of the box with the
     coinflip example iframe against the exact deployed game logic.
4. Funds everything (player tokens, vault liquidity, router client balance) and writes
   `local-node/deployed.json`, which the harness serves at `/__local-contracts.json`.

Test your own game by dropping its `.sol` file into `contracts/` — the local node watches the
folder, compiles every dropped or edited file with solc, deploys the contracts implementing
`ICasinoGameV2` (import it as `./ICasinoGameV2.sol`), registers them on the host
and adds them to the harness's game picker live. Contracts with constructor arguments are
skipped with a warning — deploy those with your own toolchain and paste the address into the
setup panel instead. `ICasinoGameV2.sol`, `LocalCasinoHost.sol` and `LocalTestToken.sol` are the harness's own
infrastructure and are excluded from the drop-in flow.

## What the harness replicates

The host side behaves like the production Chain.wtf host, so your game faces the real integration
quirks before it ever ships:

- **Optimistic sessions** — a `pending:<uuid>` row at phase `WAITING_RANDOMNESS` is pushed the
  moment `openSession` is called, then confirmed to the real session id via the broadcast tx hash
  (both arrival orders handled, exactly like production).
- **Two live data layers** — every chain event reaches the host twice: near-instantly on a
  flashblock push channel (in production the host observes flashblocks — sub-block
  preconfirmations — and merges them through a forward-only patch layer) and after a configurable
  lag on the indexed session feed the host reads sessions from (including the intermediate
  phase-`NONE` update right after `CasinoSessionOpened`).
- **Monotonic settled results** — the settled flip is atomic (payout + gameState together), and a
  published result never regresses.
- **Game-steered balance** — the displayed balance follows `betPlaced`/`revealOutcome` with a
  delayed chain reconcile, never a raw poll.
- **Stuck-randomness path** — an expired randomness deadline surfaces the permissionless
  `cancelStuckRandomness` banner (stop the local node and mine ~15 blocks to see it:
  `cast rpc hardhat_mine 0x10`).

The setup panel (collapsible sidebar) tunes the flashblock and indexer lags live — crank the
indexer lag to watch your game ride the optimistic layer — and can force the wallet status
(`ready` / `disconnected` / `setup-required`) to exercise the game's non-ready screens.

Two diagnostic aids for chasing visual glitches:

- Every snapshot pushed to the iframe is logged (`[host-push #n] …`, debug level) and checked
  against the previous one; transitions a game could visually trip on (a session vanishing, a
  settled round mutating, the newest round regressing) log as console warnings. The full history
  sits on `window.__hostSnapshotTrace` — `copy(window.__hostSnapshotTrace)` to export it.
- `?maskWaiting=1` masks mid-round `WAITING_RANDOMNESS` states the way the current production
  projection still does (a round appears to sit in `WAITING_PLAYER_ACTION` until it settles).
  This is prod-parity legacy behavior, not the target contract — if your game only misbehaves
  with masking off, it is resetting on mid-round waiting states; see "Snapshot update semantics"
  in `docs/CHAIN_WTF_CASINO_GAMES.md`.

Intentional differences from production: bets are plain EOA transactions instead of the host's
gasless signing flow (the game-facing API and timing are unchanged; `wallet.address` and
`wallet.smartVaultAddress` are both the local EOA). `getRandomnessVerification` runs the same
checks as production against the local router, so the provably-fair view works locally.

## Editing the harness contracts

`contracts/*.sol` compile with `npm run compile-contracts` (solc, `viaIR`), which regenerates the
checked-in `src/local-node/artifacts.ts`. Only needed after changing the .sol sources.
`contracts/casino/` mirrors the production `CasinoSession` struct and `CasinoSessionCodec` (with
OpenZeppelin's `SafeCast` inlined) so the harness commits byte-identical snapshots; keep it in
sync with `packages/contracts/contracts/Casino/` in the chain repo.
