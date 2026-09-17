import { useMemo } from 'react';
import { formatUnits, parseUnits } from 'viem';

import { maxPayout, payoutMultiplier, winProbability, type CoinflipBet } from '../lib/coinflip';
import { TokenIcon } from './ui/controls';

/**
 * Bottom-of-canvas readout: Profit on Win (with the multiplier sub-label) and
 * Win Chance, each in the recessed value-pill recipe.
 */
export function CanvasStatsStrip({
  form,
  wagerInput,
  decimals,
  symbol,
  tokenIconUrl,
}: {
  form: CoinflipBet;
  wagerInput: string;
  decimals: number;
  symbol: string;
  tokenIconUrl?: string;
}) {
  const stats = useMemo(() => {
    const multiplier = payoutMultiplier(form.coinCount, form.minWins).toFixed(2);
    const winChance = (winProbability(form.coinCount, form.minWins) * 100).toFixed(2);
    try {
      const wager = parseUnits(wagerInput || '0', decimals);
      if (wager === 0n) return { multiplier, winChance, profitOnWin: '0.00' };
      const payout = maxPayout(wager, form.coinCount, form.minWins);
      const profit = payout > wager ? payout - wager : 0n;
      const profitNumber = Number(formatUnits(profit, decimals));
      const profitOnWin =
        profitNumber >= 1000
          ? profitNumber.toLocaleString('en', { maximumFractionDigits: 2 })
          : profitNumber.toFixed(2);
      return { multiplier, winChance, profitOnWin };
    } catch {
      return { multiplier, winChance, profitOnWin: '0.00' };
    }
  }, [form, wagerInput, decimals]);

  return (
    <div className="ck-canvas-stats">
      <div className="ck-canvas-stats__col">
        <div className="ck-canvas-stats__label">
          <span className="ck-canvas-stats__label-main">Profit on Win</span>
          <span className="ck-canvas-stats__label-sub">{`(${stats.multiplier}x)`}</span>
        </div>
        <div className="ck-canvas-stats__value" role="status" aria-label="Profit on win">
          <span className="ck-canvas-stats__value-inner">
            <span className="ck-canvas-stats__value-text">{stats.profitOnWin}</span>
            <TokenIcon symbol={symbol} iconUrl={tokenIconUrl} size={23} />
          </span>
        </div>
      </div>
      <div className="ck-canvas-stats__col">
        <div className="ck-canvas-stats__label">
          <span className="ck-canvas-stats__label-main">Win Chance</span>
        </div>
        <div className="ck-canvas-stats__value" role="status" aria-label="Win chance">
          <span className="ck-canvas-stats__value-inner">
            <span className="ck-canvas-stats__value-text">{stats.winChance}</span>
            <span className="ck-canvas-stats__value-suffix" aria-hidden>
              %
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
