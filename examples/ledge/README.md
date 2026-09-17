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
