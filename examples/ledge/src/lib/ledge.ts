/**
 * LEDGE game math — the single source of truth on the client.
 *
 * Every function here mirrors `simulator/contracts/LedgeGame.sol` exactly. The contract
 * settles the bet; this module only re-derives what the contract already decided so the
 * UI can animate it. Where the two could drift (thresholds, payout, reserve) the numbers
 * are integers on both sides, so they agree to the base unit.
 *
 * See DESIGN.md for the derivation.
 */
import { decodeAbiParameters, encodeAbiParameters, keccak256 } from 'viem';

export type HexString = `0x${string}`;

/** Coins the player distributes each round. */
export const N_COINS = 5;
export const LANE_COUNT = 5;

/** Prize of lane i, as a whole multiple of the full wager. */
export const PRIZE_MULTIPLIER: readonly bigint[] = [1n, 2n, 5n, 15n, 50n];

/** Topple threshold per coin, over PROB_DENOM. PRIZE_MULTIPLIER[i] * TOPPLE_BASE[i] is constant. */
export const TOPPLE_BASE: readonly bigint[] = [72000n, 36000n, 14400n, 4800n, 1440n];

export const PROB_DENOM = 375000n;

/** 24/25 = 0.96 = the declared theoretical RTP. */
export const RTP_NUMERATOR = 24n;
export const RTP_DENOMINATOR = 25n;

const DRAW_BYTES = 3n;
const DRAW_DOMAIN = 1n << 24n;

/**
 * Largest multiple of PROB_DENOM that fits in 3 bytes. Draws at or above this are rejected
 * rather than folded in, which would bias the low end of the range.
 */
export const DRAW_LIMIT = (DRAW_DOMAIN / PROB_DENOM) * PROB_DENOM;

export const WAD = 10n ** 18n;

const SEED_BYTES = 32n;

export type Allocation = number[];

export type LedgeOutcome = {
  toppled: boolean[];
  payoutMultiplier: bigint;
};

export type LedgeGameState = {
  allocation: Allocation;
  toppled: boolean[];
  payout: bigint;
};

export const isValidAllocation = (allocation: readonly number[]): boolean => {
  if (!Array.isArray(allocation) || allocation.length !== LANE_COUNT) return false;

  let total = 0;
  for (const coins of allocation) {
    if (!Number.isInteger(coins) || coins < 0 || coins > N_COINS) return false;
    total += coins;
  }

  return total === N_COINS;
};

const assertValidAllocation = (allocation: readonly number[]): void => {
  if (!isValidAllocation(allocation)) {
    throw new Error(`Allocation must place exactly 5 coins across ${LANE_COUNT} lanes.`);
  }
};

/** Every composition of N_COINS into LANE_COUNT non-negative parts. 126 of them. */
export const allAllocations = (): Allocation[] => {
  const results: Allocation[] = [];

  const walk = (lane: number, remaining: number, acc: number[]): void => {
    if (lane === LANE_COUNT - 1) {
      results.push([...acc, remaining]);
      return;
    }
    for (let coins = 0; coins <= remaining; coins += 1) {
      walk(lane + 1, remaining - coins, [...acc, coins]);
    }
  };

  walk(0, N_COINS, []);
  return results;
};

export const toppleThreshold = (lane: number, coins: number): bigint =>
  TOPPLE_BASE[lane] * BigInt(coins);

export const toppleProbability = (lane: number, coins: number): number =>
  Number(toppleThreshold(lane, coins)) / Number(PROB_DENOM);

/** Sum of the prizes of every lane the player actually used. */
const usedMultiplierSum = (allocation: readonly number[]): bigint =>
  allocation.reduce(
    (acc, coins, lane) => (coins > 0 ? acc + PRIZE_MULTIPLIER[lane] : acc),
    0n,
  );

export const maxMultiplierX = (allocation: readonly number[]): number =>
  Number(usedMultiplierSum(allocation));

export const maxPayout = (wager: bigint, allocation: readonly number[]): bigint =>
  wager * usedMultiplierSum(allocation);

export const maxReservedProfit = (wager: bigint, allocation: readonly number[]): bigint => {
  const ceiling = maxPayout(wager, allocation);
  return ceiling > wager ? ceiling - wager : 0n;
};

export const expectedPayout = (wager: bigint): bigint =>
  (wager * RTP_NUMERATOR) / RTP_DENOMINATOR;

/**
 * Probability of the single highest-paying outcome — every used lane toppling at once.
 * The facet wants the top tier marginal, not any-win (SLOTS_RISK_AND_RESERVES.md:172).
 */
export const topOutcomeProbabilityWad = (allocation: readonly number[]): bigint => {
  let numerator = WAD;

  allocation.forEach((coins, lane) => {
    if (coins === 0) return;
    numerator = (numerator * toppleThreshold(lane, coins)) / PROB_DENOM;
  });

  return numerator > WAD ? WAD : numerator;
};

export const encodeGameData = (allocation: readonly number[]): HexString => {
  assertValidAllocation(allocation);
  return encodeAbiParameters([{ type: 'uint8[5]' }], [allocation as never]);
};

export const decodeGameData = (gameData: HexString): Allocation => {
  const [lanes] = decodeAbiParameters([{ type: 'uint8[5]' }], gameData) as unknown as [
    readonly number[],
  ];
  return lanes.map(Number);
};

export const decodeGameState = (gameState: HexString | undefined): LedgeGameState | null => {
  if (!gameState || gameState === '0x') return null;

  try {
    const [lanes, toppled, payout] = decodeAbiParameters(
      [{ type: 'uint8[5]' }, { type: 'bool[5]' }, { type: 'uint256' }],
      gameState,
    ) as unknown as [readonly number[], readonly boolean[], bigint];

    return {
      allocation: lanes.map(Number),
      toppled: toppled.map(Boolean),
      payout,
    };
  } catch {
    // A session can carry state from a phase this game never writes (cancelled before
    // settle); the UI falls back to the payout field rather than breaking the round.
    return null;
  }
};

/**
 * Rejection sampler over the VRF seed, byte-identical to `_nextDraw` in LedgeGame.sol:
 * read 3 bytes, reject at or above DRAW_LIMIT, re-hash the seed when it runs out.
 */
const createDrawStream = (randomness: HexString) => {
  let seed = randomness;
  let index = 0n;

  const bytesOf = (hex: HexString): Uint8Array => {
    const body = hex.slice(2).padEnd(64, '0');
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) {
      out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  };

  let bytes = bytesOf(seed);

  return (): bigint => {
    for (;;) {
      if (index + DRAW_BYTES <= SEED_BYTES) {
        const at = Number(index);
        const value =
          (BigInt(bytes[at]) << 16n) | (BigInt(bytes[at + 1]) << 8n) | BigInt(bytes[at + 2]);
        index += DRAW_BYTES;
        if (value < DRAW_LIMIT) return value % PROB_DENOM;
        continue;
      }
      seed = keccak256(seed);
      bytes = bytesOf(seed);
      index = 0n;
    }
  };
};

/** Exposed so tests can check the sampler itself, not just the game that uses it. */
export const drawUniforms = (randomness: HexString, count: number): bigint[] => {
  const next = createDrawStream(randomness);
  return Array.from({ length: count }, () => next());
};

export const resolve = (allocation: readonly number[], randomness: HexString): LedgeOutcome => {
  assertValidAllocation(allocation);

  const next = createDrawStream(randomness);
  const toppled: boolean[] = new Array(LANE_COUNT).fill(false);
  let payoutMultiplier = 0n;

  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const coins = allocation[lane];
    if (coins === 0) continue;

    if (next() < toppleThreshold(lane, coins)) {
      toppled[lane] = true;
      payoutMultiplier += PRIZE_MULTIPLIER[lane];
    }
  }

  return { toppled, payoutMultiplier };
};
