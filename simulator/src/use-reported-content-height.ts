import { useCallback, useEffect, useRef, useState } from 'react';

type Gate =
  | { mode: 'open' }
  | { mode: 'fullscreen'; restoreHeight: number | undefined }
  | { mode: 'restoring'; inflatedHeight: number };

/**
 * Accepts content-size reports from the game, except around fullscreen: while
 * the iframe is fullscreen its document fills the screen, so the game reports
 * the screen height as content size. Accepting that would inflate the
 * container, and after exit the game shell fills the inflated iframe and keeps
 * re-reporting the same height forever — the container would never shrink
 * back. So reports are dropped during fullscreen, the pre-fullscreen height is
 * restored on exit, and echoes of the inflated height are ignored until the
 * container has re-laid out.
 *
 * Copied from apps/web `features/game-frame/use-reported-content-height.ts`.
 */
export function useReportedContentHeight(iframe: HTMLIFrameElement | null) {
  const [reportedContentHeight, setReportedContentHeight] = useState<number>();
  const gateRef = useRef<Gate>({ mode: 'open' });
  const lastAcceptedRef = useRef<number | undefined>(undefined);

  const reportContentHeight = useCallback((height: number) => {
    const gate = gateRef.current;
    if (gate.mode === 'fullscreen') return;
    if (gate.mode === 'restoring') {
      if (Math.abs(height - gate.inflatedHeight) <= 2) return;
      gateRef.current = { mode: 'open' };
    }
    lastAcceptedRef.current = height;
    setReportedContentHeight(height);
  }, []);

  useEffect(() => {
    if (!iframe) return;

    const handleFullscreenChange = () => {
      const gate = gateRef.current;
      if (document.fullscreenElement === iframe) {
        gateRef.current = { mode: 'fullscreen', restoreHeight: lastAcceptedRef.current };
      } else if (gate.mode === 'fullscreen') {
        gateRef.current = {
          mode: 'restoring',
          inflatedHeight: iframe.getBoundingClientRect().height,
        };
        setReportedContentHeight(gate.restoreHeight);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [iframe]);

  return { reportedContentHeight, reportContentHeight };
}
