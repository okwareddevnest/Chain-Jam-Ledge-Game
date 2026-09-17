import { useEffect, useRef } from 'react';

import { connectHostToGame } from '@chain/casino-sdk/host';
import type { GuestApiV1, HostApiV1, HostSnapshotV1 } from '@chain/casino-sdk';

import { createSnapshotTraceRecorder } from './snapshot-trace';
import { useLatestRef } from './use-latest-ref';

/**
 * Connects the host to the game iframe via Penpal and keeps the guest fed with
 * snapshot updates. Delegates through latest-value refs so reconnecting the
 * bridge never captures a stale closure.
 */
export function useGameBridge(input: {
  iframe: HTMLIFrameElement | null;
  gameUrl: string | undefined;
  methods: HostApiV1;
  snapshot: HostSnapshotV1 | null;
}): void {
  const { iframe, gameUrl, snapshot } = input;
  const methodsRef = useLatestRef(input.methods);
  const snapshotRef = useLatestRef(snapshot);
  const guestApiRef = useRef<GuestApiV1 | undefined>(undefined);
  const lastPushedRef = useRef<string | undefined>(undefined);
  const recordPushRef = useRef<ReturnType<typeof createSnapshotTraceRecorder> | undefined>(
    undefined,
  );
  recordPushRef.current ??= createSnapshotTraceRecorder();

  useEffect(
    function connectHostToGameOnMount() {
      if (!iframe || !gameUrl) return;

      let childOrigin: string;
      try {
        childOrigin = new URL(gameUrl).origin;
      } catch {
        // Not a valid URL — nothing to connect to.
        return;
      }
      const connection = connectHostToGame({
        iframe,
        childOrigin,
        methods: {
          reportContentSize: input =>
            methodsRef.current.reportContentSize?.(input) ?? Promise.resolve(),
          openSession: input => methodsRef.current.openSession(input),
          submitAction: input => methodsRef.current.submitAction(input),
          cancelStuckRandomness: input => methodsRef.current.cancelStuckRandomness(input),
          getRandomnessVerification: input =>
            methodsRef.current.getRandomnessVerification?.(input) ??
            Promise.reject(new Error('Randomness verification is not available.')),
          revealOutcome: input => methodsRef.current.revealOutcome(input),
        },
      });

      let destroyed = false;
      void connection.promise
        .then(async guestApi => {
          if (destroyed) return;
          guestApiRef.current = guestApi;
          if (snapshotRef.current) {
            lastPushedRef.current = JSON.stringify(snapshotRef.current);
            recordPushRef.current?.(snapshotRef.current);
            await guestApi.setState(snapshotRef.current);
          }
        })
        .catch(() => {
          /* handshake failed (iframe navigated / blocked) — nothing to push */
        });

      return () => {
        destroyed = true;
        guestApiRef.current = undefined;
        lastPushedRef.current = undefined;
        connection.destroy();
      };
    },
    [iframe, gameUrl, methodsRef, snapshotRef],
  );

  useEffect(
    function pushSnapshotChangesToGuest() {
      const guestApi = guestApiRef.current;
      if (!guestApi || !snapshot) return;
      // Upstream layers rebuild the snapshot object on every store/patch tick,
      // most without a semantic change. Games react to every setState (some
      // replay animations), so only content changes are pushed.
      const serialized = JSON.stringify(snapshot);
      if (serialized === lastPushedRef.current) return;
      lastPushedRef.current = serialized;
      recordPushRef.current?.(snapshot);
      void guestApi.setState(snapshot).catch(() => {
        /* connection torn down between render and push — safe to ignore */
      });
    },
    [snapshot],
  );
}
