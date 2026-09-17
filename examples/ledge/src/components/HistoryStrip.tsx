import type { RoundRecord } from '../lib/useSessionStats';

type HistoryStripProps = {
  history: RoundRecord[];
};

export function HistoryStrip({ history }: HistoryStripProps) {
  return (
    <section className="history" aria-labelledby="history-heading">
      <h2 id="history-heading" className="history__title">
        Recent drops
      </h2>

      {history.length === 0 ? (
        <p className="history__empty">Your rounds will line up here as you play.</p>
      ) : (
        <ol className="history__list">
          {history.map(round => (
            <li
              key={round.id}
              className={`chip${round.payout > 0n ? ' chip--won' : ''}`}
              title={`Round ${round.id}: ${round.multiplier}x`}
            >
              {round.payout > 0n ? `${round.multiplier}x` : '·'}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
