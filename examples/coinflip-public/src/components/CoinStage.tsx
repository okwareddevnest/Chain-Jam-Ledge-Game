import type { CoinflipBet, CoinflipOutcome } from '../lib/coinflip';
import coinBadgeHeads from '../assets/coin-badge-heads.webp';
import coinBadgeTails from '../assets/coin-badge-tails.webp';

export type StagePhase = 'idle' | 'flipping' | 'landing' | 'settled';

export type CoinStageProps = {
  phase: StagePhase;
  form: CoinflipBet;
  outcome: CoinflipOutcome | null;
};

const FLIP_STAGGER_S = 0.11;

function gridColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

function coinSize(count: number): number {
  if (count <= 1) return 160;
  if (count <= 4) return 120;
  if (count <= 9) return 96;
  return 84;
}

/**
 * The coin scene: an adaptive grid of CSS-3D coins that bob in idle, tumble
 * while waiting for randomness, and toss-land on the settled face — plus the
 * bet-summary pill, the "Flipping…" status pill, and the settled badge row.
 */
export function CoinStage({ phase, form, outcome }: CoinStageProps) {
  const count = phase === 'idle' ? form.coinCount : (outcome?.coinCount ?? form.coinCount);
  const faces = outcome?.coins ?? null;
  const pickedFace = form.pickHeads ? coinBadgeHeads : coinBadgeTails;

  const summary =
    form.coinCount === 1
      ? `Flip a coin, call ${form.pickHeads ? 'heads' : 'tails'}`
      : `Flip ${form.coinCount} coins, need ${form.minWins} ${form.pickHeads ? 'heads' : 'tails'}`;

  return (
    <div className="cf-canvas">
      <div
        className="cf-coin-grid"
        style={{
          ['--cf-cols' as string]: gridColumns(count),
          ['--cf-coin-size' as string]: `${coinSize(count)}px`,
        }}
        aria-hidden
      >
        {Array.from({ length: count }).map((_, i) => {
          const landedHeads = faces?.[i] === 'heads';
          const matched = faces ? (form.pickHeads ? landedHeads : !landedHeads) : false;
          const classes = ['cf-coin'];
          if (phase === 'flipping') classes.push('cf-coin--spinning');
          if (phase === 'landing' || phase === 'settled') {
            classes.push(landedHeads ? 'cf-coin--lands-heads' : 'cf-coin--lands-tails');
            classes.push(phase === 'landing' ? 'cf-coin--landing' : 'cf-coin--settled');
          }
          if (phase === 'settled') classes.push(matched ? 'cf-coin--match' : 'cf-coin--miss');
          const showPickedFace = phase === 'idle' || phase === 'flipping';
          return (
            <div
              key={i}
              className={classes.join(' ')}
              style={{
                ['--cf-bob-delay' as string]: `${i * 0.4}s`,
                ['--cf-flip-delay' as string]: `${i * FLIP_STAGGER_S}s`,
              }}
            >
              <div className="cf-coin__inner">
                <span
                  className="cf-coin__face"
                  style={{
                    backgroundImage: `url(${showPickedFace ? pickedFace : coinBadgeHeads})`,
                  }}
                />
                <span
                  className="cf-coin__face cf-coin__face--back"
                  style={{ backgroundImage: `url(${coinBadgeTails})` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {phase === 'idle' && <div className="cf-summary">{summary}</div>}

      {phase === 'flipping' && <div className="cf-status">Flipping…</div>}

      {phase === 'settled' && outcome && (
        <div className="cf-result">
          {outcome.won && outcome.coinCount > 1 && (
            <div className="cf-result__detail">
              {outcome.pickedSideWins}/{outcome.coinCount} {outcome.pickHeads ? 'heads' : 'tails'}
            </div>
          )}
          <div className="cf-result__coins" aria-hidden>
            {outcome.coins.map((face, i) => {
              const isHeads = face === 'heads';
              const matched = outcome.pickHeads ? isHeads : !isHeads;
              return (
                <span
                  key={i}
                  className={`cf-coin-badge cf-coin-badge--${matched ? 'match' : 'miss'}`}
                >
                  <span
                    className="cf-coin-badge__coin"
                    style={{ backgroundImage: `url(${isHeads ? coinBadgeHeads : coinBadgeTails})` }}
                  />
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
