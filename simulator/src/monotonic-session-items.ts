import type { CasinoSessionItem } from './optimistic-casino-session';
import { isTerminalPhase, type CasinoSessionRow } from './casino';

/**
 * A round may only be published as settled once its result is complete. A
 * terminal FORFEITED/CANCELLED row can legitimately lack a gameState (refund
 * paths), so the gameState requirement applies to SETTLED alone.
 */
function isCompleteSettledItem(item: CasinoSessionItem): boolean {
  if (!item.isSettled || item.payout === undefined) return false;
  return item.phaseName !== 'SETTLED' || item.raw.gameState !== undefined;
}

function demoteToWaitingRandomness(item: CasinoSessionItem): CasinoSessionItem {
  return {
    ...item,
    phase: 1,
    phaseName: 'WAITING_RANDOMNESS',
    isSettled: false,
    payout: undefined,
    settledAt: undefined,
    raw: { ...item.raw, gameState: undefined },
  };
}

/** On-chain rounds have numeric ids; optimistic `pending:` rows do not. */
function sessionIdAsNumber(item: CasinoSessionItem): bigint | undefined {
  return /^\d+$/.test(item.sessionId) ? BigInt(item.sessionId) : undefined;
}

/**
 * Makes the pushed session list monotonic per session: once a round has been
 * published — as in-flight with an on-chain id, or as settled with its payout
 * and gameState — no later snapshot may regress it to an earlier phase, clear
 * its result, or drop it, even when the optimistic and indexed layers race or a
 * read-model refresh briefly regresses the projected list. A round that is
 * terminal but still missing its payout keeps presenting as WAITING_RANDOMNESS
 * until the result lands, so the settled flip always carries the data with it.
 * Memo entries are released (and the indexed feed becomes authoritative) once
 * the indexed row itself carries the settled result. Optimistic `pending:` rows
 * are exempt: a failed bet removes them for good.
 */
export function reconcileMonotonicSessionItems(
  items: CasinoSessionItem[],
  projectedRows: CasinoSessionRow[],
  publishedSettledItems: Map<string, CasinoSessionItem>,
  publishedOpenItems: Map<string, CasinoSessionItem>,
): CasinoSessionItem[] {
  for (const row of projectedRows) {
    const rowIsTerminal = row.status === 'settled' || isTerminalPhase(row.phase);
    if (rowIsTerminal && row.payout !== undefined) {
      publishedSettledItems.delete(row.sessionId);
      publishedOpenItems.delete(row.sessionId);
    }
  }

  const presentIds = new Set<string>();
  const reconciled = items.map(item => {
    presentIds.add(item.sessionId);
    const published = publishedSettledItems.get(item.sessionId);
    let next = item;
    if (!isCompleteSettledItem(next)) {
      if (published) return published;
      if (next.isSettled || isTerminalPhase(next.phase)) next = demoteToWaitingRandomness(next);
    }
    if (published && published.lastEventTimestamp > next.lastEventTimestamp) {
      next = { ...next, lastEventTimestamp: published.lastEventTimestamp };
    }
    if (isCompleteSettledItem(next)) {
      publishedSettledItems.set(next.sessionId, next);
      publishedOpenItems.delete(next.sessionId);
    } else if (sessionIdAsNumber(next) !== undefined) {
      publishedOpenItems.set(next.sessionId, next);
    }
    return next;
  });

  const dropped = [...publishedSettledItems.values(), ...publishedOpenItems.values()].filter(
    item => !presentIds.has(item.sessionId),
  );
  return dropped.length === 0 ? reconciled : [...reconciled, ...dropped];
}

/**
 * Newest first, independent of projection storage order: optimistic `pending:`
 * rows lead (in insertion order), then on-chain rounds by descending sessionId.
 * Guarantees `items[0]` is the live/latest round even when the projection
 * returns rows in a regressed order or the reconciler re-appended a round.
 */
export function sortSessionItemsNewestFirst(items: CasinoSessionItem[]): CasinoSessionItem[] {
  return [...items].sort((a, b) => {
    const idA = sessionIdAsNumber(a);
    const idB = sessionIdAsNumber(b);
    if (idA === undefined || idB === undefined) {
      if (idA === idB) return 0;
      return idA === undefined ? -1 : 1;
    }
    return idB > idA ? 1 : idB < idA ? -1 : 0;
  });
}
