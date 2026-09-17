import { LANE_COUNT, PRIZE_MULTIPLIER, toppleProbability } from '../lib/ledge';

type PaytableProps = {
  allocation: number[];
};

export function Paytable({ allocation }: PaytableProps) {
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
    </section>
  );
}
