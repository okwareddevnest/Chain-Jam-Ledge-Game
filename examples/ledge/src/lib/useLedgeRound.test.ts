// @vitest-environment jsdom
/**
 * Guards the money path against a double bet.
 *
 * Two DROP clicks dispatched in the same tick both observe the pre-click round phase,
 * because React has not re-rendered in between. Without a synchronous latch that charges
 * the player twice for one round — which it did, observed in the browser as a balance
 * going 1000 -> 998 for a single drop.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useLedgeRound } from './useLedgeRound';

const WAGER = 10n ** 18n;
const ALL_ON_FIRST_LANE = [5, 0, 0, 0, 0];
const STARTING_BALANCE = 1_000n * 10n ** 18n;

describe('useLedgeRound in standalone demo mode', () => {
  it('falls back to the demo when there is no parent frame to host it', () => {
    const { result } = renderHook(() => useLedgeRound(null, null));

    expect(result.current.isDemo).toBe(true);
    expect(result.current.demoBalance).toBe(STARTING_BALANCE);
    expect(result.current.canBet).toBe(true);
  });

  it('charges the wager exactly once when DROP fires repeatedly in one tick', () => {
    const { result } = renderHook(() => useLedgeRound(null, null));

    act(() => {
      result.current.drop(ALL_ON_FIRST_LANE, WAGER);
      result.current.drop(ALL_ON_FIRST_LANE, WAGER);
      result.current.drop(ALL_ON_FIRST_LANE, WAGER);
    });

    expect(result.current.demoBalance).toBe(STARTING_BALANCE - WAGER);
  });

  it('refuses a second bet while the first is still resolving', () => {
    const { result } = renderHook(() => useLedgeRound(null, null));

    act(() => {
      result.current.drop(ALL_ON_FIRST_LANE, WAGER);
    });
    expect(result.current.round.phase).toBe('opening');

    act(() => {
      result.current.drop(ALL_ON_FIRST_LANE, WAGER);
    });

    expect(result.current.demoBalance).toBe(STARTING_BALANCE - WAGER);
  });

  it('rejects an allocation that does not spend exactly five coins', () => {
    const { result } = renderHook(() => useLedgeRound(null, null));

    act(() => {
      result.current.drop([1, 1, 1, 1, 0], WAGER);
    });

    expect(result.current.demoBalance).toBe(STARTING_BALANCE);
    expect(result.current.round.phase).toBe('idle');
  });

  it('rejects a non-positive wager', () => {
    const { result } = renderHook(() => useLedgeRound(null, null));

    act(() => {
      result.current.drop(ALL_ON_FIRST_LANE, 0n);
    });

    expect(result.current.demoBalance).toBe(STARTING_BALANCE);
    expect(result.current.round.phase).toBe('idle');
  });

  it('settles the demo round and frees the latch for the next bet', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useLedgeRound(null, null));

      act(() => {
        result.current.drop(ALL_ON_FIRST_LANE, WAGER);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(result.current.round.phase).toBe('settled');
      expect(result.current.round.toppled).not.toBeNull();

      const afterFirst = result.current.demoBalance;

      act(() => {
        result.current.drop(ALL_ON_FIRST_LANE, WAGER);
      });

      expect(result.current.demoBalance).toBe(afterFirst - WAGER);
    } finally {
      vi.useRealTimers();
    }
  });
});
