import { Logo } from './Logo';
import { Odometer } from './Odometer';

const BULBS = 6;

type MarqueeProps = {
  balance: string;
  symbol: string;
  network: string | null;
  isDemo: boolean;
  live: boolean;
  muted: boolean;
  onToggleMute: () => void;
};

/**
 * The sign above the cabinet, with the credit window bolted to it. Bulbs chase while a
 * round resolves and idle otherwise, so the machine reads as running even at rest.
 */
export function Marquee({
  balance,
  symbol,
  network,
  isDemo,
  live,
  muted,
  onToggleMute,
}: MarqueeProps) {
  return (
    <header className={`marquee${live ? ' marquee--running' : ''}`}>
      <div className="credit">
        <span className="credit__label">Credit</span>
        <Odometer value={balance} tone="brass" size="md" label="Credit" />
        <span className="credit__unit">{symbol}</span>
      </div>

      <span className="marquee__bulbs" aria-hidden="true">
        {Array.from({ length: BULBS }, (_, index) => (
          <i key={index} style={{ '--bulb': index } as React.CSSProperties} />
        ))}
      </span>

      <span className="marquee__plate">
        <Logo size={26} />
        <h1 className="marquee__title">LEDGE</h1>
      </span>

      <span className="marquee__bulbs" aria-hidden="true">
        {Array.from({ length: BULBS }, (_, index) => (
          <i key={index} style={{ '--bulb': BULBS - index } as React.CSSProperties} />
        ))}
      </span>

      <div className="marquee__right">
        <button
          type="button"
          className="marquee__sound"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
        >
          <span className={`wave${muted ? ' wave--off' : ''}`} aria-hidden="true">
            <i /><i /><i /><i />
          </span>
        </button>

        <span className={`marquee__tag${isDemo ? ' marquee__tag--demo' : ''}`}>
          {isDemo ? 'Free play' : (network ?? 'On chain')}
        </span>
      </div>
    </header>
  );
}
