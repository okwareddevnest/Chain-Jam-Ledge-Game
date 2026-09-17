import { useCallback, useMemo, useState } from 'react';

import { LANE_COUNT, PRIZE_MULTIPLIER } from './ledge';

/**
 * What the player has done this sitting. Purely local and purely cosmetic — none of it
 * touches the wager, the paytable or the contract. It exists because a casino game with
 * no memory of your last twenty rounds has nothing to come back to.
 */
export type RoundRecord = {
  id: number;
  allocation: number[];
  toppled: boolean[];
  wager: bigint;
  payout: bigint;
  /** Whole multiple of the wager returned, for the history chips. */
  multiplier: number;
};

export type SessionStats = {
  rounds: number;
  wagered: bigint;
  returned: bigint;
  /** Largest single payout, in base units. */
  best: bigint;
  bestMultiplier: number;
  /** Consecutive rounds that paid anything. */
  streak: number;
  longestStreak: number;
  history: RoundRecord[];
};

/** Rounds kept for the history strip. Older rounds fall off the left. */
const HISTORY_LIMIT = 24;

const EMPTY: SessionStats = {
  rounds: 0,
  wagered: 0n,
  returned: 0n,
  best: 0n,
  bestMultiplier: 0,
  streak: 0,
  longestStreak: 0,
  history: [],
};

export type UseSessionStatsResult = {
  stats: SessionStats;
  /** Observed return across the session, or null before the first round. */
  observedReturn: number | null;
  record: (round: Omit<RoundRecord, 'id' | 'multiplier'>) => void;
  reset: () => void;
};

export function useSessionStats(): UseSessionStatsResult {
  const [stats, setStats] = useState<SessionStats>(EMPTY);

  const record = useCallback((round: Omit<RoundRecord, 'id' | 'multiplier'>) => {
    setStats(current => {
      const multiplier = round.wager > 0n ? Number(round.payout / round.wager) : 0;
      const won = round.payout > 0n;
      const streak = won ? current.streak + 1 : 0;

      const entry: RoundRecord = { ...round, id: current.rounds + 1, multiplier };

      return {
        rounds: current.rounds + 1,
        wagered: current.wagered + round.wager,
        returned: current.returned + round.payout,
        best: round.payout > current.best ? round.payout : current.best,
        bestMultiplier: multiplier > current.bestMultiplier ? multiplier : current.bestMultiplier,
        streak,
        longestStreak: streak > current.longestStreak ? streak : current.longestStreak,
        history: [...current.history, entry].slice(-HISTORY_LIMIT),
      };
    });
  }, []);

  const reset = useCallback(() => setStats(EMPTY), []);

  const observedReturn = useMemo(() => {
    if (stats.wagered === 0n) return null;
    // Ratio of two base-unit totals; Number is safe here because it is a ratio, not a balance.
    return Number(stats.returned) / Number(stats.wagered);
  }, [stats.returned, stats.wagered]);

  return { stats, observedReturn, record, reset };
}

/** Highest prize among the lanes the player actually used — drives the risk read-out. */
export const topPrizeOf = (allocation: readonly number[]): number => {
  let top = 0;
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    if (allocation[lane] > 0) top = Math.max(top, Number(PRIZE_MULTIPLIER[lane]));
  }
  return top;
};
