import { useEffect, useState } from 'react';

import { isEmbedded } from './environment';

/**
 * How much vertical room the game actually has, so the layout can fill the screen instead
 * of clumping into the top of a tall one.
 *
 * Viewport units are wrong inside the host: it grows the iframe to fit content, so `100vh`
 * resolves to the content height rather than the screen (VISUAL_AND_UX.md). The host
 * publishes the real figure as `ui.viewport.availableHeight`; standalone, `innerHeight` is
 * the same thing. Returns null when neither is known, and the layout falls back to sizing
 * by content.
 */
export function useAvailableHeight(hostHeight: number | undefined): number | null {
  const [ownHeight, setOwnHeight] = useState<number | null>(() =>
    typeof window === 'undefined' || isEmbedded() ? null : window.innerHeight,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || isEmbedded()) return;

    const measure = () => setOwnHeight(window.innerHeight);
    measure();

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // The host's figure always wins: it knows about its own chrome, we do not.
  return hostHeight ?? ownHeight;
}
