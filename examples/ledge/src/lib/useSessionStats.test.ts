// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { topPrizeOf, useSessionStats } from './useSessionStats';

const WAGER = 10n ** 18n;

const round = (payout: bigint) => ({
  allocation: [5, 0, 0, 0, 0],
  toppled: [payout > 0n, false, false, false, false],
  wager: WAGER,
  payout,
});

describe('useSessionStats', () => {
  it('starts empty and reports no return rate before the first round', () => {
    const { result } = renderHook(() => useSessionStats());

    expect(result.current.stats.rounds).toBe(0);
    expect(result.current.observedReturn).toBeNull();
  });

  it('accumulates wagered and returned across rounds', () => {
    const { result } = renderHook(() => useSessionStats());

    act(() => {
      result.current.record(round(0n));
      result.current.record(round(2n * WAGER));
    });

    expect(result.current.stats.rounds).toBe(2);
    expect(result.current.stats.wagered).toBe(2n * WAGER);
    expect(result.current.stats.returned).toBe(2n * WAGER);
    expect(result.current.observedReturn).toBeCloseTo(1, 10);
  });

  it('tracks the best win and its multiplier', () => {
    const { result } = renderHook(() => useSessionStats());

    act(() => {
      result.current.record(round(2n * WAGER));
      result.current.record(round(50n * WAGER));
      result.current.record(round(0n));
    });

    expect(result.current.stats.best).toBe(50n * WAGER);
    expect(result.current.stats.bestMultiplier).toBe(50);
  });

  it('counts a winning streak and breaks it on a loss', () => {
    const { result } = renderHook(() => useSessionStats());

    act(() => {
      result.current.record(round(WAGER));
      result.current.record(round(WAGER));
      result.current.record(round(WAGER));
    });
    expect(result.current.stats.streak).toBe(3);

    act(() => {
      result.current.record(round(0n));
    });
    expect(result.current.stats.streak).toBe(0);
    expect(result.current.stats.longestStreak).toBe(3);
  });

  it('caps history so a long session cannot grow without bound', () => {
    const { result } = renderHook(() => useSessionStats());

    act(() => {
      for (let i = 0; i < 40; i += 1) result.current.record(round(0n));
    });

    expect(result.current.stats.rounds).toBe(40);
    expect(result.current.stats.history).toHaveLength(24);
    // The most recent round is kept; the oldest fall off.
    expect(result.current.stats.history.at(-1)?.id).toBe(40);
  });

  it('clears everything on reset', () => {
    const { result } = renderHook(() => useSessionStats());

    act(() => {
      result.current.record(round(WAGER));
      result.current.reset();
    });

    expect(result.current.stats.rounds).toBe(0);
    expect(result.current.stats.history).toEqual([]);
  });
});

describe('topPrizeOf', () => {
  it('reports the biggest prize among used lanes only', () => {
    expect(topPrizeOf([1, 0, 0, 0, 0])).toBe(1);
    expect(topPrizeOf([1, 0, 1, 0, 0])).toBe(5);
    expect(topPrizeOf([0, 0, 0, 0, 5])).toBe(50);
    expect(topPrizeOf([0, 0, 0, 0, 0])).toBe(0);
  });
});
