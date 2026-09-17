import { formatAmount, formatPercent } from '../lib/format';
import { Odometer } from './Odometer';
import type { SessionStats } from '../lib/useSessionStats';

type SessionPanelProps = {
  stats: SessionStats;
  observedReturn: number | null;
  decimals: number;
  symbol: string;
};

export function SessionPanel({ stats, observedReturn, decimals, symbol }: SessionPanelProps) {
  return (
    <section className="panel panel--session" aria-labelledby="session-heading">
      <h2 id="session-heading" className="panel__title">
        This session
      </h2>

      <dl className="stats">
        <div className="stat">
          <dt>Rounds</dt>
          <dd>
            <Odometer value={String(stats.rounds)} size="sm" label="Rounds" />
          </dd>
        </div>
        <div className="stat">
          <dt>Staked</dt>
          <dd>
            <Odometer value={formatAmount(stats.wagered, decimals)} size="sm" label="Wagered" />
            <em>{symbol}</em>
          </dd>
        </div>
        <div className="stat">
          <dt>Returned</dt>
          <dd>
            <Odometer value={formatAmount(stats.returned, decimals)} size="sm" label="Returned" />
            <em>{symbol}</em>
          </dd>
        </div>
        <div className="stat">
          <dt>Your return</dt>
          <dd>{observedReturn === null ? '—' : formatPercent(observedReturn)}</dd>
        </div>
      </dl>

      <div className="session__rail">
        <div className="session__best">
          <span className="session__best-label">Best hit</span>
          <span className="session__best-value">
            {stats.bestMultiplier > 0 ? `${stats.bestMultiplier}x` : '—'}
          </span>
        </div>

        <div className="session__streak" aria-label={`${stats.streak} round winning streak`}>
          {Array.from({ length: 5 }, (_, index) => (
            <span
              key={index}
              className={`pip${index < Math.min(stats.streak, 5) ? ' pip--lit' : ''}`}
              aria-hidden="true"
            />
          ))}
          <span className="session__streak-label">streak</span>
        </div>
      </div>

      <p className="panel__note">
        Long-run return is fixed at 96%. Yours will wander either side of it.
      </p>
    </section>
  );
}
