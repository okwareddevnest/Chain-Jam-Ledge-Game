import { Logo } from './Logo';

type HudProps = {
  balance: string;
  symbol: string;
  isDemo: boolean;
  network: string | null;
  muted: boolean;
  onToggleMute: () => void;
};

export function Hud({ balance, symbol, isDemo, network, muted, onToggleMute }: HudProps) {
  return (
    <header className="hud">
      <div className="hud__brand">
        <Logo size={24} />
        <h1 className="hud__title">LEDGE</h1>
        <span className="hud__tag">{isDemo ? 'Demo · play money' : (network ?? 'On chain')}</span>
      </div>

      <div className="hud__meters">
        <div className="meter">
          <span className="meter__value">{balance}</span>
          <span className="meter__unit">{symbol}</span>
        </div>

        <button
          type="button"
          className="hud__sound"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
        >
          <span className={`hud__wave${muted ? ' hud__wave--off' : ''}`} aria-hidden="true">
            <i /><i /><i /><i />
          </span>
        </button>
      </div>
    </header>
  );
}
