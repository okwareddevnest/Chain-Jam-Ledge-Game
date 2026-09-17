# LEDGE

**Chain Jam Vol. 1 entry.** Five priced piles sit on a ledge. You get five coins. Spread
them across the lanes and topple what you can.

Bigger pile, bigger prize, harder to shift. Every coin is worth exactly the same expected
return wherever you drop it — the lane only chooses your volatility.

- **Declared theoretical RTP: 96.00%**, identical for all 126 possible allocations
- **Max multiplier: 50x** on a single lane, 73x across a full spread
- One transaction, one VRF request, instant settle

Full derivation and the reasoning behind the design: [DESIGN.md](./DESIGN.md).

## Run it

From the SDK package root:

```sh
npm install
npm start
```

Then open <http://localhost:3300>, expand the setup panel, and set **Game contract** to
`LedgeGame`. The game itself serves on <http://localhost:3101>.

> The simulator defaults to the bundled `CoinflipGame`. If you forget to switch it, the
> bet reverts with `CoinflipGame__InvalidGameData()` — that contract is being handed
> LEDGE's `uint8[5]` allocation. Switching the dropdown needs a **Restart harness** to
> take effect.

Opening <http://localhost:3101> directly runs the **standalone demo**: the same math
against browser CSPRNG randomness with play money, which is what the jam requires of a
submitted entry.

## Deploying for real

The local simulator is for development only. The shipped game runs against a contract
deployed on Base and a frontend served from your own HTTPS origin.

### 1. Deploy the contract

```sh
cp .env.example ../../.env.deploy   # then fill in RPC + deployer key
cd ../..
set -a; . ./.env.deploy; set +a
npm run deploy:ledge                # dry run: compile, simulate, report gas. Sends nothing.
LEDGE_CONFIRM=84532 npm run deploy:ledge   # broadcast to Base Sepolia
```

`.env.*` is gitignored. The key is never logged and never written to disk by the script.
Broadcasting requires `LEDGE_CONFIRM` to equal the target chain id, so the default is
always a dry run. The address, tx hash and block land in `deployments/<chainId>.json`.

### 2. Verify the live contract against the TypeScript mirror

```sh
LEDGE_VERIFY_RPC_URL=https://sepolia.base.org LEDGE_VERIFY_ADDRESS=0xYourDeployedAddress npm --prefix examples/ledge test
```

This runs the same 126-allocation, 150-seed parity proof against the deployed bytecode.

### 3. Host the frontend

**Deploy from the repository root, not from `examples/ledge`.**

In the Vercel dashboard leave **Root Directory** blank (`./`). The game is a workspace
package that depends on `@chain/casino-sdk` via `file:../..`, so installing from
`examples/ledge` cannot resolve it and the build fails. `vercel.json` at the repo root
already sets everything:

| Setting | Value | Where it comes from |
| ------- | ----- | ------------------- |
| Root Directory | *(blank — the repo root)* | set in the Vercel dashboard |
| Framework Preset | Other | set in the Vercel dashboard |
| Install Command | `npm ci` | `vercel.json` |
| Build Command | `npm run build:ledge` | `vercel.json` |
| Output Directory | `examples/ledge/dist` | `vercel.json` |

Leave the install/build/output fields untouched in the dashboard so `vercel.json` wins.

```sh
npx vercel --prod          # run from the repo root
# or
npx netlify deploy --prod  # netlify.toml already sets base, command and publish
```

Both open CORS on `game.manifest.json`, which the host fetches cross-origin, and both send
`frame-ancestors 'self' https://chain.wtf https://*.chain.wtf` so only the casino and the
jam gallery can frame the game.

Verified from a clean clone: `npm ci && npm run build:ledge` produces
`examples/ledge/dist/` with `index.html`, `game.manifest.json`, `icon.svg`, `cover.svg`
and hashed assets.

### 3a. Two edits once you know the domain

Both need an absolute URL, so they cannot be filled in before the first deploy. The host
passes manifest asset URLs through untouched (`src/manifest.ts:115-130`) — a relative path
would resolve against *its* origin, not yours.

In `public/game.manifest.json`, add:

```json
"assets": {
  "iconUrl": "https://YOUR-DOMAIN/icon.svg",
  "coverUrl": "https://YOUR-DOMAIN/cover.svg"
}
```

In `index.html`, make the social image absolute:

```html
<meta property="og:image" content="https://YOUR-DOMAIN/cover.svg" />
```

### 4. Hand the address to Chain.wtf

A deployed contract still cannot take a single bet until the Chain.wtf team whitelists it
on `CasinoGameFacet`; until then `openSession` reverts with
`CasinoGameFacet__GameNotWhitelisted`. Whitelisting, indexer registration and the catalog
entry are theirs to do — send them the deployed address and the hosted URL.

## Layout

| Path | What it is |
| ---- | ---------- |
| `../../simulator/contracts/LedgeGame.sol` | The game contract (`ICasinoGameV2`, instant pattern) |
| `src/lib/ledge.ts` | Game math — the TypeScript mirror of the contract |
| `src/lib/ledge.test.ts` | Paytable invariants, wire format, sampler, resolution |
| `src/lib/parity.test.ts` | Cross-checks the deployed contract against the mirror |
| `src/lib/useLedgeRound.ts` | Round state machine: host bets and the standalone demo |
| `src/lib/useCasinoHost.ts` | Bridge wiring (copied from the coinflip example) |
| `src/lib/sound.ts` | Synthesised foley — no audio files, nothing to download |
| `src/components/Board.tsx` | The ledge, the piles, the cascade |
| `public/game.manifest.json` | Host manifest (`gameId: LedgeGame` → canonical `ledge`) |
| `public/icon.svg`, `public/cover.svg` | Favicon and catalog art |
| `src/components/Logo.tsx` | The mark, inline so it costs no request |
| `ARCHITECTURE.md` | Bet lifecycle, round state machine, trust boundary (mermaid) |

## Tests

```sh
npm test            # unit + parity
npm run check-types
```

`parity.test.ts` calls the **deployed contract** over all 126 allocations and 150 random
seeds and asserts it agrees with the TypeScript mirror on lanes, payout, reserve and risk
quotes. It skips itself when the local chain is not running, so the unit suite still works
offline.

That test is the important one: the UI animates from its own re-derivation of the outcome,
so any divergence between the two implementations would show the player one result and pay
them another.

## Design notes worth knowing

- **Why not a literal coin pusher.** Step handlers are `view`, so a game contract can write
  no storage and a shelf cannot persist between sessions. The piles are static and priced
  instead — you can see what you are shooting at.
- **RTP is strategy-independent** because `PRIZE[i] * TOPPLE_BASE[i]` is the same constant
  on every lane. One declarable number, no optimal play that beats it.
- **Heavy-tail is avoided by construction.** The reserve path needs `maxPayout/wager > 100`;
  the worst case here is 73x, so it never engages.
- **Rejection sampling, not `% n`.** Draws read 3 bytes, reject at or above 16,500,000, then
  take `% 375000`. Identical in Solidity and TypeScript, including the `keccak256` re-hash
  when the seed runs out.
- **The settling step returns `escrowDelta = 0` and `reservedProfitDelta = 0`.** Releasing
  the reserve there caps the payout at the stake and reverts every win above 1x.
