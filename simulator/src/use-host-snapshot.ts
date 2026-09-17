// Builds the `HostSnapshotV1` the iframe consumes, the way the production
// host does — with the wallet replaced by the local EOA and the wallet status
// driven by the setup panel so games can exercise their non-ready states.
import { useMemo, useRef } from 'react';
import type { Hex } from 'viem';

import type { CasinoGameManifestV1, HostSnapshotV1, RandomnessRequestV1 } from '@chain/casino-sdk';

import type { WalletStatusOverride } from './config';
import type { SimulatorRuntime } from './runtime';
import {
  mergeCasinoSessionItems,
  type CasinoSessionItem,
  type OptimisticCasinoSession,
} from './optimistic-casino-session';
import {
  reconcileMonotonicSessionItems,
  sortSessionItemsNewestFirst,
} from './monotonic-session-items';
import {
  mergeFlashblockPatchIntoItem,
  mergeFlashblockPatchIntoRow,
  type FlashblockSessionPatches,
} from './flashblock-session-patch';
import { isTerminalPhase, phaseName, type CasinoSessionRow, type GameIntegration } from './casino';

const HOST_API_VERSION = 1;

// Diagnostic prod-parity mode (?maskWaiting=1): the production projection
// currently swallows every mid-round WAITING_RANDOMNESS transition (its guards
// predate multi-randomness games), so deployed games have never seen phase 1
// between their actions — a round appears to sit in WAITING_PLAYER_ACTION and
// jump straight to SETTLED. Masking reproduces that stream: a game that only
// misbehaves with masking OFF is reacting to the mid-round waiting states.
const MASK_MID_ROUND_WAITING =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('maskWaiting');

function maskMidRoundWaiting(
  items: CasinoSessionItem[],
  lastActionableItems: Map<string, CasinoSessionItem>,
): CasinoSessionItem[] {
  if (!MASK_MID_ROUND_WAITING) return items;
  return items.map(item => {
    if (item.isSettled) {
      lastActionableItems.delete(item.sessionId);
      return item;
    }
    if (item.phaseName === 'WAITING_PLAYER_ACTION') {
      lastActionableItems.set(item.sessionId, item);
      return item;
    }
    if (item.phase === 1) return lastActionableItems.get(item.sessionId) ?? item;
    return item;
  });
}
const TOKEN_ICON_PATH = '/assets/chUSD.webp';

/** Absolute URL so cross-origin game iframes can load the icon, matching the production host. */
function tokenIconUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return new URL(TOKEN_ICON_PATH, window.location.origin).toString();
}

export function sessionRandomnessRequests(row: CasinoSessionRow): RandomnessRequestV1[] {
  if (row.randomnessRequests?.length) {
    return row.randomnessRequests.map(request => ({
      nonce: request.nonce,
      requestId: request.requestId as Hex,
      randomness: request.randomness as Hex | undefined,
      fulfilled: request.fulfilled,
      transactionHash: request.transactionHash as Hex | undefined,
    }));
  }
  if (row.randomnessRequestId) {
    return [
      {
        nonce: '0',
        requestId: row.randomnessRequestId as Hex,
        fulfilled: row.randomnessFulfilled ?? false,
      },
    ];
  }
  return [];
}

/** Builds the `HostSnapshotV1` the iframe consumes from wallet + session state. */
export function useHostSnapshot(input: {
  integration: GameIntegration;
  manifest: CasinoGameManifestV1;
  runtime: SimulatorRuntime;
  walletStatus: WalletStatusOverride;
  casinoRiskLimits: HostSnapshotV1['casino'];
  sessionRows: CasinoSessionRow[] | undefined;
  optimisticSessions: OptimisticCasinoSession[];
  flashblockPatches: FlashblockSessionPatches;
  balance: bigint | undefined;
  availableHeight?: number;
}): HostSnapshotV1 | null {
  const {
    integration,
    manifest,
    runtime,
    walletStatus,
    casinoRiskLimits,
    sessionRows,
    optimisticSessions,
    flashblockPatches,
    balance,
    availableHeight,
  } = input;
  const chainId = runtime.chainId;

  // Rounds already pushed to the iframe — settled-with-result and in-flight
  // with an on-chain id; used to keep the published session list monotonic
  // across optimistic/indexed races.
  const publishedSettledItemsRef = useRef(new Map<string, CasinoSessionItem>());
  const publishedOpenItemsRef = useRef(new Map<string, CasinoSessionItem>());
  const lastActionableItemsRef = useRef(new Map<string, CasinoSessionItem>());

  return useMemo<HostSnapshotV1 | null>(() => {
    // Flashblock patches only fill in what the indexed feed is still behind
    // on; a caught-up indexed row makes them a no-op.
    const projectedSessionItems = (sessionRows ?? [])
      .map(row => mergeFlashblockPatchIntoRow(row, flashblockPatches[row.sessionId]))
      .map(row => {
        const randomnessRequests = sessionRandomnessRequests(row);
        // The list is nonce-ascending; games consume the latest fulfilled word
        // (multi-step games request randomness per action).
        const latestFulfilledRandomness = randomnessRequests
          .filter(request => request.fulfilled)
          .at(-1)?.randomness;
        return {
          sessionId: row.sessionId,
          sessionKey: `${chainId}:${row.sessionId}`,
          gameAddress: integration.gameAddress,
          phase: row.phase,
          phaseName: phaseName(row.phase),
          wager: row.wager,
          stake: row.stake,
          payout: row.payout,
          isSettled: row.status === 'settled' || isTerminalPhase(row.phase),
          openedAt: row.openedAt,
          settledAt: row.settledAt,
          lastEventTimestamp: row.settledAt ?? row.openedAt,
          raw: {
            gameData: row.gameData as Hex | undefined,
            gameState: row.gameState as Hex | undefined,
            randomness: latestFulfilledRandomness ?? flashblockPatches[row.sessionId]?.randomness,
            requestId: row.randomnessRequestId as Hex | undefined,
            randomnessRequests: randomnessRequests.length > 0 ? randomnessRequests : undefined,
            openTransactionHash: row.openTransactionHash as Hex | undefined,
            settleTransactionHash: row.settleTransactionHash as Hex | undefined,
          },
        };
      });

    const projectedSessionIds = new Set(projectedSessionItems.map(item => item.sessionId));
    const patchedOptimisticSessions = optimisticSessions.map(session =>
      projectedSessionIds.has(session.item.sessionId)
        ? session
        : {
            ...session,
            item: mergeFlashblockPatchIntoItem(
              session.item,
              flashblockPatches[session.item.sessionId],
            ),
          },
    );

    return {
      apiVersion: HOST_API_VERSION,
      integration: {
        chainId,
        slug: integration.slug,
        gameAddress: integration.gameAddress,
        manifest,
      },
      wallet: {
        address: walletStatus === 'disconnected' ? undefined : runtime.account.address,
        smartVaultAddress: walletStatus === 'ready' ? runtime.account.address : undefined,
        status: walletStatus,
      },
      token: {
        symbol: runtime.tokenSymbol || undefined,
        decimals: runtime.tokenDecimals,
        iconUrl: tokenIconUrl(),
      },
      balances: {
        smartVaultBalance: balance?.toString(),
      },
      casino: casinoRiskLimits,
      sessions: {
        // All session state — including the game-specific gameData/gameState
        // bytes — comes from the indexed rows (the host contract emits the
        // bytes in its events). A locally-created row is prepended while the
        // indexed feed catches up so the iframe can react to Play immediately.
        items: maskMidRoundWaiting(
          sortSessionItemsNewestFirst(
            reconcileMonotonicSessionItems(
              mergeCasinoSessionItems(projectedSessionItems, patchedOptimisticSessions),
              sessionRows ?? [],
              publishedSettledItemsRef.current,
              publishedOpenItemsRef.current,
            ),
          ),
          lastActionableItemsRef.current,
        ),
      },
      ui: {
        locale: 'en',
        theme: 'dark',
        viewport: availableHeight === undefined ? undefined : { availableHeight },
      },
    };
  }, [
    chainId,
    integration.slug,
    integration.gameAddress,
    manifest,
    runtime.account.address,
    runtime.tokenSymbol,
    runtime.tokenDecimals,
    walletStatus,
    casinoRiskLimits,
    balance,
    sessionRows,
    optimisticSessions,
    flashblockPatches,
    availableHeight,
  ]);
}
