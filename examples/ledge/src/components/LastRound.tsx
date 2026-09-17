import { PRIZE_MULTIPLIER } from '../lib/ledge';
import type { RoundRecord } from '../lib/useSessionStats';
import { formatAmount } from '../lib/format';

type LastRoundProps = {
  round: RoundRecord | null;
  decimals: number;
  symbol: string;
  onPlayAgain: () => void;
  live: boolean;
};

export function LastRound({ round, decimals, symbol, onPlayAgain, live }: LastRoundProps) {
  if (!round) {
    return (
      <section className="panel panel--result panel--empty" aria-labelledby="result-heading">
        <h2 id="result-heading" className="panel__title">
          Last round
        </h2>
        <p className="panel__note">Nothing dropped yet. Load the lanes and let go.</p>
      </section>
    );
  }

  const won = round.payout > 0n;
  const toppledLanes = round.toppled.filter(Boolean).length;
  const usedLanes = round.allocation.filter(coins => coins > 0).length;

  return (
    <section
      className={`panel panel--result${won ? ' panel--won' : ''}`}
      aria-labelledby="result-heading"
      aria-live="polite"
    >
      <h2 id="result-heading" className="panel__title">
        Last round
      </h2>

      <p className="result__amount">
        {won ? `+${formatAmount(round.payout, decimals)}` : 'Nothing fell'}
        {won && <em>{symbol}</em>}
      </p>

      <p className="result__detail">
        {won
          ? `${toppledLanes} of ${usedLanes} ${usedLanes === 1 ? 'pile' : 'piles'} went over`
          : 'Every pile held. Try loading them differently.'}
      </p>

      <ul className="result__lanes">
        {round.allocation.map((coins, lane) =>
          coins > 0 ? (
            <li key={lane} className={round.toppled[lane] ? 'is-over' : 'is-held'}>
              <span>{Number(PRIZE_MULTIPLIER[lane])}x</span>
              <small>{round.toppled[lane] ? 'over' : 'held'}</small>
            </li>
          ) : null,
        )}
      </ul>

      <button type="button" className="again" onClick={onPlayAgain} disabled={!live}>
        Set up the next drop
      </button>
    </section>
  );
}
