import {
  LANE_COUNT,
  PRIZE_MULTIPLIER,
  anyWinProbability,
  toppleProbability,
  volatilityOf,
} from '../lib/ledge';

type PaytableProps = {
  allocation: number[];
};

export function Paytable({ allocation }: PaytableProps) {
  const loaded = allocation.some(coins => coins > 0);
  const anyWin = anyWinProbability(allocation);
  const volatility = volatilityOf(allocation);

  return (
    <section className="panel panel--paytable" aria-labelledby="paytable-heading">
      <h2 id="paytable-heading" className="panel__title">
        Odds
      </h2>

      <table className="paytable">
        <thead>
          <tr>
            <th scope="col">Pile</th>
            <th scope="col">Coins</th>
            <th scope="col">Chance</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: LANE_COUNT }, (_, lane) => {
            const coins = allocation[lane] ?? 0;
            const chance = coins > 0 ? toppleProbability(lane, coins) : 0;

            return (
              <tr key={lane} className={coins > 0 ? 'is-active' : undefined}>
                <th scope="row">{Number(PRIZE_MULTIPLIER[lane])}x</th>
                <td>{coins > 0 ? coins : '·'}</td>
                <td>
                  <span className="paytable__bar" aria-hidden="true">
                    <span style={{ width: `${Math.min(chance * 100, 100)}%` }} />
                  </span>
                  <span className="paytable__figure">
                    {coins > 0 ? `${(chance * 100).toFixed(1)}%` : '—'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <dl className="risk">
        <div>
          <dt>Any win</dt>
          <dd>{loaded ? `${(anyWin * 100).toFixed(1)}%` : '—'}</dd>
        </div>
        <div>
          <dt>Swing</dt>
          <dd>
            <span className="risk__meter" aria-hidden="true">
              {Array.from({ length: 5 }, (_, index) => (
                <span key={index} className={index < Math.round(volatility * 5) ? 'is-lit' : undefined} />
              ))}
            </span>
            <span className="risk__word">
              {!loaded ? '—' : volatility > 0.66 ? 'wild' : volatility > 0.33 ? 'lively' : 'steady'}
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
