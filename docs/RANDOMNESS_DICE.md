# Randomness → unbiased d6 (casino games)

**Audience:** Agents and humans implementing **`ICasinoGameV2.onRandomness`** or off-chain mirrors (mocks, tests, guest previews).

**Applies to:** Any casino game that maps facet / VRF **`bytes32`** randomness to one or more **six-sided dice** (faces `1..6`). Multi-action games (Space Dice, Mines tile reveals that use byte streams, etc.) use the same byte-level rules.

---

## Rule (read this first)

> **Never map a uniform byte to `1..6` with `(byte % 6) + 1` alone.**

`256` is not divisible by `6`, so faces **1–4** are each ~**0.39 pp** more likely than **5–6** when you raw-modulo a byte. Auditors treat this as a defect.

**Required for byte-level d6:** **rejection sampling** — only use bytes in `[0, DIE_REJECT − 1]`, then `% 6`.

| Constant     | Value | Meaning                        |
| ------------ | ----- | ------------------------------ |
| `DIE_FACES`  | `6`   | Faces `1..6` after `+ 1`       |
| `DIE_REJECT` | `252` | `42 × 6`; reject `byte >= 252` |

```solidity
face = (byte % DIE_FACES) + 1   // ONLY when byte < DIE_REJECT
```

If the cursor exhausts the current 32-byte word, expand: `seed = keccak256(abi.encodePacked(seed))`, `idx = 0`. Thread **`seed` + `idx`** across multiple dice in the same fulfillment.

---

## Why naive `% 6` is wrong

| `b % 6` | die face | # of bytes `b ∈ [0,255]` |
| ------- | -------- | ------------------------ |
| 0       | 1        | 43                       |
| 1       | 2        | 43                       |
| 2       | 3        | 43                       |
| 3       | 4        | 43                       |
| 4       | 5        | 42                       |
| 5       | 6        | 42                       |

`256 mod 6 = 4` → remainders `0..3` each get one extra preimage.

---

## Canonical algorithm

### Two dice from one `bytes32`

```text
seed ← randomness
(d1, idx, seed) ← rollDie(seed, 0)
(d2, _, _)      ← rollDie(seed, idx)
```

- Rejection rate per byte: `4/256` (~1.56%).
- Expected bytes per die: `256/252 ≈ 1.016`.
- Rehash from 32 VRF bytes is negligible in practice.

### Reference implementation (Solidity)

Copy into your game contract; call from **`onRandomness`** before payout / phase logic.

```solidity
uint8 internal constant DIE_FACES = 6;
uint8 internal constant DIE_REJECT = 252; // 42 * 6

function _diceFromRandomness(bytes32 randomness)
    internal
    pure
    returns (uint8 d1, uint8 d2)
{
    uint256 idx;
    bytes32 seed = randomness;
    (d1, idx, seed) = _rollDie(seed, idx);
    (d2,) = _rollDie(seed, idx);
}

function _rollDie(bytes32 seed, uint256 idx)
    internal
    pure
    returns (uint8 die, uint256 nextIdx, bytes32 nextSeed)
{
    while (true) {
        if (idx < 32) {
            uint8 b = uint8(seed[idx]);
            idx++;
            if (b < DIE_REJECT) {
                return ((b % DIE_FACES) + 1, idx, seed);
            }
            continue;
        }
        seed = keccak256(abi.encodePacked(seed));
        idx = 0;
    }
}
```

**Production reference:** Space Dice (`SpaceDice.sol` in the spacedice game repo) — same algorithm.

### Reference implementation (TypeScript)

Must match Solidity (reject threshold, `keccak256` on raw 32 bytes, cursor threading). Use in mocks and tests; **do not** duplicate a “close enough” variant in the guest hook.

```ts
import { hexToBytes, keccak256 } from 'viem';

const DIE_FACES = 6;
const DIE_REJECT = 252;

function expandSeed(seed: Uint8Array): Uint8Array {
  return hexToBytes(keccak256(seed));
}

function rollDie(
  seed: Uint8Array,
  start: number,
): [face: number, next: number, seedOut: Uint8Array] {
  let idx = start;
  let current = seed;
  while (true) {
    if (idx < current.length) {
      const b = current[idx];
      idx++;
      if (b < DIE_REJECT) return [(b % DIE_FACES) + 1, idx, current];
      continue;
    }
    current = expandSeed(current);
    idx = 0;
  }
}

export function diceFromRandomness(randomBytes: Uint8Array): [number, number] {
  if (randomBytes.length === 0) throw new Error('Need random bytes to derive 2d6');
  const [d1, i, seed] = rollDie(randomBytes, 0);
  const [d2] = rollDie(seed, i);
  return [d1, d2];
}
```

---

## Agent checklist

| DO                                                               | DON'T                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| Reject `byte >= DIE_REJECT` before `% 6`                         | `(randomness[0] % 6) + 1` without rejection          |
| Pass updated `seed` + `idx` to the second die                    | Always use `randomness[0]` and `randomness[1]`       |
| Rehash with `keccak256(abi.encodePacked(seed))` when `idx == 32` | `Math.random()` for **outcomes** (animation-only OK) |
| One shared helper in contract + mock + tests                     | Copy-paste biased snippets into iframe bridge code   |

---

## Other uniform ranges

For domain size `M` and outcome count `n`: `limit = floor(M/n)*n`, reject `>= limit`, then `% n`.

Examples: byte domain `M=256`, `n=6` → `limit=252`. `uint16` → d6: reject `>= 65532`.

**Hashing alone does not remove bias** — rejection (or an exactly divisible domain) is still required after you narrow to a small modulus.

---

## Lifecycle (`ICasinoGameV2`)

1. `submitAction` (or first action after open) sets `requestRandomnessNow = true` → `WAITING_RANDOMNESS`.
2. Facet requests RNG from the configured provider.
3. `onCasinoRandomnessFulfilled` → your **`onRandomness(ctx, bytes32)`** maps bytes to outcomes with this doc, then returns `StepResult`.

The facet owns entropy; the game owns **unbiased mapping**.

---

## Related docs

- [`CHAIN_WTF_CASINO_GAMES.md`](./CHAIN_WTF_CASINO_GAMES.md) — host/guest + facet flow
- [`CONTRACT_CONSTRAINTS.md`](./CONTRACT_CONSTRAINTS.md) — MUST bullet on d6 mapping
- [`SLOTS_RISK_AND_RESERVES.md`](./SLOTS_RISK_AND_RESERVES.md) — slots use weighted outcome indices (different pattern; still avoid biased small moduli)
