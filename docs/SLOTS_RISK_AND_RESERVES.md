# Slots: `quoteRiskParams` and tiered reserves

## Why this matters

Slot paytables are **heavy-tailed**: a tiny probability mass at huge multipliers dominates variance. The protocol’s portfolio model uses:

1. **`quoteCaps`** — per-session escrow / reserved-profit ceilings.
2. **`quoteRiskParams`** — inputs for **aggregate** vault reserve (VaR + jackpot tier).

If you under-report `maxPayout` or mis-report the jackpot **`probabilityWad`**, you risk **`InsufficientPortfolioReserve`** at `openSession` or incorrect risk accounting.

## What to return for a typical single-spin slot

Align with the interface in [`ICasinoGameV2.sol`](../simulator/contracts/ICasinoGameV2.sol):

- **`maxPayout`**: Worst-case total payout for the round (e.g. `wager * topMultiplier`). Used for high-multiplier floor and heavy-tail detection.
- **`probabilityWad`**: Win probability of the **jackpot (top) tier** in WAD (1e18 = 100%). The facet + `CasinoRiskLib` use this for tiered jackpot pooling when `isHeavyTail` is true.
  - Must be **≤ 1 WAD**.
- **`expectedPayout`**: Mean payout for the round consistent with your RTP (used in aggregate expectations).
- **`subJackpotVarianceScaled`**: Usually **`0`**. Non-zero when you supply a precomputed variance for the distribution **after** removing the jackpot tier (advanced; see `CasinoRiskLib` / full risk doc).

## Heavy-tail regime (on-chain)

`CasinoRiskLib.isHeavyTail` is roughly:

- `maxPayout / wager >` governance **multiplier threshold** (default **100**), **and**
- `probabilityWad <` governance **probability threshold** (default **0.1%** = **1e15** WAD).

Then the **tiered** model applies: explicit jackpot reserve + sub-jackpot VaR instead of naive normal VaR on the full tail.

---

## Example paytable (fictional)

Single-spin game: outcome is one row; payout = `wager × multiplier` (0 = loss). Probabilities sum to 1. RTP ≈ **92%** (house edge 8%).

| Tier    | Multiplier M |             Probability p | RTP contribution p·M |
| ------- | -----------: | ------------------------: | -------------------: |
| Jackpot |   **5 000×** | **2×10⁻⁶** (1 in 500 000) |                 0.01 |
| Major   |         200× |                    5×10⁻⁵ |                 0.01 |
| Big     |          50× |                     0.002 |                 0.10 |
| Small   |          10× |                      0.05 |                 0.50 |
| Mini    |           2× |                      0.15 |                 0.30 |
| Loss    |           0× |                  0.795948 |                 0.00 |
| **Σ**   |              |              **1.000000** |       **RTP = 0.92** |

Checklist for risk:

- **`maxPayout / wager` = 5 000** → above default multiplier threshold **100**.
- **Jackpot probability** = **2×10⁻⁶** &lt; **0.001** (10⁻³) → below default probability threshold when expressed in WAD (**2×10⁻⁶ × 1e18 = 2×10¹²** WAD, and **1e15** WAD = 0.1% — **2×10¹² &lt; 1e15**). So **`isHeavyTail`** is **true** with defaults: tiered reserve applies on-chain.

---

## Example: tiered VaR (how the protocol uses your quote)

This mirrors `docs/CASINO_RISK_MANAGEMENT.md` §6.4.4–6.4.5; numbers are **illustrative** (governance multipliers, N, and w are examples).

**Given**

- Top tier: multiplier **M<sub>max</sub> = 5 000**, probability **p<sub>J</sub> = 2×10⁻⁶** (this is what you expose as **`probabilityWad`** = `2e12` in WAD terms: `p_J * 1e18`).
- Suppose **N = 100** concurrent sessions on this game type, **w = 10** tokens per spin (largest active wager **w<sub>max</sub> = 10** for the illustration).
- Confidence **z = 3.72** (the portfolio default, `confidenceMultiplierBps = 372` → 99.99%). The **same** z drives both the jackpot count below and the Tier-2 VaR.

**Tier 1 — jackpot reserve**

The number of **simultaneous** jackpots is Poisson with mean **λ = N · p<sub>J</sub>**. We reserve a confidence-bounded upper quantile via the Poisson normal upper bound, floored at 1 and **clamped to N** (you can never have more concurrent jackpots than open bets):

$$
\lambda = N \cdot p_J = 100 \cdot 2\times 10^{-6} = 2\times 10^{-4}
$$

$$
k_j = \min\Big(N,\ \max\big(1,\ \left\lceil \lambda + z\sqrt{\lambda}\,\right\rceil\big)\Big)
= \min\big(100,\ \max(1,\ \lceil 0.0002 + 3.72\sqrt{0.0002}\,\rceil)\big)
= \max(1, \lceil 0.053\rceil) = 1
$$

$$
\text{jackpotReserve} \approx k_j \cdot (M_{\max} - 1) \cdot w_{\max}
= 1 \cdot 4999 \cdot 10 = 49990\ \text{tokens}
$$

So one full jackpot-sized loss to the vault is covered **before** applying normal-VaR on the rest of the distribution. Unlike a flat coverage factor, this self-adjusts to traffic: as N (hence λ) grows, the reserved jackpot count rises at the same confidence as the VaR, and it never exceeds the live session count.

**Tier 2 — sub-jackpot mass**

Strip the jackpot tier from the second moment of the multiplier (per-spin, unit wager):

$$
\mathbb{E}[M^2] = \sum_k p_k M_k^2
$$

Jackpot tier contributes **p<sub>J</sub>·M<sub>max</sub>²** = **2×10⁻⁶ × 5 000² = 50**. The protocol removes that chunk for the **sub-jackpot** variance leg and runs the portfolio VaR machinery on the remainder (plus safety multipliers, etc.). You do **not** reimplement that in Solidity; you only supply honest **`quoteRiskParams`** so `CasinoRiskLib` + the facet select tiered vs single-tier math.

**Contrast — naive worst case**

100 spins × worst loss ≈ **100 × (5 000 × 10) = 5 000 000** tokens reserved if you reserved full worst-case per seat — the tiered model avoids that by separating the rare jackpot from the bulk of the paytable.

---

## Implementing `quoteCaps`

For a **single-spin** slot, the player posts **`wager`** once; there is no extra stake mid-round.

- **`maxEscrowStake`**: at least **`wager`** (typically **`maxEscrowStake = wager`**).
- **`maxReservedProfit`**: worst-case **vault liability** above the wager for that round: **`max(0, maxPayout - wager)`** when the worst case is a single-line jackpot on **`wager`**.

If **`gameData`** selects paylines or denomination, decode it the same way in **`quoteCaps`** and **`quoteRiskParams`** so caps and risk always match the round you will run in **`onSessionStart` / `onRandomness`**.

```solidity
function quoteCaps(uint256 wager, bytes calldata gameData)
    external
    view
    returns (uint256 maxEscrowStake, uint256 maxReservedProfit)
{
    Paytable memory t = paytableFor(gameData);
    uint256 maxPayout = wager * t.jackpotMultiplier; // e.g. 5000 * wager for top tier
    maxEscrowStake = wager;
    maxReservedProfit = maxPayout > wager ? maxPayout - wager : 0;
}
```

(Adjust naming/scaling to your storage; the **idea** is: **`maxReservedProfit`** = peak profit the vault might owe **beyond** escrowed stake for this session.)

---

## Implementing `quoteRiskParams`

**Contract surface** (from `ICasinoGameV2`):

- **`maxPayout`**: worst-case **token** payout for the round (same units as **`wager`**).
- **`probabilityWad`**: **p<sub>jackpot</sub> × 1e18** for the **top tier** only (the tier with **largest multiplier**).
- **`expectedPayout`**: **RTP × wager** in token units, i.e. $\sum_k p_k \cdot \text{payout}_{k}$ for one spin.
- **`subJackpotVarianceScaled`**: start with **`0`**; set only if you implement the advanced precomputed sub-jackpot variance path described in `CasinoRiskLib` / `CASINO_RISK_MANAGEMENT.md`.

**Worked mapping for the fictional paytable** (one spin, **`wager = w`**):

| Return field               | Value                                                         |
| -------------------------- | ------------------------------------------------------------- |
| `maxPayout`                | `w * 5000`                                                    |
| `probabilityWad`           | `2e12` — i.e. **`(2e-6) * 1e18`**                             |
| `expectedPayout`           | **`(w * 9200) / 10000`** if RTP is exactly **92%** = 9200 BPS |
| `subJackpotVarianceScaled` | **`0`**                                                       |

```solidity
uint256 internal constant WAD = 1e18;
uint16 private constant RTP_BPS = 9200; // 92.00%

// pJackpot = 2e-6  =>  probabilityWad = 2e12
uint256 private constant JACKPOT_PROB_WAD = 2e12;

function quoteRiskParams(uint256 wager, bytes calldata gameData)
    external
    view
    returns (
        uint256 maxPayout,
        uint256 probabilityWad,
        uint256 expectedPayout,
        uint256 subJackpotVarianceScaled
    )
{
    Paytable memory t = paytableFor(gameData);
    maxPayout = Math.mulDiv(wager, t.jackpotMultiplier, 1); // e.g. 5000 * w
    probabilityWad = JACKPOT_PROB_WAD; // must match actual top-tier probability
    expectedPayout = Math.mulDiv(wager, RTP_BPS, 10_000);
    subJackpotVarianceScaled = 0;
}
```

**Invariants you must preserve**

1. **`probabilityWad`** is exactly the **marginal** probability of the **highest-multiplier** winning outcome used for heavy-tail detection — not “any win”, not average win chance.
2. **`expectedPayout`** must match the **same** paytable you simulate in **`onRandomness`** (same RTP).
3. If you have multiple **`gameData`** variants (different RTP skins), recompute **`maxPayout`**, **`probabilityWad`**, and **`expectedPayout`** from the same tables.

---

## Implementing session phases (typical RNG slot)

1. **`onSessionStart`**: Decode **`ctx.gameData`**, commit **`newGameState`** (e.g. pending spin), set **`nextPhase = WAITING_RANDOMNESS`**, **`requestRandomnessNow = true`**, **`reservedProfitDelta`** per your game’s pattern (see `CoinflipGame` / facet for how reserved profit interacts with **`quoteCaps`**).
2. **`onRandomness`**: Map **`randomness`** to an outcome index using a **reproducible** function (uniform draw over cumulative weights), compute **`payout`**, set **`SETTLED`**, **`requestRandomnessNow = false`**.

`onPlayerAction` can **`revert`** if the slot has no mid-round choices.

---

## Reference paytable and math (full doc)

Section **6.4** of `docs/CASINO_RISK_MANAGEMENT.md` in the monorepo walks through:

- A reference 98% RTP paytable with **10,000×** jackpot
- Why naive VaR fails
- Tier 1 (jackpot reserve) + Tier 2 (sub-jackpot VaR)
- Older pseudocode may show `probabilityBps`; the **live interface uses `probabilityWad`**. Always match **`ICasinoGameV2`**.

## Doc drift warning

`CASINO_RISK_MANAGEMENT.md` is the narrative spec; **`ICasinoGameV2` + `CasinoGameFacet` + `CasinoRiskLib`** are the source of truth for exact field names and units.
