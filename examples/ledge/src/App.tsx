import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeMaxWager } from '@chain/casino-sdk/guest';
import { formatUnits, parseUnits } from 'viem';

import { Board } from './components/Board';
import { BetPanel } from './components/BetPanel';
import { HistoryStrip } from './components/HistoryStrip';
import { Hud } from './components/Hud';
import { LastRound } from './components/LastRound';
import { Paytable } from './components/Paytable';
import { SessionPanel } from './components/SessionPanel';
import { formatAmount } from './lib/format';
import { LANE_COUNT, N_COINS, PRIZE_MULTIPLIER, maxMultiplierX, maxPayout } from './lib/ledge';
import { isMuted, play, setMuted } from './lib/sound';
import { useCasinoHost } from './lib/useCasinoHost';
import { useLedgeRound } from './lib/useLedgeRound';
import { useSessionStats } from './lib/useSessionStats';

const EMPTY_ALLOCATION = [0, 0, 0, 0, 0];

/** Worst-case multiplier, used to clamp the stake before any coin is placed. */
const WORST_CASE_MULTIPLIER = PRIZE_MULTIPLIER.reduce((acc, prize) => acc + Number(prize), 0);

const NETWORKS: Record<number, string> = {
  8453: 'Base',
  84532: 'Base Sepolia',
  31337: 'Local chain',
};

export function App() {
  const { hostApi, snapshot } = useCasinoHost();
  const { round, isDemo, demoBalance, decimals, canBet, stuck, drop, dismiss, recoverStuckBet } =
    useLedgeRound(hostApi, snapshot);
  const { stats, observedReturn, record } = useSessionStats();

  const [allocation, setAllocation] = useState<number[]>(EMPTY_ALLOCATION);
  const [wagerText, setWagerText] = useState('1');
  const [muted, setMutedState] = useState(isMuted);
  const revealedRef = useRef(0);
  const previousPhaseRef = useRef(round.phase);

  const coinsPlaced = allocation.reduce((acc, coins) => acc + coins, 0);
  const symbol = snapshot?.token.symbol ?? 'chUSD';
  const network = snapshot ? (NETWORKS[snapshot.integration.chainId] ?? null) : null;

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

  const balance = isDemo ? demoBalance : BigInt(snapshot?.balances.smartVaultBalance ?? '0');

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

  // Record the round once, on the transition into `settled`.
  useEffect(() => {
    const settledNow = previousPhaseRef.current !== 'settled' && round.phase === 'settled';
    previousPhaseRef.current = round.phase;

    if (!settledNow || round.payout === null || round.toppled === null) return;

    record({
      allocation: round.allocation,
      toppled: round.toppled,
      wager: round.wager,
      payout: round.payout,
    });

    if (round.payout >= round.wager * 15n && round.wager > 0n) play('jackpot');
  }, [round.phase, round.payout, round.toppled, round.allocation, round.wager, record]);

  const assign = useCallback((lane: number) => {
    setAllocation(current => {
      const placed = current.reduce((acc, coins) => acc + coins, 0);
      if (placed >= N_COINS) return current;
      play('place');
      return current.map((coins, index) => (index === lane ? coins + 1 : coins));
    });
  }, []);

  const unassign = useCallback((lane: number) => {
    setAllocation(current => {
      if (current[lane] === 0) return current;
      play('clear');
      return current.map((coins, index) => (index === lane ? coins - 1 : coins));
    });
  }, []);

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

  // Number keys load a pile — faster than aiming at a column.
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

  const walletStatus = snapshot?.wallet.status;
  const waitingForHost = !isDemo && !hostApi;
  const walletBlocked = !isDemo && Boolean(hostApi) && walletStatus !== 'ready';

  const busyLabel =
    round.phase === 'opening'
      ? 'Placing the bet'
      : round.phase === 'waiting'
        ? 'Waiting for randomness'
        : round.phase === 'revealing'
          ? 'Toppling'
          : null;

  const notice = (() => {
    if (round.phase === 'error') return round.message ?? 'That did not go through.';
    if (round.message) return round.message;
    if (waitingForHost) return 'Connecting to the casino.';
    if (walletBlocked) {
      if (walletStatus === 'disconnected') return 'Connect your wallet in the app above to play.';
      if (walletStatus === 'setup-required') return 'Finish wallet setup in the app above to play.';
      return 'Your session key needs refreshing before you can bet.';
    }
    if (overBalance) return 'That stake is more than your balance.';
    if (overMax && maxWager !== null) {
      return `Most you can stake on this spread is ${formatAmount(maxWager, decimals)} ${symbol}.`;
    }
    if (!allocationReady) {
      const left = N_COINS - coinsPlaced;
      return `Load ${left} more ${left === 1 ? 'coin' : 'coins'} onto the piles. Click a pile to add, right-click to take one back.`;
    }
    return null;
  })();

  const noticeIsProblem =
    round.phase === 'error' || overBalance || overMax || walletBlocked || waitingForHost;

  const maxPayoutText = allocationReady && wager > 0n
    ? `${formatAmount(maxPayout(wager, allocation), decimals)} ${symbol}`
    : null;

  return (
    <div className="shell">
      <Hud
        balance={formatAmount(balance, decimals)}
        symbol={symbol}
        isDemo={isDemo}
        network={network}
        muted={muted}
        onToggleMute={toggleMute}
      />

      <div className="layout">
        <aside className="layout__left">
          <SessionPanel
            stats={stats}
            observedReturn={observedReturn}
            decimals={decimals}
            symbol={symbol}
          />
          <Paytable allocation={round.toppled ? round.allocation : allocation} />
        </aside>

        <main className="layout__stage">
          <Board
            allocation={allocation}
            round={round}
            interactive={canBet}
            onAssign={assign}
            onUnassign={unassign}
          />

          {notice && (
            <p className={`notice${noticeIsProblem ? ' notice--problem' : ''}`} role="status">
              {notice}
            </p>
          )}

          {stuck && (
            <div className="recover" role="alert">
              <span>Randomness is taking longer than usual.</span>
              <button type="button" onClick={recoverStuckBet}>
                Recover the bet
              </button>
            </div>
          )}
        </main>

        <aside className="layout__right">
          <BetPanel
            coinsPlaced={coinsPlaced}
            wagerText={wagerText}
            symbol={symbol}
            maxWagerText={maxWager === null ? null : formatAmount(maxWager, decimals)}
            maxPayoutText={maxPayoutText}
            canDrop={canDrop}
            busyLabel={busyLabel}
            onWagerChange={setWagerText}
            onWagerStep={stepWager}
            onMax={applyMax}
            onClear={clear}
            onDrop={handleDrop}
          />
          <LastRound
            round={stats.history.at(-1) ?? null}
            decimals={decimals}
            symbol={symbol}
            onPlayAgain={startNextRound}
            live={round.phase === 'settled' || round.phase === 'error'}
          />
        </aside>
      </div>

      <HistoryStrip history={stats.history} />
    </div>
  );
}
