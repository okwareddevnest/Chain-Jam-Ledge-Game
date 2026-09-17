import { LANE_COUNT, PRIZE_MULTIPLIER, toppleProbability } from '../lib/ledge';
import type { ActiveRound } from '../lib/useLedgeRound';

/** Coins drawn in each pile — a richer lane simply looks richer. */
const PILE_DEPTH = [3, 5, 8, 13, 20];

/** Nudges so a stack reads as hand-stacked metal, not a CSS gradient. */
const LEAN = [0, 2, -2, 1, -1, 2, 0, -2, 1, -1, 2, -1, 0, 1, -2, 2, -1, 0, 1, -1];

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
  onUnassign: (lane: number) => void;
};

export function Board({ allocation, round, interactive, onAssign, onUnassign }: BoardProps) {
  const showingOutcome = round.toppled !== null;
  const lanes = showingOutcome ? round.allocation : allocation;

  return (
    <div className={`board${showingOutcome ? ' board--revealing' : ''}`}>
      {/* Above the beam: the prize, and the pile you are trying to shift. */}
      <div className="board__piles">
        {Array.from({ length: LANE_COUNT }, (_, lane) => {
          const coins = lanes[lane] ?? 0;
          const state = laneStateFor(round, lane);
          const prize = Number(PRIZE_MULTIPLIER[lane]);
          const chance = coins > 0 ? toppleProbability(lane, coins) : 0;

          return (
            <div key={lane} className={`lane lane--${state}`}>
              <div className="lane__readout">
                <span className="lane__prize">{prize}x</span>
                {/* Before the drop this is the odds; after it, the verdict. Same slot, so
                    nothing is printed over the coins. */}
                {state === 'toppled' || state === 'held' ? (
                  <span className="lane__verdict" data-state={state}>
                    {state === 'toppled' ? 'Over' : 'Held'}
                  </span>
                ) : (
                  <span className="lane__chance">{coins > 0 ? `${(chance * 100).toFixed(1)}%` : ''}</span>
                )}
              </div>

              <div className="lane__stage">
                <div
                  className="lane__pile"
                  aria-hidden="true"
                  style={{ '--stack': PILE_DEPTH[lane] } as React.CSSProperties}
                >
                  {Array.from({ length: PILE_DEPTH[lane] }, (_, index) => (
                    <span
                      key={index}
                      className="disc"
                      style={{
                        '--i': index,
                        '--lean': `${LEAN[index % LEAN.length]}px`,
                        '--spin': `${(index * 37) % 360}deg`,
                        '--fall-delay': `${(PILE_DEPTH[lane] - index) * 22}ms`,
                      } as React.CSSProperties}
                    />
                  ))}
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* The beam itself. Everything above rests on it; everything below is yours. */}
      <div className="board__beam" aria-hidden="true" />

      {/* Below the beam: the coins you are about to push with. */}
      <div className="board__slots">
        {Array.from({ length: LANE_COUNT }, (_, lane) => {
          const coins = lanes[lane] ?? 0;
          const prize = Number(PRIZE_MULTIPLIER[lane]);
          const chance = coins > 0 ? toppleProbability(lane, coins) : 0;

          return (
            <button
              key={lane}
              type="button"
              className={`slot${coins > 0 ? ' slot--loaded' : ''}`}
              disabled={!interactive}
              onClick={() => onAssign(lane)}
              onContextMenu={event => {
                event.preventDefault();
                onUnassign(lane);
              }}
              aria-label={
                `Pile ${lane + 1}, pays ${prize} times your stake. ` +
                `${coins} of your coins loaded` +
                (coins > 0 ? `, ${(chance * 100).toFixed(2)} percent to topple.` : '.')
              }
            >
              <span className="slot__coins">
                {coins > 0
                  ? Array.from({ length: coins }, (_, index) => (
                      <span key={index} className="load-coin" aria-hidden="true" />
                    ))
                  : <span className="slot__ghost" aria-hidden="true" />}
              </span>
              <span className="slot__hint">{coins > 0 ? `${coins}` : 'load'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
