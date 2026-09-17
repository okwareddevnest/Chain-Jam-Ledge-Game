// Production's game-page viewport: owns the aspect-ratio / minHeight box that
// GameFrame fills. Copied from apps/web `routes/casino/games/$gameName.tsx`
// (GameViewport) so the simulator sizes the iframe the same way as chain.wtf.
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WalletStatusOverride } from './config';
import type { GameIntegration } from './casino';
import type { SimulatorRuntime } from './runtime';
import { GameFrame } from './GameFrame';

const gameViewportStyle = {
  backgroundImage: 'linear-gradient(rgb(17,17,17), rgb(30,30,30))',
  backgroundSize: '100% 100%',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'center',
} as const;

export function GameViewport({
  runtime,
  integration,
  walletStatus,
}: {
  runtime: SimulatorRuntime;
  integration: GameIntegration;
  walletStatus: WalletStatusOverride;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [contentMinHeight, setContentMinHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    setContentMinHeight(undefined);
  }, [integration.url]);

  const handleContentSize = useCallback((minHeight: number) => {
    // The iframe sits inside the container's border, so the border height must
    // be added on top of the game's content height or the game overflows by
    // that many pixels and shows a scrollbar. Border widths come from computed
    // style, not offsetHeight - clientHeight: those round to integers
    // independently, so at fractional browser zoom their difference flips
    // between adjacent values on every re-layout.
    const container = containerRef.current;
    const style = container ? getComputedStyle(container) : undefined;
    const borderHeight = style
      ? Math.ceil(parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth))
      : 0;
    const next = Math.min(Math.max(Math.ceil(minHeight) + borderHeight, 320), 2400);
    // Resizing the container shifts subpixel positions, which at fractional
    // zoom nudges the game's rounded content-height report by a pixel and
    // echoes back here — ignore sub-2px changes so the loop can't oscillate.
    setContentMinHeight(current =>
      current !== undefined && Math.abs(next - current) <= 2 ? current : next,
    );
  }, []);

  return (
    <div className="@container/game-viewport w-full">
      <div
        ref={containerRef}
        className="relative mx-auto aspect-2/3 w-full overflow-hidden rounded-none border-0 shadow-none [--game-frame-max-height:9999px] min-[700px]:aspect-video min-[700px]:min-h-140 min-[700px]:rounded-2xl min-[700px]:border min-[700px]:border-black/[0.56] min-[700px]:shadow-[0_1px_0_0_rgba(255,255,255,0.2),0_22px_12.6px_-11px_rgba(0,0,0,0.2)] min-[1400px]:min-h-0 @min-[1024px]:max-h-(--game-frame-max-height) @min-[1024px]:[--game-frame-max-height:calc(200cqw/3)]"
        style={
          contentMinHeight === undefined
            ? gameViewportStyle
            : {
                ...gameViewportStyle,
                minHeight: `min(${contentMinHeight}px, var(--game-frame-max-height))`,
              }
        }
      >
        <GameFrame
          runtime={runtime}
          integration={integration}
          walletStatus={walletStatus}
          onContentSize={handleContentSize}
        />
      </div>
    </div>
  );
}
