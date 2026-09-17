import { N_COINS } from '../lib/ledge';

type ControlsProps = {
  coinsPlaced: number;
  wagerText: string;
  symbol: string;
  maxWagerText: string | null;
  canDrop: boolean;
  busyLabel: string | null;
  onWagerChange: (next: string) => void;
  onWagerStep: (factor: number) => void;
  onMax: () => void;
  onClear: () => void;
  onDrop: () => void;
};

export function Controls({
  coinsPlaced,
  wagerText,
  symbol,
  maxWagerText,
  canDrop,
  busyLabel,
  onWagerChange,
  onWagerStep,
  onMax,
  onClear,
  onDrop,
}: ControlsProps) {
  const remaining = N_COINS - coinsPlaced;

  return (
    <div className="controls">
      <div className="tray">
        <span className="tray__label">
          {remaining > 0 ? `${remaining} coin${remaining === 1 ? '' : 's'} left` : 'All coins placed'}
        </span>

        <span className="tray__coins" aria-hidden="true">
          {Array.from({ length: N_COINS }, (_, index) => (
            <span
              key={index}
              className={`slot-coin${index < remaining ? '' : ' slot-coin--empty'}`}
            />
          ))}
        </span>

        <button type="button" className="link-button" onClick={onClear} disabled={coinsPlaced === 0}>
          Clear
        </button>
      </div>

      <div className="wager">
        <label className="wager__label" htmlFor="wager">
          Bet ({symbol})
        </label>
        <button type="button" className="wager__step" onClick={() => onWagerStep(0.5)} aria-label="Halve bet">
          &frac12;
        </button>
        <input
          id="wager"
          className="wager__input"
          inputMode="decimal"
          value={wagerText}
          onChange={event => onWagerChange(event.target.value)}
        />
        <button type="button" className="wager__step" onClick={() => onWagerStep(2)} aria-label="Double bet">
          2x
        </button>
        <button type="button" className="wager__step" onClick={onMax} disabled={!maxWagerText}>
          Max
        </button>
      </div>

      <button type="button" className="drop" onClick={onDrop} disabled={!canDrop}>
        {busyLabel ?? 'DROP'}
      </button>
    </div>
  );
}
