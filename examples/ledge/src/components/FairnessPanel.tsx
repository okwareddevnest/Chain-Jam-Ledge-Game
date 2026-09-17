const EXPLORERS: Record<number, { name: string; base: string }> = {
  8453: { name: 'Base', base: 'https://basescan.org' },
  84532: { name: 'Base Sepolia', base: 'https://sepolia.basescan.org' },
};

const shorten = (address: string): string => `${address.slice(0, 6)}…${address.slice(-4)}`;

type FairnessPanelProps = {
  chainId: number | null;
  gameAddress: string | null;
  isDemo: boolean;
};

/**
 * Where the outcome actually comes from. A casino game that will not say this out loud is
 * asking for trust it has not earned.
 */
export function FairnessPanel({ chainId, gameAddress, isDemo }: FairnessPanelProps) {
  const explorer = chainId === null ? undefined : EXPLORERS[chainId];

  return (
    <section className="panel panel--fair" aria-labelledby="fair-heading">
      <h2 id="fair-heading" className="panel__title">
        Provably fair
      </h2>

      <dl className="fair">
        <div>
          <dt>Return to player</dt>
          <dd>
            96.00%<span className="fair__aside">fixed, every spread</span>
          </dd>
        </div>
        <div>
          <dt>Randomness</dt>
          <dd>
            VRF<span className="fair__aside">rejection sampled, no modulo bias</span>
          </dd>
        </div>
        <div>
          <dt>Settled by</dt>
          <dd>
            {isDemo ? 'This browser' : (explorer?.name ?? 'Chain')}
            <span className="fair__aside">
              {isDemo ? 'demo round, play money' : 'contract decides, the board replays it'}
            </span>
          </dd>
        </div>
      </dl>

      {gameAddress && (
        <p className="fair__contract">
          {explorer ? (
            <a href={`${explorer.base}/address/${gameAddress}`} target="_blank" rel="noopener noreferrer">
              {shorten(gameAddress)}
            </a>
          ) : (
            <span>{shorten(gameAddress)}</span>
          )}
        </p>
      )}

      <p className="panel__note">
        The board replays the settled result. It never guesses it.
      </p>
    </section>
  );
}
