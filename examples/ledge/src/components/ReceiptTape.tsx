import type { RoundRecord } from '../lib/useSessionStats';

type ReceiptTapeProps = {
  history: RoundRecord[];
  decimals: number;
};

const pad = (value: string, width: number): string => value.padStart(width, ' ');

/** Five slots, one glyph each: filled where a pile went over, dotted where it held. */
const shape = (round: RoundRecord): string =>
  round.allocation
    .map((coins, lane) => (coins === 0 ? ' ' : round.toppled[lane] ? '#' : '.'))
    .join('');

const amount = (round: RoundRecord, decimals: number): string => {
  if (round.payout === 0n) return '  --  ';
  const whole = round.payout / 10n ** BigInt(decimals);
  return `+${whole}`;
};

/**
 * The machine prints every round onto a tape. It is the session log, but it reads like
 * something the cabinet did rather than a list the page rendered.
 */
export function ReceiptTape({ history, decimals }: ReceiptTapeProps) {
  const rows = [...history].reverse();

  return (
    <section className="tape" aria-labelledby="tape-heading">
      <h2 id="tape-heading" className="tape__heading">
        Ticket roll
      </h2>

      <div className="tape__slot" aria-hidden="true" />

      <div className="tape__paper">
        {rows.length === 0 ? (
          <p className="tape__empty">NO ROUNDS PRINTED</p>
        ) : (
          <ol className="tape__rows">
            {rows.map(round => (
              <li key={round.id} className={round.payout > 0n ? 'is-paid' : undefined}>
                <span className="tape__no">{pad(String(round.id), 3)}</span>
                <span className="tape__shape">{shape(round)}</span>
                <span className="tape__mult">{round.multiplier > 0 ? `${round.multiplier}x` : '—'}</span>
                <span className="tape__amt">{amount(round, decimals)}</span>
              </li>
            ))}
          </ol>
        )}
        <span className="tape__tear" aria-hidden="true" />
      </div>
    </section>
  );
}
