# LEDGE — design

Chain Jam Vol. 1 entry. An instant-settle casino game on the Chain casino SDK.

## The game in one sentence

Five piles of coins sit on a ledge; you have five coins; drop them where you like and
whatever you topple, you keep.

## Why this and not a literal coin pusher

A real coin pusher needs a shelf that persists between plays. It cannot exist here:
`ICasinoGameV2` step handlers are `view` (`simulator/contracts/ICasinoGameV2.sol:49-73`,
reached by `staticcall` per `docs/CONTRACT_CONSTRAINTS.md`), so a game contract can write
no storage. All state lives in per-session `gameState` bytes and dies with the session.

A pusher whose pile is decorative is a slot in a costume, and Novelty is a scored
criterion. So the piles became **static, visible, and priced** — you can see exactly what
you are shooting at before you commit. That reads from a single screenshot, which is what
the Simplicity criterion actually measures.

## Board

Five lanes. Lane `i` holds a pile worth `M[i] x wager`:

| Lane | Prize | Pile reads as |
| ---- | ----- | ------------- |
| 1    | 1x    | a few coins   |
| 2    | 2x    | a small stack |
| 3    | 5x    | a real stack  |
| 4    | 15x   | a heavy pile  |
| 5    | 50x   | the hoard     |

`M = [1, 2, 5, 15, 50]` — whole multipliers of the **full wager**, never a fraction of it.
That is deliberate: every payout is `M[i] * wager`, an exact integer product, so nothing
downstream can round.

## The decision

You hold 5 coins and assign them across the lanes however you like, then drop.
More coins on a lane = better chance to topple that lane. One lane topples or it doesn't;
lanes resolve independently.

**Every coin is worth exactly the same expected return wherever you put it.** The lane
only chooses your volatility:

- spread 1-1-1-1-1 -> frequent small wins, a 3.5e-8 dream of taking all five
- stack 5 on lane 5 -> 1.92% at 50x, nothing the rest of the time

## Math

Topple probability for `k` coins on lane `i`:

```
q_i(k) = RTP * k / (N_COINS * M[i])        RTP = 0.96, N_COINS = 5
```

Expected value of those `k` coins = `M[i] * wager * q_i(k)` = `0.96 * wager * k / 5`,
independent of `i`. Sum over any allocation with `sum(k) = 5` and you get `0.96 * wager`.

### Exact integer form

Probabilities are compared against a fixed denominator so the contract and the UI agree
to the wei:

```
PROB_DENOM = 375000
BASE       = [72000, 36000, 14400, 4800, 1440]
threshold_i(k) = BASE[i] * k          // lane i topples when draw < threshold
q_i(k)         = BASE[i] * k / 375000
```

| Lane | Prize | q(1 coin) | q(5 coins) |
| ---- | ----- | --------- | ---------- |
| 1    | 1x    | 19.2%     | 96.0%      |
| 2    | 2x    | 9.6%      | 48.0%      |
| 3    | 5x    | 3.84%     | 19.2%      |
| 4    | 15x   | 1.28%     | 6.4%       |
| 5    | 50x   | 0.384%    | 1.92%      |

**The invariant that makes it work:** `M[i] * BASE[i] == 72000` for every lane. That single
identity is why RTP is strategy-independent, and it is asserted directly in the tests.

```
RTP = 72000 * N_COINS / PROB_DENOM = 360000 / 375000 = 0.96 exactly
```

**Declared theoretical RTP: 96.00%** — inside the jam's 93-98% band, and identical for
every one of the 126 possible allocations.

### Risk quoting

For an allocation with the set of used lanes `U = { i : k[i] > 0 }`:

```
maxPayout      = wager * sum(M[i] for i in U)          // every used lane topples
expectedPayout = wager * 24 / 25                       // 0.96 * wager, exact
probabilityWad = product(q_i(k[i]) for i in U) * 1e18  // top-tier outcome only
maxEscrowStake    = wager
maxReservedProfit = maxPayout - wager
```

`probabilityWad` is the probability of the single highest-paying outcome, not any win —
per `docs/SLOTS_RISK_AND_RESERVES.md:172`.

### Heavy-tail: avoided by construction

`CasinoRiskLib.isHeavyTail` needs `maxPayout/wager > 100` **and** `probabilityWad < 1e15`.
The worst case here is spreading one coin per lane: `sum(M) = 1+2+5+15+50 = 73`.

**73 < 100, so the multiplier condition is false for every possible allocation** and the
tiered jackpot reserve path can never engage. `subJackpotVarianceScaled = 0`.

## Contract shape

Instant pattern (`docs/CHAIN_WTF_CASINO_GAMES.md:159-163`):

- `onSessionStart` — decode and validate the allocation, reserve profit, request randomness
- `onRandomness` — draw per used lane, settle, `SETTLED`
- `onPlayerAction` — reverts; there are no mid-round moves
- `quoteForfeitPayout` — returns `0`; an instant game never reaches `WAITING_PLAYER_ACTION`

Every payout number flows through one internal function so `quoteCaps`, `quoteRiskParams`,
`onSessionStart` and `onRandomness` cannot disagree by a base unit
(`docs/CONTRACT_CONSTRAINTS.md:45`).

On the settling step: `escrowDelta = 0`, `reservedProfitDelta = 0`. The facet releases the
reserve itself; releasing it here would cap the payout at the stake and revert every win
above 1x (`docs/CONTRACT_CONSTRAINTS.md:49-51`).

### Randomness

Each used lane needs a uniform draw in `[0, 375000)`. `375000 < 2^24`, so each draw reads
3 bytes:

```
limit = floor(2^24 / 375000) * 375000 = 44 * 375000 = 16500000
```

Reject any 3-byte value `>= limit`, then take `% 375000`. Rejection sampling, never a raw
modulo — required by `docs/RANDOMNESS_DICE.md` and `docs/CONTRACT_CONSTRAINTS.md`. When the
32 seed bytes are exhausted the seed is re-hashed with `keccak256`, matching the canonical
`_rollDie` loop.

Acceptance rate per draw is 98.3%, and at most 5 draws are needed.

### Wire format

```solidity
gameData  = abi.encode(uint8[5] allocation)              // must sum to 5
gameState = abi.encode(uint8[5] allocation,
                       bool[5]  toppled,
                       uint256  payout)                  // written on settle
```

The UI decodes `gameState` to animate exactly which lanes went, so the animation is a
replay of the settled chain state rather than a client-side guess.

## Feel

One screen, no scroll, no manual. The piles are the paytable — the prize is drawn as the
thing you are trying to knock off, so there is nothing to read.

Resolution plays lane by lane, left to right, so five separate beats of tension land in one
drop instead of a single binary flash. A lane that shudders and holds is the near-miss, and
it is the whole reason to come back.

`prefers-reduced-motion` collapses the cascade to a single clean state change.
