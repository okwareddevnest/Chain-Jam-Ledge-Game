import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeMaxWager } from '@chain/casino-sdk/guest';
import { formatUnits, parseUnits } from 'viem';

import { Board } from './components/Board';
import { Controls } from './components/Controls';
import { LANE_COUNT, N_COINS, PRIZE_MULTIPLIER, maxMultiplierX } from './lib/ledge';
import { isMuted, play, setMuted } from './lib/sound';
import { useCasinoHost } from './lib/useCasinoHost';
import { useLedgeRound } from './lib/useLedgeRound';

const EMPTY_ALLOCATION = [0, 0, 0, 0, 0];

/** Worst-case multiplier, used to clamp the bet before the player has placed any coins. */
const WORST_CASE_MULTIPLIER = PRIZE_MULTIPLIER.reduce((acc, prize) => acc + Number(prize), 0);

const formatAmount = (value: bigint, decimals: number): string => {
  const text = formatUnits(value, decimals);
  const asNumber = Number(text);
  if (!Number.isFinite(asNumber)) return text;
  return asNumber.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

export function App() {
  const { hostApi, snapshot } = useCasinoHost();
  const { round, isDemo, demoBalance, decimals, canBet, stuck, drop, dismiss, recoverStuckBet } =
    useLedgeRound(hostApi, snapshot);

  const [allocation, setAllocation] = useState<number[]>(EMPTY_ALLOCATION);
  const [wagerText, setWagerText] = useState('1');
  const [muted, setMutedState] = useState(isMuted);
  const revealedRef = useRef(0);

  const coinsPlaced = allocation.reduce((acc, coins) => acc + coins, 0);
  const symbol = snapshot?.token.symbol ?? 'chUSD';

  // The host owns the theme; mirror it so the game never fights the surrounding page.
  useEffect(() => {
    const theme = snapshot?.ui.theme;
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
  }, [snapshot?.ui.theme]);

  const wager = useMemo(() => {
    try {
      const trimmed = wagerText.trim();
      if (!trimmed) return 0n;
      return parseUnits(trimmed, decimals);
    } catch {
      return 0n;
    }
  }, [wagerText, decimals]);

  const maxWager = useMemo(() => {
    const multiplier = coinsPlaced > 0 ? maxMultiplierX(allocation) : WORST_CASE_MULTIPLIER;
    const result = computeMaxWager(snapshot, { maxMultiplierX: multiplier });
    return result.kind === 'limit' ? result.maxWager : null;
  }, [snapshot, allocation, coinsPlaced]);

  const balance = isDemo
    ? demoBalance
    : BigInt(snapshot?.balances.smartVaultBalance ?? '0');

  const overBalance = wager > balance;
  const overMax = maxWager !== null && wager > maxWager;
  const allocationReady = coinsPlaced === N_COINS;
  const canDrop = canBet && allocationReady && wager > 0n && !overBalance && !overMax;

  // Sound follows the cascade: each lane lands with its own verdict.
  useEffect(() => {
    if (!round.toppled) {
      revealedRef.current = 0;
      return;
    }
    if (round.revealedLanes <= revealedRef.current) return;

    for (let lane = revealedRef.current; lane < round.revealedLanes; lane += 1) {
      if (round.allocation[lane] === 0) continue;
      play(round.toppled[lane] ? 'topple' : 'hold');
    }
    revealedRef.current = round.revealedLanes;
  }, [round.revealedLanes, round.toppled, round.allocation]);

  useEffect(() => {
    if (round.phase !== 'settled' || round.payout === null || round.wager === 0n) return;
    if (round.payout >= round.wager * 15n) play('jackpot');
  }, [round.phase, round.payout, round.wager]);

  const assign = useCallback(
    (lane: number) => {
      setAllocation(current => {
        const placed = current.reduce((acc, coins) => acc + coins, 0);
        if (placed >= N_COINS) return current;
        play('place');
        return current.map((coins, index) => (index === lane ? coins + 1 : coins));
      });
    },
    [],
  );

  const clear = useCallback(() => {
    play('clear');
    setAllocation(EMPTY_ALLOCATION);
  }, []);

  const stepWager = useCallback(
    (factor: number) => {
      const next = factor >= 1 ? wager * BigInt(factor) : wager / BigInt(1 / factor);
      if (next <= 0n) return;
      setWagerText(formatUnits(next, decimals));
    },
    [wager, decimals],
  );

  const applyMax = useCallback(() => {
    const ceiling = maxWager === null ? balance : maxWager < balance ? maxWager : balance;
    if (ceiling > 0n) setWagerText(formatUnits(ceiling, decimals));
  }, [maxWager, balance, decimals]);

  const handleDrop = useCallback(() => {
    if (!canDrop) return;
    play('release');
    drop(allocation, wager);
  }, [canDrop, drop, allocation, wager]);

  const startNextRound = useCallback(() => {
    dismiss();
    setAllocation(EMPTY_ALLOCATION);
  }, [dismiss]);

  const toggleMute = useCallback(() => {
    setMutedState(current => {
      setMuted(!current);
      return !current;
    });
  }, []);

  // Number keys drop a coin into a lane — faster than aiming at a 60px column.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      const lane = Number(event.key) - 1;
      if (Number.isInteger(lane) && lane >= 0 && lane < LANE_COUNT && canBet) assign(lane);
      if (event.key === 'Backspace') clear();
      if (event.key === 'Enter' && canDrop) handleDrop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [assign, clear, canBet, canDrop, handleDrop]);

  const showingResult = round.phase === 'settled' && round.payout !== null;
  const won = showingResult && round.payout! > 0n;

  const walletStatus = snapshot?.wallet.status;
  const waitingForHost = !isDemo && !hostApi;
  const walletBlocked = !isDemo && hostApi && walletStatus !== 'ready';

  const busyLabel =
    round.phase === 'opening'
      ? 'PLACING BET…'
      : round.phase === 'waiting'
        ? 'WAITING FOR RANDOMNESS…'
        : round.phase === 'revealing'
          ? 'TOPPLING…'
          : null;

  const hint = (() => {
    if (round.phase === 'error') return round.message ?? 'Something went wrong.';
    if (round.message) return round.message;
    if (overBalance) return 'Not enough balance for that bet.';
    if (overMax && maxWager !== null)
      return `Max bet for this spread is ${formatAmount(maxWager, decimals)} ${symbol}.`;
    if (!allocationReady) return `Tap the lanes to place all ${N_COINS} coins. Bigger pile, bigger prize.`;
    return 'Every coin is worth the same — the lane only picks your risk.';
  })();

  return (
    <main className="app">
      <header className="bar">
        <div className="bar__brand">
          <h1 className="bar__title">LEDGE</h1>
          <span className="bar__rtp">96% RTP</span>
        </div>

        <div className="bar__right">
          {isDemo && <span className="badge">DEMO</span>}
          <span className="balance">
            {formatAmount(balance, decimals)} <span>{symbol}</span>
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      {waitingForHost && <p className="notice">Connecting to the casino host…</p>}

      {walletBlocked && (
        <p className="notice">
          {walletStatus === 'disconnected'
            ? 'Connect your wallet in the app above to play for real.'
            : walletStatus === 'setup-required'
              ? 'Finish wallet setup in the app above to play.'
              : 'Your session key needs refreshing before you can bet.'}
        </p>
      )}

      <Board allocation={allocation} round={round} interactive={canBet} onAssign={assign} />

      {showingResult ? (
        <div className="result" data-outcome={won ? 'win' : 'loss'}>
          <div>
            <div className="result__amount">
              {won ? `+${formatAmount(round.payout!, decimals)} ${symbol}` : 'Nothing toppled'}
            </div>
            <div className="result__label">
              {won
                ? `${round.toppled!.filter(Boolean).length} of ${round.allocation.filter(c => c > 0).length} lanes went over`
                : 'The piles held. Try a different spread.'}
            </div>
          </div>
          <button type="button" className="link-button" onClick={startNextRound}>
            Play again
          </button>
        </div>
      ) : (
        <Controls
          coinsPlaced={coinsPlaced}
          wagerText={wagerText}
          symbol={symbol}
          maxWagerText={maxWager === null ? null : formatAmount(maxWager, decimals)}
          canDrop={canDrop}
          busyLabel={busyLabel}
          onWagerChange={setWagerText}
          onWagerStep={stepWager}
          onMax={applyMax}
          onClear={clear}
          onDrop={handleDrop}
        />
      )}

      {stuck && (
        <div className="result">
          <div className="result__label">Randomness is taking longer than usual.</div>
          <button type="button" className="link-button" onClick={recoverStuckBet}>
            Recover bet
          </button>
        </div>
      )}

      <p className={`hint${round.phase === 'error' || overBalance || overMax ? ' hint--error' : ''}`}>
        {hint}
      </p>
    </main>
  );
}
