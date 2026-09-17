// Dev-only recorder for the snapshot stream pushed to the game iframe. Every
// push is kept (bounded) on `window.__hostSnapshotTrace` and checked against
// the previous one; any transition a game could visually trip on — a session
// vanishing, the newest round regressing, a settled round mutating — is
// reported as a console warning with both digests.
import type { HostSnapshotV1 } from '@chain/casino-sdk';

type SessionItem = HostSnapshotV1['sessions']['items'][number];

type SessionDigest = {
  sessionId: string;
  phase: number | undefined;
  phaseName: string | undefined;
  isSettled: boolean;
  payout: string | undefined;
  gameState: string | undefined;
  randomness: string | undefined;
  settledAt: number | undefined;
  lastEventTimestamp: number;
};

type TraceEntry = {
  push: number;
  at: string;
  items: SessionDigest[];
  warnings: string[];
};

const MAX_TRACE_ENTRIES = 500;

declare global {
  interface Window {
    __hostSnapshotTrace?: TraceEntry[];
  }
}

const digest = (item: SessionItem): SessionDigest => ({
  sessionId: item.sessionId,
  phase: item.phase,
  phaseName: item.phaseName,
  isSettled: item.isSettled,
  payout: item.payout,
  gameState: item.raw.gameState,
  randomness: item.raw.randomness,
  settledAt: item.settledAt,
  lastEventTimestamp: item.lastEventTimestamp,
});

const sessionOrdinal = (sessionId: string): bigint =>
  /^\d+$/.test(sessionId) ? BigInt(sessionId) : BigInt(Number.MAX_SAFE_INTEGER);

const short = (item: SessionDigest) =>
  `${item.sessionId}{ph:${item.phaseName ?? item.phase} settled:${item.isSettled}` +
  `${item.payout !== undefined ? ` payout:${item.payout}` : ''}` +
  ` gs:${item.gameState === undefined ? '-' : `${item.gameState.slice(0, 12)}…(${(item.gameState.length - 2) / 2}B)`}}`;

export function createSnapshotTraceRecorder() {
  let pushCounter = 0;
  let previousItems: Map<string, SessionDigest> | undefined;
  let previousFirst: SessionDigest | undefined;

  return function recordSnapshotPush(snapshot: HostSnapshotV1): void {
    pushCounter += 1;
    const items = snapshot.sessions.items.map(digest);
    const byId = new Map(items.map(item => [item.sessionId, item]));
    const warnings: string[] = [];

    if (previousItems) {
      for (const [sessionId, before] of previousItems) {
        const after = byId.get(sessionId);
        if (!after) {
          warnings.push(`session ${sessionId} VANISHED (was ${short(before)})`);
          continue;
        }
        if (before.isSettled) {
          if (!after.isSettled) {
            warnings.push(`session ${sessionId} settled→unsettled: ${short(after)}`);
          } else if (
            before.gameState !== after.gameState ||
            before.payout !== after.payout ||
            before.settledAt !== after.settledAt
          ) {
            warnings.push(
              `settled session ${sessionId} MUTATED: ${short(before)} → ${short(after)}`,
            );
          }
        }
      }
      const first = items[0];
      if (first && previousFirst && first.sessionId !== previousFirst.sessionId) {
        if (sessionOrdinal(first.sessionId) < sessionOrdinal(previousFirst.sessionId)) {
          warnings.push(
            `items[0] regressed to OLDER session: ${previousFirst.sessionId} → ${first.sessionId}`,
          );
        }
      }
    }

    const entry: TraceEntry = {
      push: pushCounter,
      at: new Date().toISOString().slice(11, 23),
      items,
      warnings,
    };
    const trace = (window.__hostSnapshotTrace ??= []);
    trace.push(entry);
    if (trace.length > MAX_TRACE_ENTRIES) trace.splice(0, trace.length - MAX_TRACE_ENTRIES);

    const summary = items.map(short).join('  ');
    if (warnings.length > 0) {
      console.warn(`[host-push #${pushCounter}] ⚠ ${warnings.join(' | ')}\n  ${summary}`);
    } else {
      console.debug(`[host-push #${pushCounter}] ${summary}`);
    }

    previousItems = byId;
    previousFirst = items[0];
  };
}
