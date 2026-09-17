// In-browser stand-in for the indexed session feed the production host reads.
// Events arrive from the local chain after the simulated indexing lag and
// evolve one row per session with the same monotonic rules the production
// pipeline applies (terminal state absorbing, per-request randomness tracking,
// no regressing behind fulfilled randomness).
import type { CasinoSessionRow } from './casino';
import { CASINO_SESSION_PHASE } from './casino-session-codec';
import type { CasinoSessionChainEvent } from './session-events';

type RandomnessRequest = NonNullable<CasinoSessionRow['randomnessRequests']>[number];

// Multi-step games make several randomness requests per session, so every
// request is tracked in a nonce-keyed list. Upserts are idempotent and a
// fulfilled entry is never downgraded by a replayed request.
function upsertRandomnessRequest(
  requests: RandomnessRequest[] | undefined,
  entry: RandomnessRequest,
): RandomnessRequest[] {
  const list = requests ? [...requests] : [];
  const index = list.findIndex(request => request.nonce === entry.nonce);
  if (index === -1) {
    list.push(entry);
    return list.sort((a, b) => (BigInt(a.nonce) < BigInt(b.nonce) ? -1 : 1));
  }
  if (!list[index]!.fulfilled) {
    list[index] = {
      ...list[index]!,
      ...entry,
      requestId: entry.requestId || list[index]!.requestId,
    };
  }
  return list;
}

// A step driven by randomness fulfils the request made at the step before it
// (every WAITING_RANDOMNESS step is followed by exactly one fulfillment step),
// so the fulfilled request is keyed by that earlier step.
function recordFulfillment(
  state: CasinoSessionRow,
  requestStep: number,
  randomness: string,
  transactionHash: string,
): RandomnessRequest[] {
  const nonce = String(requestStep);
  const known = state.randomnessRequests?.find(request => request.nonce === nonce);
  return upsertRandomnessRequest(state.randomnessRequests, {
    nonce,
    requestId: known?.requestId ?? state.randomnessRequestId ?? '',
    randomness,
    fulfilled: true,
    transactionHash,
  });
}

function initialRow(sessionId: string, chainId: number): CasinoSessionRow {
  return {
    sessionId,
    chainId,
    game: '0x',
    player: '0x',
    vault: '0x',
    token: '0x',
    wager: '0',
    maxEscrowStake: '0',
    maxReservedProfit: '0',
    status: 'open',
    phase: 0,
    openedAt: 0,
  };
}

function evolve(state: CasinoSessionRow, event: CasinoSessionChainEvent): CasinoSessionRow {
  switch (event.eventName) {
    case 'CasinoSessionOpened':
      return {
        ...state,
        game: event.game.toLowerCase(),
        player: event.player.toLowerCase(),
        vault: event.vault.toLowerCase(),
        wager: event.wager,
        stake: state.stake ?? event.wager,
        // A replayed/late open event may arrive after settlement. Fill the
        // immutable opening fields without regressing the lifecycle.
        status: state.status === 'settled' ? 'settled' : 'open',
        openedAt: event.timestamp,
        openTransactionHash: event.transactionHash,
      };
    case 'CasinoSessionAdvanced': {
      // Terminal state is absorbing and the host emits exactly one advance per
      // step with strictly increasing steps, so an equal-or-lower step is a
      // replayed/out-of-order event. (Multi-step games legitimately return to
      // WAITING_RANDOMNESS on every action, so the phase alone can't tell.)
      if (state.status === 'settled') return state;
      if (state.step !== undefined && event.step <= state.step) return state;

      let randomnessRequests = state.randomnessRequests;
      if (event.randomness !== undefined) {
        randomnessRequests = recordFulfillment(
          state,
          event.step - 1,
          event.randomness,
          event.transactionHash,
        );
      }
      if (event.requestId !== undefined) {
        randomnessRequests = upsertRandomnessRequest(randomnessRequests, {
          nonce: String(event.step),
          requestId: event.requestId,
          fulfilled: false,
        });
      }
      const waitingRandomness = event.phase === CASINO_SESSION_PHASE.WAITING_RANDOMNESS;
      const waitingPlayer = event.phase === CASINO_SESSION_PHASE.WAITING_PLAYER_ACTION;
      return {
        ...state,
        step: event.step,
        phase: event.phase,
        token: event.token.toLowerCase(),
        stake: event.stake,
        maxEscrowStake: event.maxEscrowStake,
        maxReservedProfit: event.maxReservedProfit,
        gameData: event.gameData,
        gameState: event.gameState,
        actionDeadlineBlock: waitingPlayer ? event.deadlineBlock : state.actionDeadlineBlock,
        randomnessDeadlineBlock: waitingRandomness
          ? event.deadlineBlock
          : state.randomnessDeadlineBlock,
        randomnessRequestId: event.requestId ?? state.randomnessRequestId,
        randomnessFulfilled:
          event.requestId !== undefined
            ? false
            : event.randomness !== undefined
              ? true
              : state.randomnessFulfilled,
        randomnessRequests,
        encodedSession: event.encodedSession,
      };
    }
    case 'CasinoSessionSettled': {
      const randomnessRequests =
        event.randomness !== undefined
          ? recordFulfillment(state, state.step ?? 0, event.randomness, event.transactionHash)
          : state.randomnessRequests;
      return {
        ...state,
        game: event.game.toLowerCase(),
        player: event.player.toLowerCase(),
        phase: event.phase,
        payout: event.payout,
        gameState: event.gameState,
        status: 'settled',
        settledAt: event.timestamp,
        settleTransactionHash: event.transactionHash,
        randomnessFulfilled: event.randomness !== undefined ? true : state.randomnessFulfilled,
        randomnessRequests,
        encodedSession: undefined,
      };
    }
  }
}

export type SessionStore = {
  applyEvent: (event: CasinoSessionChainEvent) => void;
  /** The player's sessions for one game, newest first — the query shape games see. */
  listByPlayerAndGame: (player: string, game: string, limit?: number) => CasinoSessionRow[];
  subscribe: (listener: () => void) => () => void;
  getVersion: () => number;
};

export function createSessionStore(chainId: number): SessionStore {
  const rows = new Map<string, CasinoSessionRow>();
  const listeners = new Set<() => void>();
  let version = 0;

  const notify = () => {
    version += 1;
    for (const listener of listeners) listener();
  };

  return {
    applyEvent: event => {
      const current = rows.get(event.sessionId) ?? initialRow(event.sessionId, chainId);
      const next = evolve(current, event);
      if (next === current) return;
      rows.set(event.sessionId, next);
      notify();
    },
    listByPlayerAndGame: (player, game, limit = 50) => {
      const playerKey = player.toLowerCase();
      const gameKey = game.toLowerCase();
      return [...rows.values()]
        .filter(row => row.player === playerKey && row.game === gameKey)
        .sort((a, b) =>
          a.openedAt === b.openedAt
            ? Number(BigInt(b.sessionId) - BigInt(a.sessionId))
            : b.openedAt - a.openedAt,
        )
        .slice(0, limit);
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => version,
  };
}
