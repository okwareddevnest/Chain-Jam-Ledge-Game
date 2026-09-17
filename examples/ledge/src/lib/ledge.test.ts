import { describe, expect, it } from 'vitest';
import { keccak256 } from 'viem';

import {
  DRAW_LIMIT,
  LANE_COUNT,
  N_COINS,
  PRIZE_MULTIPLIER,
  PROB_DENOM,
  RTP_DENOMINATOR,
  RTP_NUMERATOR,
  TOPPLE_BASE,
  allAllocations,
  decodeGameData,
  decodeGameState,
  encodeGameData,
  expectedPayout,
  isValidAllocation,
  maxMultiplierX,
  maxPayout,
  drawUniforms,
  maxReservedProfit,
  resolve,
  toppleProbability,
  toppleThreshold,
  topOutcomeProbabilityWad,
} from './ledge';

const SPREAD = [1, 1, 1, 1, 1];
const ALL_IN_JACKPOT = [0, 0, 0, 0, 5];
const WAGER = 1_000_000n;

describe('paytable invariants', () => {
  it('holds M[i] * BASE[i] constant across every lane, which is what makes RTP strategy-independent', () => {
    const products = PRIZE_MULTIPLIER.map((m, i) => m * TOPPLE_BASE[i]);

    expect(products).toEqual([72000n, 72000n, 72000n, 72000n, 72000n]);
  });

  it('declares a theoretical RTP of exactly 96%, inside the jam 93-98% band', () => {
    expect(RTP_NUMERATOR * 100n).toBe(96n * RTP_DENOMINATOR);
    expect(72000n * BigInt(N_COINS)).toBe((PROB_DENOM * RTP_NUMERATOR) / RTP_DENOMINATOR);
  });

  it('returns the same expected value for all 126 allocations, so no strategy beats the declared RTP', () => {
    const allocations = allAllocations();
    expect(allocations).toHaveLength(126);

    for (const allocation of allocations) {
      const evScaled = allocation.reduce(
        (acc, coins, lane) => acc + PRIZE_MULTIPLIER[lane] * TOPPLE_BASE[lane] * BigInt(coins),
        0n,
      );

      expect(evScaled).toBe(360000n);
      expect(expectedPayout(WAGER)).toBe(960_000n);
    }
  });

  it('never exceeds the heavy-tail multiplier threshold of 100x on any allocation', () => {
    const worstCase = allAllocations().reduce(
      (acc, allocation) => (maxMultiplierX(allocation) > acc ? maxMultiplierX(allocation) : acc),
      0,
    );

    expect(worstCase).toBe(73);
    expect(worstCase).toBeLessThan(100);
  });

  it('matches the published odds table', () => {
    expect(toppleProbability(0, 1)).toBeCloseTo(0.192, 10);
    expect(toppleProbability(1, 1)).toBeCloseTo(0.096, 10);
    expect(toppleProbability(2, 1)).toBeCloseTo(0.0384, 10);
    expect(toppleProbability(3, 1)).toBeCloseTo(0.0128, 10);
    expect(toppleProbability(4, 1)).toBeCloseTo(0.00384, 10);
    expect(toppleProbability(0, 5)).toBeCloseTo(0.96, 10);
    expect(toppleProbability(4, 5)).toBeCloseTo(0.0192, 10);
  });

  it('keeps every topple threshold within the probability denominator', () => {
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      expect(toppleThreshold(lane, N_COINS)).toBeLessThanOrEqual(PROB_DENOM);
    }
  });
});

describe('allocation validation', () => {
  it('accepts any distribution of exactly five coins', () => {
    expect(isValidAllocation(SPREAD)).toBe(true);
    expect(isValidAllocation(ALL_IN_JACKPOT)).toBe(true);
    expect(isValidAllocation([2, 0, 3, 0, 0])).toBe(true);
  });

  it('rejects allocations that do not spend exactly five coins', () => {
    expect(isValidAllocation([1, 1, 1, 1, 0])).toBe(false);
    expect(isValidAllocation([2, 1, 1, 1, 1])).toBe(false);
    expect(isValidAllocation([0, 0, 0, 0, 0])).toBe(false);
  });

  it('rejects malformed allocations', () => {
    expect(isValidAllocation([1, 1, 1, 2])).toBe(false);
    expect(isValidAllocation([1, 1, 1, 1, 1, 0])).toBe(false);
    expect(isValidAllocation([-1, 2, 2, 1, 1])).toBe(false);
    expect(isValidAllocation([1.5, 1.5, 1, 1, 0])).toBe(false);
  });
});

describe('wire format', () => {
  it('round-trips an allocation through abi encoding', () => {
    const encoded = encodeGameData([2, 0, 1, 0, 2]);

    expect(decodeGameData(encoded)).toEqual([2, 0, 1, 0, 2]);
  });

  it('refuses to encode an invalid allocation rather than sending a reverting bet', () => {
    expect(() => encodeGameData([5, 5, 5, 5, 5])).toThrow(/exactly 5 coins/i);
  });

  it('decodes settled game state into lanes, topples and payout', () => {
    const state = decodeGameState(
      ('0x' +
        '0000000000000000000000000000000000000000000000000000000000000001' +
        '0000000000000000000000000000000000000000000000000000000000000000' +
        '0000000000000000000000000000000000000000000000000000000000000000' +
        '0000000000000000000000000000000000000000000000000000000000000000' +
        '0000000000000000000000000000000000000000000000000000000000000004' +
        '0000000000000000000000000000000000000000000000000000000000000001' +
        '0000000000000000000000000000000000000000000000000000000000000000' +
        '0000000000000000000000000000000000000000000000000000000000000000' +
        '0000000000000000000000000000000000000000000000000000000000000000' +
        '0000000000000000000000000000000000000000000000000000000000000001' +
        '00000000000000000000000000000000000000000000000000000000000f4240') as `0x${string}`,
    );

    expect(state).toEqual({
      allocation: [1, 0, 0, 0, 4],
      toppled: [true, false, false, false, true],
      payout: 1_000_000n,
    });
  });

  it('returns null for absent or unparseable game state instead of throwing at the UI', () => {
    expect(decodeGameState(undefined)).toBeNull();
    expect(decodeGameState('0x')).toBeNull();
    expect(decodeGameState('0xdeadbeef')).toBeNull();
  });
});

describe('risk quoting', () => {
  it('reserves exactly the profit needed for every used lane toppling at once', () => {
    expect(maxPayout(WAGER, ALL_IN_JACKPOT)).toBe(50n * WAGER);
    expect(maxReservedProfit(WAGER, ALL_IN_JACKPOT)).toBe(49n * WAGER);

    expect(maxPayout(WAGER, SPREAD)).toBe(73n * WAGER);
    expect(maxReservedProfit(WAGER, SPREAD)).toBe(72n * WAGER);
  });

  it('ignores unused lanes when sizing the reserve', () => {
    expect(maxPayout(WAGER, [5, 0, 0, 0, 0])).toBe(1n * WAGER);
    expect(maxReservedProfit(WAGER, [5, 0, 0, 0, 0])).toBe(0n);
  });

  it('quotes the top single outcome probability, not any-win probability', () => {
    const jackpotWad = topOutcomeProbabilityWad(ALL_IN_JACKPOT);

    expect(jackpotWad).toBe((1440n * 5n * 10n ** 18n) / PROB_DENOM);
    expect(Number(jackpotWad) / 1e18).toBeCloseTo(0.0192, 10);
  });

  it('multiplies lane probabilities for a spread, making the top outcome vanishingly rare', () => {
    const spreadWad = topOutcomeProbabilityWad(SPREAD);

    // Integer WAD math truncates on each lane, so the quote lands just under the real
    // product. Under-quoting is the safe direction: it never overstates tail risk.
    expect(spreadWad).toBe(34_789_235_097n);
    expect(Number(spreadWad) / 1e18).toBeLessThanOrEqual(
      0.192 * 0.096 * 0.0384 * 0.0128 * 0.00384,
    );
    expect(Number(spreadWad) / 1e18).toBeCloseTo(3.4789e-8, 12);
  });

  it('caps probability at one WAD so the facet never sees an invalid risk probability', () => {
    for (const allocation of allAllocations()) {
      expect(topOutcomeProbabilityWad(allocation)).toBeLessThanOrEqual(10n ** 18n);
    }
  });
});

describe('resolution', () => {
  it('topples a lane when its draw falls under the threshold', () => {
    const randomness = `0x${'000000'.repeat(10)}${'0000'}` as const;

    const outcome = resolve(ALL_IN_JACKPOT, randomness);

    expect(outcome.toppled).toEqual([false, false, false, false, true]);
    expect(outcome.payoutMultiplier).toBe(50n);
  });

  it('draws one value per used lane in ascending lane order', () => {
    // 0x030d40 = 200000, above every lane threshold at one coin; 0x000000 is below all of them.
    const randomness = ('0x' +
      '030d40' +
      '000000' +
      '030d40' +
      '000000' +
      '030d40' +
      '00'.repeat(17)) as `0x${string}`;

    const outcome = resolve(SPREAD, randomness);

    expect(outcome.toppled).toEqual([false, true, false, true, false]);
    expect(outcome.payoutMultiplier).toBe(2n + 15n);
  });

  it('never pays more than the quoted max payout', () => {
    for (const allocation of allAllocations()) {
      const seed = keccak256(new Uint8Array(allocation));
      const outcome = resolve(allocation, seed);

      expect(outcome.payoutMultiplier * WAGER).toBeLessThanOrEqual(maxPayout(WAGER, allocation));
    }
  });

  it('rejects draws at or above the sampling limit instead of folding them in with a biased modulo', () => {
    const justOverLimit = (DRAW_LIMIT).toString(16).padStart(6, '0');
    const randomness = (`0x${justOverLimit}` +
      '000000' +
      '00'.repeat(26)) as `0x${string}`;

    const outcome = resolve([5, 0, 0, 0, 0], randomness);

    expect(outcome.toppled[0]).toBe(true);
  });

  it('refuses to resolve an invalid allocation', () => {
    expect(() => resolve([1, 1, 1, 1, 0], `0x${'00'.repeat(32)}`)).toThrow(/exactly 5 coins/i);
  });

  it('produces draws with a flat mean, confirming the sampler is not biased low', () => {
    const samples = drawUniforms(keccak256(new Uint8Array([3])), 120_000);
    const mean = samples.reduce((acc, value) => acc + value, 0n) / BigInt(samples.length);
    const midpoint = PROB_DENOM / 2n;

    expect(samples.every((value) => value >= 0n && value < PROB_DENOM)).toBe(true);
    expect(Number(mean)).toBeGreaterThan(Number(midpoint) * 0.99);
    expect(Number(mean)).toBeLessThan(Number(midpoint) * 1.01);
  });

  it('pays out near the declared RTP over a long deterministic simulation', () => {
    const rounds = 120_000;
    let paid = 0n;
    let seed = keccak256(new Uint8Array([7]));

    for (let round = 0; round < rounds; round += 1) {
      paid += resolve(SPREAD, seed).payoutMultiplier;
      seed = keccak256(seed);
    }

    // Wide band on purpose: the exact RTP is proven analytically above, this only catches a
    // grossly broken sampler. The 50x lane makes the sample mean converge slowly.
    const observedRtp = Number(paid) / rounds;

    expect(observedRtp).toBeGreaterThan(0.85);
    expect(observedRtp).toBeLessThan(1.07);
  });
});
