import { formatAmount, formatPercent } from '../lib/format';
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
          <dd>{stats.rounds}</dd>
        </div>
        <div className="stat">
          <dt>Wagered</dt>
          <dd>
            {formatAmount(stats.wagered, decimals)} <em>{symbol}</em>
          </dd>
        </div>
        <div className="stat">
          <dt>Returned</dt>
          <dd>
            {formatAmount(stats.returned, decimals)} <em>{symbol}</em>
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
