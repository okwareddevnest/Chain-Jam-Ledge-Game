import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import type { CSSProperties } from 'react';

import { computeMaxWager } from '@chain/casino-sdk/guest';

import { useCasinoHost } from './lib/useCasinoHost';
import {
  PHASE_SETTLED,
  decodeGameState,
  encodeGameData,
  isTerminalPhase,
  maxPayout,
  maxReservedProfit,
  outcomeFromRandomness,
  outcomeFromResult,
  payoutMultiplier,
  type CoinflipBet,
  type CoinflipOutcome,
} from './lib/coinflip';
import { BottomBar } from './components/BottomBar';
import { CanvasHistoryStrip } from './components/CanvasHistoryStrip';
import { CanvasStatsStrip } from './components/CanvasStatsStrip';
import { CoinStage, type StagePhase } from './components/CoinStage';
import { Sidebar } from './components/Sidebar';
import { WinOverlay } from './components/WinOverlay';
import backdrop from './assets/backdrop.webp';
import backdropMobile from './assets/backdrop-mobile.webp';

type Round = {
  sessionKey: string;
  bet: CoinflipBet;
  wager: bigint;
  status: 'opening' | 'waiting' | 'landing' | 'done';
  sessionId?: string;
  outcome?: CoinflipOutcome;
  payout?: bigint;
};

/** Toss animation (1.35s) plus the per-coin stagger before the result shows. */
function landingDurationMs(coinCount: number): number {
  return 1350 + (coinCount - 1) * 110;
}

const FAST_MODE_STORAGE_KEY = 'coinflip.fast-mode';

function loadFastMode(): boolean {
  try {
    return window.localStorage.getItem(FAST_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function App() {
  const { hostApi, snapshot } = useCasinoHost();

  const [form, setForm] = useState<CoinflipBet>({ pickHeads: true, coinCount: 1, minWins: 1 });
  const [wagerInput, setWagerInput] = useState('1.00');
  const [round, setRound] = useState<Round | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [winDismissed, setWinDismissed] = useState(false);
  const [fastMode, setFastModeState] = useState(loadFastMode);

  const setFastMode = useCallback((next: boolean) => {
    setFastModeState(next);
    try {
      window.localStorage.setItem(FAST_MODE_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Storage can be unavailable in sandboxed iframes.
    }
  }, []);

  const decimals = snapshot?.token.decimals ?? 18;
  const symbol = snapshot?.token.symbol ?? '';
  const tokenIconUrl = snapshot?.token.iconUrl;
  const balance = useMemo(() => {
    const raw = snapshot?.balances.smartVaultBalance;
    return raw !== undefined ? BigInt(raw) : undefined;
  }, [snapshot?.balances.smartVaultBalance]);

  // Settle the active round from snapshot pushes: once the host's session list
  // shows our sessionKey as terminal, decode the on-chain gameState and start
  // the landing animation.
  useEffect(() => {
    if (!round || round.status !== 'waiting' || !snapshot) return;
    const row = snapshot.sessions.items.find(item => item.sessionKey === round.sessionKey);
    if (!row || !(row.isSettled || isTerminalPhase(row.phase))) return;

    if (row.phase !== undefined && row.phase !== PHASE_SETTLED && !row.raw.gameState) {
      setError('The round did not settle normally. Your wager handling follows on-chain rules.');
      setRound(null);
      return;
    }

    // Resolve the outcome from the richest source available: the settled
    // gameState, else the raw VRF word, else the payout alone. A settled row
    // must always resolve to faces eventually or the round would never leave
    // the flipping state; only a row still missing its payout keeps waiting.
    const rawRandomness = row.raw.randomness !== undefined ? BigInt(row.raw.randomness) : 0n;
    const outcome =
      (row.raw.gameState ? decodeGameState(row.raw.gameState) : null) ??
      (rawRandomness !== 0n ? outcomeFromRandomness(round.bet, rawRandomness) : null) ??
      (row.payout !== undefined ? outcomeFromResult(round.bet, BigInt(row.payout) > 0n) : null);
    if (!outcome) return; // result not synced yet — wait for the next push

    // A winning row can flip terminal one push before its payout is written, so
    // compute the deterministic win payout locally when the row lags.
    const rowPayout = row.payout !== undefined ? BigInt(row.payout) : 0n;
    setRound(current =>
      current && current.sessionKey === round.sessionKey
        ? {
            ...current,
            status: fastMode ? 'done' : 'landing',
            sessionId: row.sessionId,
            outcome,
            payout:
              rowPayout > 0n
                ? rowPayout
                : outcome.won
                  ? maxPayout(current.wager, outcome.coinCount, outcome.minWins)
                  : 0n,
          }
        : current,
    );
  }, [snapshot, round, fastMode]);

  // Drive landing → done, then reveal the outcome so the host releases the
  // withheld payout into its balance displays (required guest lifecycle step).
  const hostApiRef = useRef(hostApi);
  hostApiRef.current = hostApi;
  useEffect(() => {
    if (!round || !round.outcome) return;
    if (round.status !== 'landing' && round.status !== 'done') return;

    const finish = () => {
      setRound(current =>
        current && current.sessionKey === round.sessionKey && current.status === 'landing'
          ? { ...current, status: 'done' }
          : current,
      );
      if (round.sessionId) {
        void hostApiRef.current?.revealOutcome({ sessionId: round.sessionId }).catch(() => {
          // Reveal is display-only on the host; settlement is already final.
        });
      }
    };

    if (round.status === 'done') {
      if (round.sessionId) {
        void hostApiRef.current?.revealOutcome({ sessionId: round.sessionId }).catch(() => {});
      }
      return;
    }
    const timer = setTimeout(finish, landingDurationMs(round.outcome.coinCount));
    return () => clearTimeout(timer);
  }, [round]);

  const openRound = useCallback(
    async (bet: CoinflipBet, wager: bigint) => {
      if (!hostApi) return;
      setError(null);
      setWinDismissed(false);
      const pendingKey = `pending:${Date.now()}`;
      setRound({ sessionKey: pendingKey, bet, wager, status: 'opening' });
      try {
        const { sessionKey } = await hostApi.openSession({
          wager: wager.toString(),
          gameData: encodeGameData(bet),
        });
        setRound(current =>
          current?.sessionKey === pendingKey
            ? { ...current, sessionKey, status: 'waiting' }
            : current,
        );
      } catch (cause) {
        setRound(null);
        setError(cause instanceof Error ? cause.message : 'Failed to open the round.');
      }
    },
    [hostApi],
  );

  const wager = useMemo(() => {
    if (!wagerInput.trim()) return null;
    try {
      const parsed = parseUnits(wagerInput.trim(), decimals);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  }, [wagerInput, decimals]);

  const maxAllowedReservedProfit = useMemo(() => {
    const raw = snapshot?.casino?.maxAllowedReservedProfit;
    return raw !== undefined ? BigInt(raw) : undefined;
  }, [snapshot?.casino?.maxAllowedReservedProfit]);

  // The largest bet the platform accepts for the current pick, so the UI can
  // clamp instead of letting the transaction get rejected on-chain.
  const platformMaxWager = useMemo(() => {
    const result = computeMaxWager(snapshot, {
      maxMultiplierX: payoutMultiplier(form.coinCount, form.minWins),
    });
    return result.kind === 'limit' ? result.maxWager : undefined;
  }, [snapshot, form.coinCount, form.minWins]);

  if (!hostApi || !snapshot) {
    return (
      <div className="ck-canvas-loading">
        <div className="ck-canvas-loading__card">
          <div className="ck-canvas-loading__spinner" aria-hidden />
          <span className="ck-canvas-loading__label">Connecting to host…</span>
        </div>
      </div>
    );
  }

  const walletStatus = snapshot.wallet.status;
  const walletReady = walletStatus === 'ready';
  const roundInFlight =
    round !== null &&
    (round.status === 'opening' || round.status === 'waiting' || round.status === 'landing');
  const roundDone = round?.status === 'done';

  const insufficientBalance = wager !== null && balance !== undefined && wager > balance;
  const exceedsRiskLimit =
    wager !== null &&
    maxAllowedReservedProfit !== undefined &&
    maxReservedProfit(wager, form.coinCount, form.minWins) > maxAllowedReservedProfit;

  const reason = !walletReady
    ? walletStatus === 'disconnected'
      ? 'Connect your wallet in the host app to play.'
      : walletStatus === 'setup-required'
        ? 'Finish setting up your Smart Vault in the host app to play.'
        : 'Restore your session key in the host app before betting.'
    : error
      ? error
      : insufficientBalance
        ? 'Insufficient balance.'
        : exceedsRiskLimit
          ? platformMaxWager !== undefined
            ? `Potential win exceeds the current house risk limit. Max bet: ${formatUnits(platformMaxWager, decimals)} ${symbol}.`
            : 'Potential win exceeds the current house risk limit.'
          : null;

  const ctaLabel = roundInFlight ? 'Flipping…' : roundDone ? 'Play again' : 'Bet';
  const canBet =
    walletReady && !roundInFlight && wager !== null && !insufficientBalance && !exceedsRiskLimit;

  const handleBet = () => {
    if (wager === null) return;
    void openRound(form, wager);
  };

  const stagePhase: StagePhase =
    round === null || round.status === 'opening'
      ? 'idle'
      : round.status === 'waiting'
        ? 'flipping'
        : round.status === 'landing'
          ? 'landing'
          : 'settled';

  const winVisible = roundDone && round?.outcome?.won === true && !winDismissed;
  const winMultiplier =
    round && round.payout !== undefined && round.wager > 0n
      ? `${(Number((round.payout * 10000n) / round.wager) / 10000).toFixed(2)}x`
      : '0.00x';
  const winNet =
    round && round.payout !== undefined
      ? `+ ${formatUnits(round.payout - round.wager, decimals)} ${symbol}`
      : '';
  const winBetLabel = round
    ? `${round.bet.minWins}/${round.bet.coinCount} ${round.bet.pickHeads ? 'heads' : 'tails'}`
    : '';

  const backdropStyle = {
    ['--backdrop-image' as string]: `url(${backdrop})`,
    ['--backdrop-mobile-image' as string]: `url(${backdropMobile})`,
  } as CSSProperties;

  const availableHeight = snapshot.ui.viewport?.availableHeight;
  const shellStyle = availableHeight
    ? ({ ['--ck-available-height' as string]: `${availableHeight}px` } as CSSProperties)
    : undefined;

  return (
    <div className="ck-shell" style={shellStyle}>
      <div className="ck-shell__main" style={backdropStyle}>
        <div className="ck-shell__backdrop" aria-hidden />
        <div className="ck-shell__sidebar-host">
          <Sidebar
            form={form}
            setForm={setForm}
            wagerInput={wagerInput}
            setWagerInput={setWagerInput}
            balance={balance}
            maxWager={platformMaxWager}
            decimals={decimals}
            symbol={symbol}
            tokenIconUrl={tokenIconUrl}
            fastMode={fastMode}
            setFastMode={setFastMode}
            ctaLabel={ctaLabel}
            ctaDisabled={!canBet}
            reason={reason}
            onBet={handleBet}
          />
        </div>
        <div className="ck-shell__canvas">
          <CanvasHistoryStrip
            sessions={snapshot.sessions.items}
            gameAddress={snapshot.integration.gameAddress}
            hideSessionKey={roundInFlight ? round?.sessionKey : undefined}
          />
          <CoinStage
            phase={stagePhase}
            form={round?.bet ?? form}
            outcome={round?.outcome ?? null}
          />
          <CanvasStatsStrip
            form={form}
            wagerInput={wagerInput}
            decimals={decimals}
            symbol={symbol}
            tokenIconUrl={tokenIconUrl}
          />
          <WinOverlay
            visible={winVisible}
            multiplierText={winMultiplier}
            netText={winNet}
            betLabel={winBetLabel}
            symbol={symbol}
            tokenIconUrl={tokenIconUrl}
            onDismiss={() => setWinDismissed(true)}
          />
        </div>
      </div>
      <BottomBar />
    </div>
  );
}
