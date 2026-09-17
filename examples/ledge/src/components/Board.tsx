import { LANE_COUNT, PRIZE_MULTIPLIER, toppleProbability } from '../lib/ledge';
import type { ActiveRound } from '../lib/useLedgeRound';

/** How many coins are drawn in each lane's pile — richer lanes simply look richer. */
const PILE_DEPTH = [2, 3, 5, 8, 12];

export type LaneState = 'idle' | 'deciding' | 'toppled' | 'held';

export const laneStateFor = (round: ActiveRound, lane: number): LaneState => {
  if (!round.toppled) return 'idle';
  // A lane the player never used has no verdict — showing "HELD" there would imply
  // they bet on it and lost.
  if (round.allocation[lane] === 0) return 'idle';
  if (round.revealedLanes > lane) return round.toppled[lane] ? 'toppled' : 'held';
  if (round.revealedLanes === lane) return 'deciding';
  return 'idle';
};

type BoardProps = {
  allocation: number[];
  round: ActiveRound;
  interactive: boolean;
  onAssign: (lane: number) => void;
};

export function Board({ allocation, round, interactive, onAssign }: BoardProps) {
  const showingOutcome = round.toppled !== null;
  const lanes = showingOutcome ? round.allocation : allocation;

  return (
    <div className="board">
      <div className="board__lanes">
        {Array.from({ length: LANE_COUNT }, (_, lane) => {
          const coins = lanes[lane] ?? 0;
          const state = laneStateFor(round, lane);
          const prize = Number(PRIZE_MULTIPLIER[lane]);

          return (
            <button
              key={lane}
              type="button"
              className={`lane${state === 'idle' ? '' : ` lane--${state}`}`}
              disabled={!interactive}
              onClick={() => onAssign(lane)}
              aria-label={
                `Lane ${lane + 1}, pays ${prize} times your bet. ` +
                `${coins} of your coins assigned` +
                (coins > 0 ? `, ${(toppleProbability(lane, coins) * 100).toFixed(2)} percent to topple.` : '.')
              }
            >
              <span className="lane__prize">{prize}x</span>

              <span className="lane__odds">
                {coins > 0 ? `${(toppleProbability(lane, coins) * 100).toFixed(1)}%` : ''}
              </span>

              <span className="lane__pile" aria-hidden="true">
                {Array.from({ length: PILE_DEPTH[lane] }, (_, index) => (
                  <span key={index} className="coin" />
                ))}
              </span>

              <span
                className="lane__verdict"
                data-result={state === 'toppled' ? 'toppled' : state === 'held' ? 'held' : undefined}
              >
                {state === 'toppled' ? 'TOPPLED' : state === 'held' ? 'HELD' : ''}
              </span>
            </button>
          );
        })}
      </div>

      <div className="board__ledge" aria-hidden="true" />

      <div className="board__slots">
        {Array.from({ length: LANE_COUNT }, (_, lane) => (
          <span key={lane} className="lane__slot" aria-hidden="true">
            {Array.from({ length: lanes[lane] ?? 0 }, (_, index) => (
              <span key={index} className="slot-coin" />
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
