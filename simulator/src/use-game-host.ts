// The host side of the bridge, behaving like the production Chain.wtf host:
// the same optimistic-session lifecycle, tx-hash correlation and reveal
// semantics, with bets sent as direct EOA transactions on the local chain
// instead of the production gasless signing path.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Hex, TransactionReceipt } from 'viem';

import type { CasinoGameManifestV1, HostApiV1, HostSnapshotV1 } from '@chain/casino-sdk';

import {
  betPlaced,
  refundStake,
  registerBalanceFetcher,
  resetLedgerScope,
  roundClosed,
  useLedgeredBalance,
} from './balance-hold';
import {
  confirmOptimisticCasinoSession,
  createOptimisticCasinoSession,
  removeOptimisticCasinoSession,
  type OptimisticCasinoSession,
} from './optimistic-casino-session';
import {
  encodeApprove,
  encodeCancelStuckRandomness,
  encodeOpenSession,
  encodeSubmitAction,
  isTerminalPhase,
  latestEncodedSession,
  parseAdvancedSessionSnapshots,
  parseOpenedSessionId,
  type BatchAction,
  type EncodedSessionSnapshot,
  type GameIntegration,
} from './casino';
import { mergeFlashblockPatchIntoRow } from './flashblock-session-patch';
import { verifySessionRandomness } from './randomness-verification';
import type { WalletStatusOverride } from './config';
import type { SimulatorRuntime } from './runtime';
import { useLatestRef } from './use-latest-ref';
import { useRoundLedger } from './use-round-ledger';
import {
  useFlashblockPatches,
  useIndexedSessions,
  useStuckSessionId,
} from './use-simulated-sessions';
import { useCasinoRiskLimits } from './use-casino-risk-limits';
import { sessionRandomnessRequests, useHostSnapshot } from './use-host-snapshot';

export function useGameHost(
  runtime: SimulatorRuntime,
  integration: GameIntegration,
  manifest: CasinoGameManifestV1,
  walletStatus: WalletStatusOverride,
  onContentSize?: (minHeight: number) => void,
  availableHeight?: number,
): {
  snapshot: HostSnapshotV1 | null;
  methods: HostApiV1;
  stuckSessionId: string | undefined;
} {
  const indexedRows = useIndexedSessions(runtime, integration.gameAddress);
  // The production host reads sessions by the connected wallet, so none exist
  // while disconnected; mirror that so games see the same empty state.
  const sessionRows = walletStatus === 'ready' ? indexedRows : undefined;
  const sessionRowsRef = useLatestRef(sessionRows);
  const [optimisticSessions, setOptimisticSessions] = useState<OptimisticCasinoSession[]>([]);

  const [rawBalance, setRawBalance] = useState<bigint | undefined>(undefined);
  useEffect(() => {
    resetLedgerScope(runtime.account.address.toLowerCase());
    let cancelled = false;
    void runtime.fetchTokenBalance().then(value => {
      if (!cancelled) setRawBalance(value);
    });
    const unregister = registerBalanceFetcher(runtime.fetchTokenBalance);
    return () => {
      cancelled = true;
      unregister();
    };
  }, [runtime]);
  const balance = useLedgeredBalance(rawBalance);

  const { trackRound, getRoundKey, queuePendingReveal, endRound } = useRoundLedger(sessionRows);

  // Correlates a bet with its flashblock-pushed CasinoSessionOpened event via
  // the broadcast tx hash. The pushed event can arrive before or after the
  // acceptance callback; both orders are handled, exactly like production.
  const pendingOpenTransactionsRef = useRef(new Map<string, string>());
  const recentFlashblockOpensRef = useRef(new Map<string, { sessionId: string; at: number }>());
  // Opens proven on-chain (their CasinoSessionOpened log was flashblock-pushed),
  // keyed by optimistic request id — lets a bet whose send reporting failed
  // afterwards recover instead of erasing a live round.
  const confirmedOpensRef = useRef(new Map<string, { sessionId: string; transactionHash: Hex }>());
  const handleFlashblockSessionOpened = useCallback(
    (sessionId: string, transactionHash: Hex) => {
      const key = transactionHash.toLowerCase();
      const requestId = pendingOpenTransactionsRef.current.get(key);
      if (!requestId) {
        const recent = recentFlashblockOpensRef.current;
        if (recent.size >= 32) recent.delete(recent.keys().next().value!);
        recent.set(key, { sessionId, at: Date.now() });
        return;
      }
      pendingOpenTransactionsRef.current.delete(key);
      confirmedOpensRef.current.set(requestId, { sessionId, transactionHash });
      setOptimisticSessions(current =>
        confirmOptimisticCasinoSession(
          current,
          requestId,
          runtime.chainId,
          sessionId,
          transactionHash,
        ),
      );
    },
    [runtime.chainId],
  );

  const flashblockPatches = useFlashblockPatches({
    runtime,
    gameAddress: integration.gameAddress,
    sessionRows,
    onSessionOpened: handleFlashblockSessionOpened,
  });
  const flashblockPatchesRef = useLatestRef(flashblockPatches);

  // The host stores only a hash per session, so every submitAction / cancel
  // must echo the latest committed session bytes. They arrive through the
  // player's own receipts, the flashblock patch layer and the indexed feed;
  // whichever holds the newest step wins.
  const sessionSnapshotsRef = useRef(new Map<string, EncodedSessionSnapshot>());
  const rememberSessionSnapshots = useCallback((receipt: TransactionReceipt) => {
    const snapshots = sessionSnapshotsRef.current;
    for (const [sessionId, snapshot] of parseAdvancedSessionSnapshots(receipt)) {
      const known = snapshots.get(sessionId);
      if (known && known.step >= snapshot.step) continue;
      snapshots.delete(sessionId);
      if (snapshots.size >= 64) snapshots.delete(snapshots.keys().next().value!);
      snapshots.set(sessionId, snapshot);
    }
  }, []);
  const resolveEncodedSession = useCallback(
    (sessionId: string): Hex => {
      const patch = flashblockPatchesRef.current[sessionId];
      const row = (sessionRowsRef.current ?? []).find(item => item.sessionId === sessionId);
      const latest = latestEncodedSession(
        sessionSnapshotsRef.current.get(sessionId),
        patch?.step !== undefined && patch.encodedSession !== undefined
          ? { step: patch.step, encodedSession: patch.encodedSession }
          : undefined,
        row?.step !== undefined && row.encodedSession !== undefined
          ? { step: row.step, encodedSession: row.encodedSession as Hex }
          : undefined,
      );
      if (!latest) {
        throw new Error(
          "The round's latest on-chain state hasn't synced yet. Try again in a moment.",
        );
      }
      return latest.encodedSession;
    },
    [flashblockPatchesRef, sessionRowsRef],
  );

  const stuckSessionId = useStuckSessionId(runtime, sessionRows);
  const casinoRiskLimits = useCasinoRiskLimits(runtime);

  const snapshot = useHostSnapshot({
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
  });

  const requireReadyWallet = useCallback(() => {
    if (walletStatus === 'disconnected') throw new Error('Connect a wallet to play.');
    if (walletStatus !== 'ready') throw new Error('Wallet setup is not complete.');
  }, [walletStatus]);

  const methods = useMemo<HostApiV1>(
    () => ({
      async reportContentSize({ minHeight }) {
        if (!Number.isFinite(minHeight)) return;
        onContentSize?.(Math.ceil(minHeight));
      },

      async openSession({ wager, gameData }) {
        requireReadyWallet();
        const wagerWei = BigInt(wager);
        const optimisticRequestId = crypto.randomUUID();
        // Encoding can reject malformed game input, so it must run before the
        // balance hold below — a throw after `betPlaced` would leak the debit
        // and leave the round active, blocking reconciles forever.
        const actions: BatchAction[] = [
          { target: runtime.token, value: 0n, data: encodeApprove(runtime.proxy, wagerWei) },
          {
            target: runtime.proxy,
            value: 0n,
            data: encodeOpenSession({
              game: integration.gameAddress,
              vault: runtime.liquidityVault,
              wager: wagerWei,
              gameData,
            }),
          },
        ];
        // Subtract at kick-off: this also cancels any pending/in-flight balance
        // reconcile so a stale chain read can't land mid-round.
        const roundKey = `open:${crypto.randomUUID()}`;
        betPlaced(roundKey, wagerWei);
        let sessionId: bigint;
        try {
          const projectedSessionIds = new Set(
            (sessionRowsRef.current ?? []).map(row => row.sessionId),
          );
          setOptimisticSessions(current => [
            createOptimisticCasinoSession({
              requestId: optimisticRequestId,
              chainId: runtime.chainId,
              gameAddress: integration.gameAddress,
              wager,
              gameData,
            }),
            ...current.filter(session => !projectedSessionIds.has(session.item.sessionId)),
          ]);
          const { transactionHash, receipt } = await runtime.sendActions(
            actions,
            acceptedTxHash => {
              const key = acceptedTxHash.toLowerCase();
              const seenOpen = recentFlashblockOpensRef.current.get(key);
              if (seenOpen) {
                recentFlashblockOpensRef.current.delete(key);
                confirmedOpensRef.current.set(optimisticRequestId, {
                  sessionId: seenOpen.sessionId,
                  transactionHash: acceptedTxHash,
                });
                setOptimisticSessions(current =>
                  confirmOptimisticCasinoSession(
                    current,
                    optimisticRequestId,
                    runtime.chainId,
                    seenOpen.sessionId,
                    acceptedTxHash,
                  ),
                );
              } else {
                const pending = pendingOpenTransactionsRef.current;
                // Entries from failed bets are never consumed; keep the map bounded.
                if (pending.size >= 32) pending.delete(pending.keys().next().value!);
                pending.set(key, optimisticRequestId);
              }
            },
          );
          rememberSessionSnapshots(receipt);
          sessionId = parseOpenedSessionId(receipt);
          pendingOpenTransactionsRef.current.delete(transactionHash.toLowerCase());
          trackRound(sessionId.toString(), roundKey);
          // Confirm rather than remove: the merge layer hides the row once the
          // indexed feed carries the round, and it becomes the fallback again
          // if the indexed list briefly regresses — so the live round can
          // never vanish from the published snapshot.
          setOptimisticSessions(current =>
            confirmOptimisticCasinoSession(
              current,
              optimisticRequestId,
              runtime.chainId,
              sessionId.toString(),
              transactionHash,
            ),
          );
          confirmedOpensRef.current.delete(optimisticRequestId);
          return { sessionKey: `${runtime.chainId}:${sessionId}`, transactionHash };
        } catch (error) {
          const confirmedOpen = confirmedOpensRef.current.get(optimisticRequestId);
          confirmedOpensRef.current.delete(optimisticRequestId);
          if (confirmedOpen) {
            // The open's log was already flashblock-pushed, so the bet landed
            // on-chain — only the send's reporting failed. Recover as a
            // success instead of erasing a live round.
            trackRound(confirmedOpen.sessionId, roundKey);
            setOptimisticSessions(current =>
              confirmOptimisticCasinoSession(
                current,
                optimisticRequestId,
                runtime.chainId,
                confirmedOpen.sessionId,
                confirmedOpen.transactionHash,
              ),
            );
            return {
              sessionKey: `${runtime.chainId}:${confirmedOpen.sessionId}`,
              transactionHash: confirmedOpen.transactionHash,
            };
          }
          setOptimisticSessions(current =>
            removeOptimisticCasinoSession(current, optimisticRequestId),
          );
          // The wager never left (or we can't prove it did) — restore the
          // display and let the post-round reconcile settle any doubt.
          refundStake(wagerWei);
          roundClosed(roundKey);
          throw error;
        }
      },

      async submitAction({ sessionId, actionData, approvalAmount }) {
        requireReadyWallet();
        // Resolved before the balance hold below: a throw after `betPlaced`
        // would leak the debit and leave the round active.
        const submitData = encodeSubmitAction({
          encodedSession: resolveEncodedSession(sessionId),
          actionData,
        });
        // A reload mid-session resumes via submitAction: start tracking with no
        // stake (the wager left in a previous page load), so the eventual payout
        // still waits for the game's reveal and reconciles stay blocked.
        let roundKey = getRoundKey(sessionId);
        if (!roundKey) {
          roundKey = `resume:${sessionId}`;
          trackRound(sessionId, roundKey);
          betPlaced(roundKey, 0n);
        }
        // Extra stake pulled by the action (double down / split) leaves now.
        const extraStake = approvalAmount ? BigInt(approvalAmount) : 0n;
        if (extraStake > 0n) betPlaced(roundKey, extraStake);
        const actions: BatchAction[] = [];
        if (approvalAmount) {
          actions.push({
            target: runtime.token,
            value: 0n,
            data: encodeApprove(runtime.proxy, BigInt(approvalAmount)),
          });
        }
        actions.push({ target: runtime.proxy, value: 0n, data: submitData });
        try {
          const { transactionHash, receipt } = await runtime.sendActions(actions);
          rememberSessionSnapshots(receipt);
          return { transactionHash };
        } catch (error) {
          refundStake(extraStake);
          throw error;
        }
      },

      async cancelStuckRandomness({ sessionId }) {
        requireReadyWallet();
        const { transactionHash } = await runtime.sendActions([
          {
            target: runtime.proxy,
            value: 0n,
            data: encodeCancelStuckRandomness(resolveEncodedSession(sessionId)),
          },
        ]);
        return { transactionHash };
      },

      async getRandomnessVerification({ sessionId }) {
        // Cryptographic verdict for the game's provably-fair view: read the
        // ECVRF artifacts from the Verify Network router and verify them
        // client-side (docs/RANDOMNESS_VERIFICATION.md). Throwing here (chain
        // unreachable) is meaningful — the game renders a retry, not a failure.
        const patch = flashblockPatchesRef.current[sessionId];
        const indexedRow = (sessionRowsRef.current ?? []).find(
          item => item.sessionId === sessionId,
        );
        // Unknown session (feed still replaying history, or a stale id) must
        // NOT read as "no randomness requests recorded" — throw so the game
        // renders the retryable "could not verify" state instead.
        if (!indexedRow) throw new Error(`Session ${sessionId} not in the indexed feed (yet).`);
        const row = mergeFlashblockPatchIntoRow(indexedRow, patch);
        return verifySessionRandomness({
          publicClient: runtime.publicClient,
          chainId: runtime.chainId,
          proxy: runtime.proxy,
          // Same request projection as the snapshot (includes the
          // single-request randomnessRequestId fallback).
          requests: sessionRandomnessRequests(row),
        });
      },

      async revealOutcome({ sessionId }) {
        if (!getRoundKey(sessionId)) return;
        const patch = flashblockPatchesRef.current[sessionId];
        const indexedRow = (sessionRowsRef.current ?? []).find(
          item => item.sessionId === sessionId,
        );
        // The flashblock patch can carry the settled result before the indexed
        // feed during indexing lag — the credit must not wait on it.
        const row = indexedRow && mergeFlashblockPatchIntoRow(indexedRow, patch);
        const settled = row && (row.status === 'settled' || isTerminalPhase(row.phase));
        if (settled && row.payout !== undefined) {
          endRound(sessionId, BigInt(row.payout));
        } else if (patch?.settled && patch.payout !== undefined) {
          endRound(sessionId, BigInt(patch.payout));
        } else {
          // Neither source has the payout yet — credit from the round ledger
          // the moment the settled row arrives.
          queuePendingReveal(sessionId);
        }
      },
    }),
    [
      runtime,
      integration.gameAddress,
      onContentSize,
      requireReadyWallet,
      trackRound,
      getRoundKey,
      queuePendingReveal,
      endRound,
      sessionRowsRef,
      flashblockPatchesRef,
      rememberSessionSnapshots,
      resolveEncodedSession,
    ],
  );

  return { snapshot, methods, stuckSessionId };
}
