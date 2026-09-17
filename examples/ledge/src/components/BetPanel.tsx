import { N_COINS } from '../lib/ledge';

type BetPanelProps = {
  coinsPlaced: number;
  wagerText: string;
  symbol: string;
  maxWagerText: string | null;
  maxPayoutText: string | null;
  canDrop: boolean;
  busyLabel: string | null;
  onWagerChange: (next: string) => void;
  onWagerStep: (factor: number) => void;
  onMax: () => void;
  onClear: () => void;
  onDrop: () => void;
};

export function BetPanel({
  coinsPlaced,
  wagerText,
  symbol,
  maxWagerText,
  maxPayoutText,
  canDrop,
  busyLabel,
  onWagerChange,
  onWagerStep,
  onMax,
  onClear,
  onDrop,
}: BetPanelProps) {
  const remaining = N_COINS - coinsPlaced;

  return (
    <section className="panel panel--bet" aria-labelledby="bet-heading">
      <h2 id="bet-heading" className="panel__title">
        Your bet
      </h2>

      <div className="tray" aria-label={`${remaining} of ${N_COINS} coins left to place`}>
        {Array.from({ length: N_COINS }, (_, index) => (
          <span
            key={index}
            className={`tray__coin${index < remaining ? '' : ' tray__coin--spent'}`}
            aria-hidden="true"
          />
        ))}
        <button type="button" className="tray__clear" onClick={onClear} disabled={coinsPlaced === 0}>
          Clear
        </button>
      </div>

      <label className="field" htmlFor="wager">
        <span className="field__label">Stake</span>
        <span className="field__control">
          <input
            id="wager"
            className="field__input"
            inputMode="decimal"
            value={wagerText}
            onChange={event => onWagerChange(event.target.value)}
          />
          <span className="field__unit">{symbol}</span>
        </span>
      </label>

      <div className="chips">
        <button type="button" onClick={() => onWagerStep(0.5)}>
          Half
        </button>
        <button type="button" onClick={() => onWagerStep(2)}>
          Double
        </button>
        <button type="button" onClick={onMax} disabled={!maxWagerText}>
          Max
        </button>
      </div>

      <div className="topline">
        <span className="topline__label">Most this can pay</span>
        <span className="topline__value">{maxPayoutText ?? '—'}</span>
      </div>

      <button type="button" className="drop" onClick={onDrop} disabled={!canDrop}>
        <span className="drop__label">{busyLabel ?? 'Drop the coins'}</span>
        {busyLabel && <span className="drop__pulse" aria-hidden="true" />}
      </button>
    </section>
  );
}
