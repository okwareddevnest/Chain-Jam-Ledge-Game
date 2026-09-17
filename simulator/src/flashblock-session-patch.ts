import type { Hex } from 'viem';

import type { CasinoSessionChainEvent } from './session-events';
import type { CasinoSessionItem } from './optimistic-casino-session';
import { CASINO_SESSION_PHASE } from './casino-session-codec';
import { isTerminalPhase, phaseName, type CasinoSessionRow } from './casino';

/**
 * Forward-only session state reconstructed from flashblock-pushed chain
 * events, keyed by sessionId. The production host maintains the same layer so
 * games see fresh state before the indexed session feed catches up: terminal
 * state is absorbing, and a session can never move backwards (e.g. behind
 * fulfilled randomness).
 */
export type FlashblockSessionPatch = {
  sessionId: string;
  openTransactionHash?: Hex;
  step?: number;
  phase?: number;
  actionDeadlineBlock?: string;
  randomnessDeadlineBlock?: string;
  gameData?: Hex;
  gameState?: Hex;
  stake?: string;
  /** Committed session bytes as of `step`; what submitAction / cancel must echo. */
  encodedSession?: Hex;
  randomnessRequestId?: Hex;
  /** Step that made the current request. */
  requestNonce?: string;
  randomnessFulfilled?: boolean;
  /** Latest fulfillment seen, kept even after a newer request supersedes it. */
  fulfilledRequestId?: Hex;
  fulfilledNonce?: string;
  randomness?: Hex;
  fulfillmentTransactionHash?: Hex;
  settled?: boolean;
  payout?: string;
  settledAt?: number;
  settleTransactionHash?: Hex;
};

export type FlashblockSessionPatches = Record<string, FlashblockSessionPatch>;

// A step driven by randomness fulfils the request made at the step before it,
// so the fulfilled request is keyed by that earlier step.
function withFulfillment(
  patch: FlashblockSessionPatch,
  nonce: string | undefined,
  randomness: Hex,
  transactionHash: Hex,
): FlashblockSessionPatch {
  if (nonce === undefined) return { ...patch, randomness };
  return {
    ...patch,
    randomnessFulfilled: true,
    fulfilledNonce: nonce,
    fulfilledRequestId: patch.requestNonce === nonce ? patch.randomnessRequestId : undefined,
    randomness,
    fulfillmentTransactionHash: transactionHash,
  };
}

export function applyFlashblockEvent(
  patches: FlashblockSessionPatches,
  event: CasinoSessionChainEvent,
  now: number = Date.now(),
): FlashblockSessionPatches {
  const current = patches[event.sessionId] ?? { sessionId: event.sessionId };

  let next: FlashblockSessionPatch;
  switch (event.eventName) {
    case 'CasinoSessionOpened':
      next = { ...current, openTransactionHash: event.transactionHash };
      break;
    case 'CasinoSessionAdvanced': {
      if (current.settled) return patches;
      // One advance per step, strictly increasing — an equal-or-lower step is
      // a replay. Multi-step games legitimately return to WAITING_RANDOMNESS
      // on every action, so the phase alone can't identify a regression.
      if (current.step !== undefined && event.step <= current.step) return patches;
      next = {
        ...current,
        step: event.step,
        phase: event.phase,
        gameData: event.gameData,
        gameState: event.gameState,
        stake: event.stake,
        encodedSession: event.encodedSession,
        actionDeadlineBlock:
          event.phase === CASINO_SESSION_PHASE.WAITING_PLAYER_ACTION
            ? event.deadlineBlock
            : current.actionDeadlineBlock,
        randomnessDeadlineBlock:
          event.phase === CASINO_SESSION_PHASE.WAITING_RANDOMNESS
            ? event.deadlineBlock
            : current.randomnessDeadlineBlock,
      };
      if (event.randomness !== undefined) {
        next = withFulfillment(
          next,
          String(event.step - 1),
          event.randomness,
          event.transactionHash,
        );
      }
      if (event.requestId !== undefined) {
        next = {
          ...next,
          randomnessRequestId: event.requestId,
          requestNonce: String(event.step),
          randomnessFulfilled: false,
        };
      }
      break;
    }
    case 'CasinoSessionSettled': {
      if (current.settled) return patches;
      next = {
        ...current,
        settled: true,
        phase: event.phase,
        payout: event.payout,
        gameState: event.gameState,
        settledAt: Math.floor(now / 1_000),
        settleTransactionHash: event.transactionHash,
      };
      if (event.randomness !== undefined) {
        const pendingNonce =
          current.requestNonce ?? (current.step === undefined ? undefined : String(current.step));
        next = withFulfillment(next, pendingNonce, event.randomness, event.transactionHash);
      }
      break;
    }
  }

  return { ...patches, [event.sessionId]: next };
}

/**
 * Overlays a patch onto an indexed session row, but only where the row is
 * still behind: the indexed feed always wins once it has caught up.
 */
export function mergeFlashblockPatchIntoRow(
  row: CasinoSessionRow,
  patch: FlashblockSessionPatch | undefined,
): CasinoSessionRow {
  if (!patch) return row;

  let merged = row;
  const rowIsTerminal = row.status === 'settled' || isTerminalPhase(row.phase);

  if (!rowIsTerminal) {
    if (patch.step !== undefined && patch.step > (row.step ?? -1)) {
      const requestedAtLatestStep =
        patch.requestNonce === String(patch.step) && patch.randomnessRequestId !== undefined;
      merged = {
        ...merged,
        step: patch.step,
        phase: patch.phase ?? merged.phase,
        actionDeadlineBlock: patch.actionDeadlineBlock ?? merged.actionDeadlineBlock,
        randomnessDeadlineBlock: patch.randomnessDeadlineBlock ?? merged.randomnessDeadlineBlock,
        gameData: patch.gameData ?? merged.gameData,
        gameState: patch.gameState ?? merged.gameState,
        stake: patch.stake ?? merged.stake,
        encodedSession: patch.encodedSession ?? merged.encodedSession,
        ...(requestedAtLatestStep
          ? { randomnessRequestId: patch.randomnessRequestId, randomnessFulfilled: false }
          : {}),
      };
    }
    if (patch.settled && patch.payout !== undefined && patch.gameState !== undefined) {
      merged = {
        ...merged,
        status: 'settled',
        phase: patch.phase ?? merged.phase,
        payout: patch.payout,
        gameState: patch.gameState,
        settledAt: merged.settledAt ?? patch.settledAt,
        settleTransactionHash: merged.settleTransactionHash ?? patch.settleTransactionHash,
      };
    }
  }

  // Record the patch's latest fulfillment in the nonce-ordered request list so
  // the snapshot's "latest randomness" never regresses while the row catches
  // up. The session-level flag is only claimed when the fulfillment is at or
  // past the row's current request — a stale patch must not mask a newer
  // pending request (multi-step games), which would hide stuck-round recovery.
  if (patch.fulfilledNonce !== undefined && patch.randomness !== undefined) {
    const alreadyRecorded =
      row.randomnessRequests?.some(
        request => request.nonce === patch.fulfilledNonce && request.fulfilled,
      ) ?? false;
    if (!alreadyRecorded) {
      const requests = merged.randomnessRequests ? [...merged.randomnessRequests] : [];
      const index = requests.findIndex(request => request.nonce === patch.fulfilledNonce);
      const entry = {
        nonce: patch.fulfilledNonce,
        requestId: patch.fulfilledRequestId ?? requests[index]?.requestId ?? '',
        randomness: patch.randomness,
        fulfilled: true,
        transactionHash: patch.fulfillmentTransactionHash,
      };
      if (index === -1) {
        requests.push(entry);
        requests.sort((a, b) => (BigInt(a.nonce) < BigInt(b.nonce) ? -1 : 1));
      } else if (!requests[index]!.fulfilled) {
        requests[index] = { ...requests[index]!, ...entry };
      }
      const currentRequestNonce = row.randomnessRequests?.at(-1)?.nonce;
      const fulfillsCurrentRequest =
        currentRequestNonce === undefined ||
        BigInt(patch.fulfilledNonce) >= BigInt(currentRequestNonce);
      merged = {
        ...merged,
        randomnessRequests: requests,
        ...(fulfillsCurrentRequest && !row.randomnessFulfilled
          ? {
              randomnessFulfilled: true,
              randomnessRequestId: merged.randomnessRequestId ?? patch.fulfilledRequestId,
            }
          : {}),
      };
    }
  }

  return merged;
}

/**
 * Overlays a patch onto an optimistic host item that has no indexed row yet,
 * so fresh chain state (phase, gameState, payout) reaches the iframe before
 * the indexed feed delivers it. The settled flip is atomic: a terminal phase
 * is only exposed together with its payout and gameState.
 */
export function mergeFlashblockPatchIntoItem(
  item: CasinoSessionItem,
  patch: FlashblockSessionPatch | undefined,
): CasinoSessionItem {
  if (!patch || item.isSettled) return item;

  if (patch.settled && patch.payout !== undefined && patch.gameState !== undefined) {
    return {
      ...item,
      phase: patch.phase,
      phaseName: phaseName(patch.phase),
      stake: patch.stake ?? item.stake,
      payout: patch.payout,
      isSettled: true,
      settledAt: item.settledAt ?? patch.settledAt,
      lastEventTimestamp: patch.settledAt ?? item.lastEventTimestamp,
      raw: {
        ...item.raw,
        gameState: patch.gameState,
        randomness: item.raw.randomness ?? patch.randomness,
        requestId: item.raw.requestId ?? patch.randomnessRequestId,
        settleTransactionHash: item.raw.settleTransactionHash ?? patch.settleTransactionHash,
      },
    };
  }

  let merged = item;
  if (patch.phase !== undefined && !isTerminalPhase(patch.phase)) {
    merged = {
      ...merged,
      phase: patch.phase,
      phaseName: phaseName(patch.phase),
      raw: { ...merged.raw, gameState: patch.gameState ?? merged.raw.gameState },
    };
  }
  if (patch.stake !== undefined) {
    merged = { ...merged, stake: patch.stake };
  }
  if (patch.randomness !== undefined && merged.raw.randomness === undefined) {
    merged = { ...merged, raw: { ...merged.raw, randomness: patch.randomness } };
  }
  return merged;
}

function rowRecordedFulfillment(row: CasinoSessionRow, nonce: string): boolean {
  return (
    row.randomnessRequests?.some(request => request.nonce === nonce && request.fulfilled) ??
    row.randomnessFulfilled ??
    false
  );
}

/** Drops patches the indexed feed has caught up with, keeping the map bounded. */
export function pruneFlashblockPatches(
  patches: FlashblockSessionPatches,
  rows: CasinoSessionRow[],
): FlashblockSessionPatches {
  const rowsById = new Map(rows.map(row => [row.sessionId, row]));
  const stale = Object.values(patches).filter(patch => {
    const row = rowsById.get(patch.sessionId);
    if (!row) return false;
    if (patch.step !== undefined && (row.step ?? -1) < patch.step) return false;
    if (patch.settled && row.status !== 'settled' && !isTerminalPhase(row.phase)) return false;
    if (patch.fulfilledNonce !== undefined && !rowRecordedFulfillment(row, patch.fulfilledNonce)) {
      return false;
    }
    return true;
  });
  if (stale.length === 0) return patches;

  const next = { ...patches };
  for (const patch of stale) delete next[patch.sessionId];
  return next;
}
