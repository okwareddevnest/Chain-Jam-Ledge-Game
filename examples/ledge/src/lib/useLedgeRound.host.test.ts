// @vitest-environment jsdom
/**
 * Host-mode behaviour. `isEmbedded` is mocked because jsdom has no parent frame, so the
 * hook would otherwise correctly fall back to the standalone demo.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./environment', () => ({ isEmbedded: () => true }));

const { useLedgeRound } = await import('./useLedgeRound');

const WAGER = 10n ** 18n;
const ALL_ON_FIRST_LANE = [5, 0, 0, 0, 0];

const readySnapshot = {
  wallet: { status: 'ready' },
  token: { decimals: 18, symbol: 'chUSD' },
  balances: { smartVaultBalance: (1_000n * 10n ** 18n).toString() },
  sessions: { items: [] },
  ui: { theme: 'light', locale: 'en' },
} as never;

describe('useLedgeRound against a host', () => {
  it('tells the player when a bet never confirms instead of leaving a dead button', async () => {
    vi.useFakeTimers();
    try {
      const hostApi = { openSession: () => new Promise(() => {}) } as never;
      const { result } = renderHook(() => useLedgeRound(hostApi, readySnapshot));

      act(() => {
        result.current.drop(ALL_ON_FIRST_LANE, WAGER);
      });
      expect(result.current.round.phase).toBe('opening');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(46_000);
      });

      expect(result.current.round.phase).toBe('error');
      expect(result.current.round.message).toMatch(/longer than expected/i);
      // The player must be able to act again once told.
      expect(result.current.canBet).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces a rejected bet rather than swallowing it', async () => {
    const hostApi = { openSession: () => Promise.reject(new Error('insufficient allowance')) } as never;
    const { result } = renderHook(() => useLedgeRound(hostApi, readySnapshot));

    await act(async () => {
      result.current.drop(ALL_ON_FIRST_LANE, WAGER);
      await Promise.resolve();
    });

    expect(result.current.round.phase).toBe('error');
    expect(result.current.round.message).toBe('insufficient allowance');
  });

  it('moves to waiting once the host accepts the bet', async () => {
    const hostApi = {
      openSession: () => Promise.resolve({ sessionKey: '31337:1', transactionHash: '0x00' }),
    } as never;
    const { result } = renderHook(() => useLedgeRound(hostApi, readySnapshot));

    await act(async () => {
      result.current.drop(ALL_ON_FIRST_LANE, WAGER);
      await Promise.resolve();
    });

    expect(result.current.round.phase).toBe('waiting');
    expect(result.current.isDemo).toBe(false);
  });

  it('reports the recovery path as unavailable rather than doing nothing', async () => {
    const hostApi = {
      openSession: () => Promise.resolve({ sessionKey: '31337:1', transactionHash: '0x00' }),
    } as never;
    const { result } = renderHook(() => useLedgeRound(hostApi, readySnapshot));

    await act(async () => {
      result.current.drop(ALL_ON_FIRST_LANE, WAGER);
      await Promise.resolve();
    });

    // No session id observed yet, so cancelStuckRandomness cannot be called.
    act(() => {
      result.current.recoverStuckBet();
    });

    expect(result.current.round.message).toMatch(/not been confirmed on chain yet/i);
  });
});
