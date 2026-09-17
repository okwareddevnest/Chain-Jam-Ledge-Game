import { describe, expect, it } from 'vite-plus/test';

import {
  decodeGameData,
  decodeGameState,
  encodeGameData,
  maxPayout,
  outcomeFromRandomness,
  outcomeFromResult,
  payoutMultiplier,
  winProbability,
  winningWays,
} from './coinflip';

describe('gameData codec', () => {
  it('round-trips and produces the 96-byte layout CoinflipGame expects', () => {
    const bet = { pickHeads: true, coinCount: 3, minWins: 2 };
    const encoded = encodeGameData(bet);
    expect(encoded).toHaveLength(2 + 96 * 2);
    expect(decodeGameData(encoded)).toEqual(bet);
  });
});

describe('gameState decoding', () => {
  it('counts picked-side wins from the low randomness bits like _countHeads', () => {
    // abi.encode(CoinflipState{pickHeads: true, coinCount: 3, minWins: 2, randomness})
    // randomness low bits 0b011 → coins 0,1 heads, coin 2 tails.
    const randomness = `0x${'00'.repeat(31)}03` as const;
    const gameState = encodeState(true, 3, 2, randomness);

    const outcome = decodeGameState(gameState);
    expect(outcome).not.toBeNull();
    expect(outcome?.coins).toEqual(['heads', 'heads', 'tails']);
    expect(outcome?.pickedSideWins).toBe(2);
    expect(outcome?.won).toBe(true);
  });

  it('scores tails as coinCount - headsCount', () => {
    const randomness = `0x${'00'.repeat(31)}03` as const;
    const outcome = decodeGameState(encodeState(false, 3, 2, randomness));
    expect(outcome?.pickedSideWins).toBe(1);
    expect(outcome?.won).toBe(false);
  });

  it('returns null while randomness is still zero (unsettled)', () => {
    const outcome = decodeGameState(encodeState(true, 3, 2, `0x${'00'.repeat(32)}`));
    expect(outcome).toBeNull();
  });
});

describe('settle fallbacks', () => {
  it('derives faces from a raw VRF word when gameState is missing', () => {
    const outcome = outcomeFromRandomness({ pickHeads: false, coinCount: 4, minWins: 3 }, 0b0101n);
    expect(outcome.coins).toEqual(['heads', 'tails', 'heads', 'tails']);
    expect(outcome.pickedSideWins).toBe(2);
    expect(outcome.won).toBe(false);
  });

  it('derives faces from the payout alone as a last resort', () => {
    const win = outcomeFromResult({ pickHeads: true, coinCount: 3, minWins: 2 }, true);
    expect(win.coins).toEqual(['heads', 'heads', 'tails']);
    expect(win.won).toBe(true);

    const loss = outcomeFromResult({ pickHeads: false, coinCount: 3, minWins: 2 }, false);
    expect(loss.coins).toEqual(['tails', 'heads', 'heads']);
    expect(loss.pickedSideWins).toBe(1);
    expect(loss.won).toBe(false);
  });
});

describe('payout math (mirrors CoinflipGame)', () => {
  it('computes winning ways as the binomial tail sum', () => {
    expect(winningWays(1, 1)).toBe(1);
    expect(winningWays(3, 2)).toBe(4); // C(3,2) + C(3,3)
    expect(winningWays(10, 10)).toBe(1);
  });

  it('matches _getMaxPayout floor division', () => {
    const wager = 10n ** 18n;
    // 1 coin, 1 win: 0.98 * 2 / 1 = 1.96x
    expect(maxPayout(wager, 1, 1)).toBe((wager * 9_800n * 2n) / 10_000n);
    // 10 coins, all heads: 0.98 * 1024 / 1 = 1003.52x
    expect(maxPayout(wager, 10, 10)).toBe((wager * 9_800n * 1_024n) / 10_000n);
  });

  it('keeps house edge at 2% of fair odds', () => {
    expect(payoutMultiplier(1, 1)).toBeCloseTo(1.96);
    expect(winProbability(1, 1)).toBe(0.5);
    expect(payoutMultiplier(10, 10) * winProbability(10, 10)).toBeCloseTo(0.98);
  });
});

function encodeState(
  pickHeads: boolean,
  coinCount: number,
  minWins: number,
  randomness: `0x${string}`,
): `0x${string}` {
  const word = (value: number) => value.toString(16).padStart(64, '0');
  return `0x${word(pickHeads ? 1 : 0)}${word(coinCount)}${word(minWins)}${randomness.slice(2)}`;
}
