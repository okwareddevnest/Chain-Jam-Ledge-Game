import type { Address, Hex } from 'viem';
import type { HostSnapshotV1 } from '@chain/casino-sdk';

export type CasinoSessionItem = HostSnapshotV1['sessions']['items'][number];

export type OptimisticCasinoSession = {
  requestId: string;
  item: CasinoSessionItem;
};

export function createOptimisticCasinoSession(input: {
  requestId: string;
  chainId: number;
  gameAddress: Address;
  wager: string;
  gameData: Hex;
  now?: number;
}): OptimisticCasinoSession {
  const temporarySessionId = `pending:${input.requestId}`;
  const openedAt = Math.floor((input.now ?? Date.now()) / 1_000);

  return {
    requestId: input.requestId,
    item: {
      sessionId: temporarySessionId,
      sessionKey: `${input.chainId}:${temporarySessionId}`,
      gameAddress: input.gameAddress,
      // Expose the same in-flight phase games already receive after an open
      // has been projected. This is host-local and deliberately adds no SDK
      // field that the readonly iframe would need to understand.
      phase: 1,
      phaseName: 'WAITING_RANDOMNESS',
      wager: input.wager,
      stake: input.wager,
      isSettled: false,
      openedAt,
      lastEventTimestamp: openedAt,
      raw: { gameData: input.gameData },
    },
  };
}

export function confirmOptimisticCasinoSession(
  sessions: OptimisticCasinoSession[],
  requestId: string,
  chainId: number,
  sessionId: string,
  openTransactionHash?: Hex,
): OptimisticCasinoSession[] {
  return sessions.map(session =>
    session.requestId === requestId
      ? {
          ...session,
          item: {
            ...session.item,
            sessionId,
            sessionKey: `${chainId}:${sessionId}`,
            raw: openTransactionHash
              ? { ...session.item.raw, openTransactionHash }
              : session.item.raw,
          },
        }
      : session,
  );
}

export function removeOptimisticCasinoSession(
  sessions: OptimisticCasinoSession[],
  requestId: string,
): OptimisticCasinoSession[] {
  return sessions.filter(session => session.requestId !== requestId);
}

/** Keeps optimistic rows visible only until the corresponding indexed row arrives. */
export function mergeCasinoSessionItems(
  projectedItems: CasinoSessionItem[],
  optimisticSessions: OptimisticCasinoSession[],
): CasinoSessionItem[] {
  const projectedById = new Map(projectedItems.map(item => [item.sessionId, item]));
  const visibleOptimisticItems = optimisticSessions
    .filter(session => {
      const projected = projectedById.get(session.item.sessionId);
      // CasinoSessionOpened and CasinoSessionAdvanced can arrive as two
      // indexed updates. Keep the host row through an intermediate NONE phase
      // so the iframe never flashes back to an idle Bet state.
      return !projected || (projected.phase ?? 0) === 0;
    })
    .map(session => session.item);
  const shadowedProjectedIds = new Set(visibleOptimisticItems.map(item => item.sessionId));

  return [
    ...visibleOptimisticItems,
    ...projectedItems.filter(item => !shadowedProjectedIds.has(item.sessionId)),
  ];
}
