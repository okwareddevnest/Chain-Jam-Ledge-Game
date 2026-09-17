import { useCallback, useEffect, useRef, useState } from 'react';
import type { HostApiV1, HostSnapshotV1 } from '@chain/casino-sdk/guest';
import { toHex } from 'viem';

import {
  LANE_COUNT,
  PRIZE_MULTIPLIER,
  decodeGameState,
  encodeGameData,
  isValidAllocation,
  resolve,
  type HexString,
} from './ledge';

/**
 * One round of LEDGE, from bet to revealed payout.
 *
 * Two sources of truth, one state machine. Inside the host iframe the chain settles the
 * bet and we replay what it decided. Standalone — which the jam requires the game to
 * support — the same `resolve()` runs locally against browser CSPRNG randomness, so the
 * demo and the real game share one implementation and one RTP.
 */
export type RoundPhase = 'idle' | 'opening' | 'waiting' | 'revealing' | 'settled' | 'error';

export type ActiveRound = {
  phase: RoundPhase;
  allocation: number[];
  wager: bigint;
  sessionId: string | null;
  toppled: boolean[] | null;
  payout: bigint | null;
  /** How many lanes of the left-to-right cascade have landed so far. */
  revealedLanes: number;
  message: string | null;
};

/** A lane finishes resolving every this many ms during the reveal cascade. */
const LANE_REVEAL_MS = 520;
/** Beat held after the final lane before the payout is announced. */
const SETTLE_HOLD_MS = 420;
/** How long a session may sit in WAITING_RANDOMNESS before we offer the recovery path. */
const STUCK_RANDOMNESS_MS = 30_000;
/** Grace period for the host handshake before falling back to the standalone demo. */
const HANDSHAKE_GRACE_MS = 1_200;

const DEMO_STARTING_BALANCE = 1_000n * 10n ** 18n;
const DEMO_DECIMALS = 18;

const idleRound = (): ActiveRound => ({
  phase: 'idle',
  allocation: [0, 0, 0, 0, 0],
  wager: 0n,
  sessionId: null,
  toppled: null,
  payout: null,
  revealedLanes: 0,
  message: null,
});

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const randomSeed = (): HexString => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes) as HexString;
};

const usedLanes = (allocation: readonly number[]): number[] =>
  allocation.reduce<number[]>((acc, coins, lane) => (coins > 0 ? [...acc, lane] : acc), []);

export type UseLedgeRoundResult = {
  round: ActiveRound;
  /** True once we've concluded no host will answer — the standalone demo. */
  isDemo: boolean;
  demoBalance: bigint;
  decimals: number;
  canBet: boolean;
  stuck: boolean;
  drop: (allocation: number[], wager: bigint) => void;
  dismiss: () => void;
  recoverStuckBet: () => void;
};

export function useLedgeRound(
  hostApi: HostApiV1 | null,
  snapshot: HostSnapshotV1 | null,
): UseLedgeRoundResult {
  const [round, setRound] = useState<ActiveRound>(idleRound);
  const [isDemo, setIsDemo] = useState(false);
  const [demoBalance, setDemoBalance] = useState(DEMO_STARTING_BALANCE);
  const [stuck, setStuck] = useState(false);

  const sessionKeyRef = useRef<string | null>(null);
  const hostApiRef = useRef<HostApiV1 | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  hostApiRef.current = hostApi;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // No host answered the handshake: this is the standalone demo build.
  useEffect(() => {
    if (hostApi) {
      setIsDemo(false);
      return;
    }
    const timer = setTimeout(() => setIsDemo(true), HANDSHAKE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [hostApi]);

  /** Walks the cascade left to right, then announces the payout. */
  const playCascade = useCallback(
    (allocation: number[], toppled: boolean[], payout: bigint, sessionId: string | null) => {
      const lanes = usedLanes(allocation);

      if (prefersReducedMotion()) {
        setRound(current => ({
          ...current,
          phase: 'settled',
          toppled,
          payout,
          revealedLanes: LANE_COUNT,
        }));
        if (sessionId) void hostApiRef.current?.revealOutcome({ sessionId }).catch(() => {});
        return;
      }

      setRound(current => ({ ...current, phase: 'revealing', toppled, payout, revealedLanes: 0 }));

      lanes.forEach((lane, order) => {
        timersRef.current.push(
          setTimeout(
            () => setRound(current => ({ ...current, revealedLanes: lane + 1 })),
            LANE_REVEAL_MS * (order + 1),
          ),
        );
      });

      timersRef.current.push(
        setTimeout(
          () => {
            setRound(current => ({ ...current, phase: 'settled', revealedLanes: LANE_COUNT }));
            // Until this lands the host hides the payout from its balance display, so the
            // top bar cannot spoil the result before the animation gets there.
            if (sessionId) void hostApiRef.current?.revealOutcome({ sessionId }).catch(() => {});
          },
          LANE_REVEAL_MS * lanes.length + SETTLE_HOLD_MS,
        ),
      );
    },
    [],
  );

  const drop = useCallback(
    (allocation: number[], wager: bigint) => {
      if (!isValidAllocation(allocation)) return;
      if (wager <= 0n) return;

      clearTimers();
      setStuck(false);
      setRound({
        ...idleRound(),
        phase: 'opening',
        allocation,
        wager,
      });

      if (isDemo || !hostApiRef.current) {
        const outcome = resolve(allocation, randomSeed());
        const payout = outcome.payoutMultiplier * wager;

        setDemoBalance(balance => balance - wager);
        timersRef.current.push(
          setTimeout(() => {
            setDemoBalance(balance => balance + payout);
            playCascade(allocation, outcome.toppled, payout, null);
          }, 420),
        );
        return;
      }

      void hostApiRef.current
        .openSession({ wager: wager.toString(), gameData: encodeGameData(allocation) })
        .then(({ sessionKey }) => {
          sessionKeyRef.current = sessionKey;
          setRound(current => ({ ...current, phase: 'waiting' }));
        })
        .catch((error: unknown) => {
          sessionKeyRef.current = null;
          setRound(current => ({
            ...current,
            phase: 'error',
            message: error instanceof Error ? error.message : 'The bet was not accepted.',
          }));
        });
    },
    [clearTimers, isDemo, playCascade],
  );

  // Watch the session feed for our row reaching a terminal phase.
  useEffect(() => {
    if (round.phase !== 'waiting') return;
    if (!snapshot || !sessionKeyRef.current) return;

    const row = snapshot.sessions.items.find(item => item.sessionKey === sessionKeyRef.current);
    if (!row) return;

    if (row.sessionId && round.sessionId !== row.sessionId) {
      setRound(current => ({ ...current, sessionId: row.sessionId }));
    }

    const terminal =
      row.isSettled ||
      row.phaseName === 'SETTLED' ||
      row.phaseName === 'FORFEITED' ||
      row.phaseName === 'CANCELLED';
    if (!terminal) return;

    sessionKeyRef.current = null;

    if (row.phaseName === 'FORFEITED' || row.phaseName === 'CANCELLED') {
      setRound(current => ({
        ...current,
        phase: 'error',
        message:
          row.phaseName === 'CANCELLED'
            ? 'Randomness never arrived — your stake was returned.'
            : 'The round expired and was forfeited.',
      }));
      return;
    }

    const state = decodeGameState(row.raw.gameState);
    const payout = state?.payout ?? BigInt(row.payout ?? '0');
    const toppled =
      state?.toppled ??
      // Fallback: the contract always writes gameState, but if an indexer drops it we can
      // still show a truthful result from the payout alone rather than inventing lanes.
      round.allocation.map(() => false);

    playCascade(state?.allocation ?? round.allocation, toppled, payout, row.sessionId ?? null);
  }, [snapshot, round.phase, round.allocation, round.sessionId, playCascade]);

  // Offer the recovery path if randomness stalls.
  useEffect(() => {
    if (round.phase !== 'waiting') {
      setStuck(false);
      return;
    }
    const timer = setTimeout(() => setStuck(true), STUCK_RANDOMNESS_MS);
    return () => clearTimeout(timer);
  }, [round.phase]);

  const recoverStuckBet = useCallback(() => {
    const sessionId = round.sessionId;
    if (!sessionId || !hostApiRef.current?.cancelStuckRandomness) return;

    void hostApiRef.current
      .cancelStuckRandomness({ sessionId })
      .catch((error: unknown) =>
        setRound(current => ({
          ...current,
          phase: 'error',
          message: error instanceof Error ? error.message : 'Could not recover the bet.',
        })),
      );
  }, [round.sessionId]);

  const dismiss = useCallback(() => {
    clearTimers();
    sessionKeyRef.current = null;
    setRound(idleRound());
  }, [clearTimers]);

  const walletReady = snapshot?.wallet.status === 'ready';
  const canBet =
    (isDemo || walletReady) && (round.phase === 'idle' || round.phase === 'settled' || round.phase === 'error');

  return {
    round,
    isDemo,
    demoBalance,
    decimals: snapshot?.token.decimals ?? DEMO_DECIMALS,
    canBet,
    stuck,
    drop,
    dismiss,
    recoverStuckBet,
  };
}

/** Prize multiplier of every lane, for the board to render its own paytable. */
export const LANE_PRIZES = PRIZE_MULTIPLIER.map(Number);
