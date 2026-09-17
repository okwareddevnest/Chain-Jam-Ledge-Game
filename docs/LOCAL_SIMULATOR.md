# Local simulator — test games without the platform

The SDK ships a fully standalone local test environment in `simulator/`: a Vite + React harness
that mounts any game iframe by URL and drives it through the exact same `@chain/casino-sdk`
bridge as the production Chain.wtf host, plus a one-command local backend — its own chain, a
minimal casino deployment, and a real Verify Network VRF node. Everything runs on your machine;
no Chain.wtf account or backend access is needed.

If you can make your game fun and robust in the simulator, it will behave the same way in
production — the harness deliberately replicates the host's quirks (optimistic updates, lagging
data feeds, balance guarding) so you hit them on day one instead of after shipping.

## Quick start

No chain tooling is required — the local backend spawns an in-memory Hardhat node from its own
dependencies (already running your own chain? Point `RPC_URL` at it and it is used instead).

From the SDK package root (an npm workspace covering the simulator, the VRF node and the example
game):

```sh
npm install   # installs every workspace package in one go
npm start     # local chain + VRF node + deployment + harness (:3300) + coinflip example (:3100)
```

Open **http://localhost:3300** — the harness polls for the local deployment, fills the setup
panel and starts itself as soon as the chain is up. The pieces also run individually from
`simulator/`: `npm run local-node` (chain + VRF + deployment) and `npm run dev` (harness only).

The player defaults to dev-mnemonic account #0, which holds 1,000,000 test chUSD, and the game URL to
`http://localhost:3100` (the coinflip example). Point it at your own game in the collapsible
setup panel — an unregistered game contract is registered on the local host automatically under
the configured name. Query params override the saved setup:

```
http://localhost:3300/?game=http://localhost:5173&gameAddress=0x…&rpc=…
```

## What the local backend runs

`npm run local-node` starts and wires up:

1. **A chain** — attaches to `RPC_URL` (default `http://127.0.0.1:8545`) or spawns the bundled
   in-memory Hardhat node if nothing is listening.
2. **Verify Network VRF** — deploys the real router (vendored bytecode), registers a local
   fulfilling node (dev account #3) and keeps answering randomness requests with real ECVRF
   proofs. Your contract's randomness path runs for real, not mocked.
3. **A minimal casino**:
   - `LocalTestToken` — freely mintable 18-decimals chUSD stand-in.
   - `LocalCasinoHost` + `LocalCasinoVault` — a minimal stand-in for the production
     `CasinoGameFacet` that runs the full `ICasinoGameV2` session lifecycle (open →
     randomness / player actions → settle, escrow deltas, payout caps, forfeit +
     cancel-stuck-randomness) and emits **byte-identical events**. No diamond, no whitelist
     governance, no portfolio risk accounting.
   - `CoinflipGame` — the real production coinflip contract, so the harness works out of the box
     with the coinflip example iframe.
4. **Funding** — player tokens, vault liquidity and the VRF router client balance are topped up,
   and the deployment is written to `local-node/deployed.json` (served by the harness at
   `/__local-contracts.json`).

## Drop in your own game contract

Put a `.sol` file implementing `ICasinoGameV2` into `simulator/contracts/` (import the interface
as `./ICasinoGameV2.sol`; any other path ending in `ICasinoGameV2.sol`, such as your own repo's
`../interfaces/ICasinoGameV2.sol`, resolves to the same file). The local node watches the folder: every dropped or
edited file is compiled with solc (`viaIR`, same settings as the harness contracts), deployed to
the running chain, registered on the local host and added to the harness's game picker within a
couple of seconds — no restart, no external toolchain.

- Every deployable contract in the file that implements the interface is deployed; sibling
  `.sol` files in the folder can be pulled in via relative imports.
- Contracts with constructor arguments are skipped with a warning — deploy those with your own
  toolchain against `http://127.0.0.1:8545` and paste the address into the setup panel instead
  (unregistered contracts are registered on the local host automatically).
- Editing a file redeploys its games at fresh addresses; deleting it removes them from the
  picker. `ICasinoGameV2.sol`, `LocalCasinoHost.sol` and `LocalTestToken.sol` are the harness's own infrastructure
  and are excluded from the drop-in flow.

## What the harness replicates from production

The host side behaves like the real Chain.wtf host, so your game faces the real integration
quirks before it ever ships:

- **Optimistic sessions** — a `pending:<uuid>` row at phase `WAITING_RANDOMNESS` is pushed the
  moment `openSession` is called, then confirmed to the real session id via the broadcast tx
  hash (both arrival orders handled, exactly like production).
- **Two live data layers** — every chain event reaches the host twice: near-instantly on a
  flashblock push channel (in production the host observes flashblocks — sub-block
  preconfirmations — merged through a forward-only patch layer) and after a configurable lag on
  the indexed session feed (including the intermediate phase-`NONE` update right after
  `CasinoSessionOpened`).
- **Monotonic settled results** — the settled flip is atomic (payout + gameState together), and
  a published result never regresses.
- **Game-steered balance** — the displayed balance follows `betPlaced`/`revealOutcome` with a
  delayed chain reconcile, never a raw poll.
- **Stuck-randomness path** — an expired randomness deadline surfaces the permissionless
  `cancelStuckRandomness` banner. To see it: stop the local node and mine ~15 blocks
  (`cast rpc hardhat_mine 0x10`, or POST
  `{"jsonrpc":"2.0","id":1,"method":"hardhat_mine","params":["0x10"]}` to the RPC with curl).

## The setup panel

The collapsible sidebar is your chaos-engineering console:

- **Flashblock / indexer lag sliders** — tune both data layers live. Crank the indexer lag to
  watch your game ride the optimistic layer; a well-built game shows no flicker and no duplicate
  results.
- **Wallet status override** — force `ready` / `disconnected` / `setup-required` to exercise
  your game's non-ready screens.
- **Game URL + contract address** — swap between the example and your own game without
  restarting anything.

## Intentional differences from production

- Bets are plain EOA transactions instead of the host's gasless smart-vault signing flow. The
  game-facing API and timing are unchanged; `wallet.address` and `wallet.smartVaultAddress` are
  both the local EOA.
- `getRandomnessVerification` runs the production checks against the local Verify Network
  router (real ECVRF proofs and enclave signatures), so the
  provably-fair view is testable locally. It is optional and feature-detected, so your game must
  still handle hosts without it.

## Editing the harness contracts

The simulator's Solidity sources live in `simulator/contracts/` and compile with
`npm run compile-contracts` (solc, `viaIR`), which regenerates the checked-in
`src/local-node/artifacts.ts`. Only needed if you change the `.sol` sources.
