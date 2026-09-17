import { useEffect, useState } from 'react';
import {
  connectGameToHost,
  observeGameContentSize,
  type GuestApiV1,
  type HostApiV1,
  type HostSnapshotV1,
} from '@chain/casino-sdk/guest';

/**
 * Guest side of the casino bridge: connects to the parent host on mount,
 * exposes the host's signing API once the handshake resolves, and mirrors
 * every `setState` push into React state.
 */
export function useCasinoHost(): {
  hostApi: HostApiV1 | null;
  snapshot: HostSnapshotV1 | null;
} {
  const [hostApi, setHostApi] = useState<HostApiV1 | null>(null);
  const [snapshot, setSnapshot] = useState<HostSnapshotV1 | null>(null);

  useEffect(() => {
    let mounted = true;

    const guestMethods: GuestApiV1 = {
      async setState(nextSnapshot) {
        if (!mounted) return;
        setSnapshot(nextSnapshot);
      },
    };

    const connection = connectGameToHost(guestMethods);

    void connection.promise
      .then(parent => {
        if (mounted) setHostApi(parent);
      })
      .catch(() => {
        // Handshake failed — the "waiting for host" screen stays up. Opening
        // the game outside the host iframe never resolves, which is expected.
      });

    return () => {
      mounted = false;
      connection.destroy();
    };
  }, []);

  useEffect(() => {
    if (!hostApi) return;
    const observer = observeGameContentSize(hostApi);
    return () => observer.disconnect();
  }, [hostApi]);

  return { hostApi, snapshot };
}
