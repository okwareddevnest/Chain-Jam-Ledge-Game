import { PRESETS, type Preset } from '../lib/ledge';

type SpreadPresetsProps = {
  allocation: number[];
  disabled: boolean;
  onPick: (preset: Preset) => void;
};

const sameSpread = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((coins, index) => coins === b[index]);

/**
 * One-tap spreads, sitting inside the bet because that is what they are. Each button
 * draws the shape of its own allocation, so the trade-off is legible before you press it.
 */
export function SpreadPresets({ allocation, disabled, onPick }: SpreadPresetsProps) {
  return (
    <div className="presets" role="group" aria-label="Quick spreads">
      {PRESETS.map(preset => {
        const active = sameSpread(allocation, preset.allocation);

        return (
          <button
            key={preset.id}
            type="button"
            className={`preset${active ? ' preset--active' : ''}`}
            disabled={disabled}
            onClick={() => onPick(preset)}
            aria-pressed={active}
            title={preset.hint}
          >
            <span className="preset__shape" aria-hidden="true">
              {preset.allocation.map((coins, lane) => (
                <span key={lane} className="preset__bar" style={{ '--fill': coins / 5 } as React.CSSProperties} />
              ))}
            </span>
            <span className="preset__label">{preset.label}</span>
          </button>
        );
      })}
    </div>
  );
}
