import { useCallback, useEffect, useRef } from 'react';

import { roundClosed, roundRevealed } from './balance-hold';
import { isTerminalPhase, type CasinoSessionRow } from './casino';

export type RoundOutcome = 'win' | 'loss';

/**
 * Tracks in-flight rounds against the balance hold (`betPlaced` / `roundRevealed`
 * / `roundClosed`) and settles them as the indexed session rows catch up.
 *
 * `onRoundOutcome` fires once per tracked round when its final payout is known —
 * including losses that the SDK does not require games to `revealOutcome` for
 * (those auto-close here, often before the game's animation calls reveal).
 */
export function useRoundLedger(
  sessionRows: CasinoSessionRow[] | undefined,
  onRoundOutcome?: (info: { sessionId: string; outcome: RoundOutcome; payout: bigint }) => void,
): {
  trackRound: (sessionId: string, roundKey: string) => void;
  getRoundKey: (sessionId: string) => string | undefined;
  queuePendingReveal: (sessionId: string) => void;
  endRound: (sessionId: string, payout: bigint | undefined) => void;
} {
  const trackedRoundsRef = useRef(new Map<string, string>());
  const pendingRevealRef = useRef(new Set<string>());
  const onRoundOutcomeRef = useRef(onRoundOutcome);
  onRoundOutcomeRef.current = onRoundOutcome;

  const trackRound = useCallback((sessionId: string, roundKey: string) => {
    trackedRoundsRef.current.set(sessionId, roundKey);
  }, []);

  const getRoundKey = useCallback(
    (sessionId: string) => trackedRoundsRef.current.get(sessionId),
    [],
  );

  const queuePendingReveal = useCallback((sessionId: string) => {
    pendingRevealRef.current.add(sessionId);
  }, []);

  const endRound = useCallback((sessionId: string, payout: bigint | undefined) => {
    const roundKey = trackedRoundsRef.current.get(sessionId);
    if (!roundKey) return;
    trackedRoundsRef.current.delete(sessionId);
    pendingRevealRef.current.delete(sessionId);
    if (payout === undefined) roundClosed(roundKey);
    else roundRevealed(roundKey, payout);
  }, []);

  useEffect(
    function settleTrackedRoundsOnSessionUpdate() {
      for (const row of sessionRows ?? []) {
        if (!trackedRoundsRef.current.has(row.sessionId)) continue;
        if (!(row.status === 'settled' || isTerminalPhase(row.phase))) continue;
        // `payout` is written by the same event that flips the row to settled,
        // but the phase can turn terminal one update earlier — without this
        // gate a winning round would be misread as a loss (payout 0).
        if (row.payout === undefined) continue;
        const payout = BigInt(row.payout);
        const outcome: RoundOutcome = payout > 0n ? 'win' : 'loss';
        if (pendingRevealRef.current.has(row.sessionId)) {
          // The game revealed before the indexed feed caught up — credit now.
          onRoundOutcomeRef.current?.({ sessionId: row.sessionId, outcome, payout });
          endRound(row.sessionId, payout);
        } else if (payout === 0n) {
          // A loss changes nothing at settlement (the wager left on open), so
          // there is no credit to wait for and no reveal required by the SDK.
          onRoundOutcomeRef.current?.({ sessionId: row.sessionId, outcome, payout });
          endRound(row.sessionId, undefined);
        }
        // A settled win stays tracked until the game calls revealOutcome, so
        // the credit stays hidden and reconciles stay blocked meanwhile.
      }
    },
    [sessionRows, endRound],
  );

  useEffect(function closeTrackedRoundsOnUnmount() {
    return () => {
      for (const roundKey of trackedRoundsRef.current.values()) roundClosed(roundKey);
      trackedRoundsRef.current.clear();
      pendingRevealRef.current.clear();
    };
  }, []);

  return { trackRound, getRoundKey, queuePendingReveal, endRound };
}
