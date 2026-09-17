import { useEffect } from 'react';

import { TokenIcon } from './ui/controls';

/**
 * Win celebration card centered over the canvas: green italic WIN headline,
 * realized multiplier tucked under-right, net payout row, faded bet label.
 * Click anywhere dismisses (the overlay itself never blocks the canvas).
 */
export function WinOverlay({
  visible,
  multiplierText,
  netText,
  betLabel,
  symbol,
  tokenIconUrl,
  onDismiss,
}: {
  visible: boolean;
  multiplierText: string;
  netText: string;
  betLabel: string;
  symbol: string;
  tokenIconUrl?: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!visible) return;
    window.addEventListener('click', onDismiss);
    return () => window.removeEventListener('click', onDismiss);
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <div className="ck-win-overlay" role="status" aria-live="polite">
      <div className="ck-win-overlay__card">
        <div className="ck-win-overlay__info">
          <div className="ck-win-overlay__headline">
            <span className="ck-win-overlay__win">Win</span>
            <span className="ck-win-overlay__mult">{multiplierText}</span>
          </div>
          <div className="ck-win-overlay__payout">
            <span className="ck-win-overlay__amount">{netText}</span>
            <TokenIcon symbol={symbol} iconUrl={tokenIconUrl} size={23} />
          </div>
          <span className="ck-win-overlay__label">{betLabel}</span>
        </div>
      </div>
    </div>
  );
}
