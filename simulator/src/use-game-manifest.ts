import { useEffect, useState } from 'react';

import { validateCasinoGameManifest, type CasinoGameManifestV1 } from '@chain/casino-sdk';

import type { GameIntegration } from './casino';

// A minimal, always-valid manifest used when the game origin doesn't (yet)
// serve a `game.manifest.json`, so the bridge always hands the iframe a
// complete HostSnapshotV1.
function fallbackManifest(integration: GameIntegration): CasinoGameManifestV1 {
  return {
    schemaVersion: 1,
    gameId: integration.gameName,
    apiVersion: 1,
    defaultLocale: 'en',
    locales: { en: { name: integration.name, description: integration.description } },
    assets: integration.image ? { iconUrl: integration.image } : undefined,
  };
}

/** Fetches + validates the game's `game.manifest.json` from its own origin. */
export function useGameManifest(integration: GameIntegration): {
  manifest: CasinoGameManifestV1;
} {
  const [manifest, setManifest] = useState<CasinoGameManifestV1 | null>(null);

  useEffect(() => {
    if (!integration.url) return;
    let cancelled = false;
    let manifestUrl: string;
    try {
      manifestUrl = new URL('game.manifest.json', integration.url).toString();
    } catch {
      // Not a valid URL (mid-typing in the setup panel) — keep the fallback.
      return;
    }
    void (async () => {
      try {
        const response = await fetch(manifestUrl);
        if (!response.ok) return;
        const result = validateCasinoGameManifest((await response.json()) as unknown);
        if (!cancelled && result.ok) setManifest(result.manifest);
      } catch {
        // Fall through to the fallback manifest.
      }
    })();
    return () => {
      cancelled = true;
      setManifest(null);
    };
  }, [integration.url]);

  return { manifest: manifest ?? fallbackManifest(integration) };
}
