import { decodeAbiParameters, encodeAbiParameters } from 'viem';
import type { HexString } from '@chain/casino-sdk';

// Mirrors CoinflipGame.sol — client-side numbers are previews only, the
// contract stays authoritative for payouts.
export const BASIS_POINTS = 10_000n;
export const RTP_BPS = 9_800n;
export const MAX_COIN_COUNT = 10;

export type CoinSide = 'heads' | 'tails';

export type CoinflipBet = {
  pickHeads: boolean;
  coinCount: number;
  minWins: number;
};

const GAME_DATA_PARAMS = [{ type: 'bool' }, { type: 'uint8' }, { type: 'uint8' }] as const;

// abi.encode(CoinflipState) — static struct, encoded as its flattened fields.
const GAME_STATE_PARAMS = [
  { type: 'bool' },
  { type: 'uint8' },
  { type: 'uint8' },
  { type: 'bytes32' },
] as const;

export function encodeGameData(bet: CoinflipBet): HexString {
  return encodeAbiParameters(GAME_DATA_PARAMS, [bet.pickHeads, bet.coinCount, bet.minWins]);
}

export function decodeGameData(gameData: HexString): CoinflipBet | null {
  try {
    const [pickHeads, coinCount, minWins] = decodeAbiParameters(GAME_DATA_PARAMS, gameData);
    return { pickHeads, coinCount, minWins };
  } catch {
    return null;
  }
}

export type CoinflipOutcome = CoinflipBet & {
  randomness: bigint;
  /** Landed side per coin, index-aligned with randomness bit i. */
  coins: CoinSide[];
  pickedSideWins: number;
  won: boolean;
};

/** Per-coin faces from the VRF word: coin i is heads iff bit i is set —
 *  the mirror of `CoinflipGame._countHeads`. */
export function outcomeFromRandomness(bet: CoinflipBet, randomness: bigint): CoinflipOutcome {
  const coins: CoinSide[] = [];
  let headsCount = 0;
  for (let i = 0; i < bet.coinCount; i++) {
    const isHeads = ((randomness >> BigInt(i)) & 1n) === 1n;
    coins.push(isHeads ? 'heads' : 'tails');
    if (isHeads) headsCount++;
  }
  const pickedSideWins = bet.pickHeads ? headsCount : bet.coinCount - headsCount;
  return {
    ...bet,
    randomness,
    coins,
    pickedSideWins,
    won: pickedSideWins >= bet.minWins,
  };
}

export function decodeGameState(gameState: HexString): CoinflipOutcome | null {
  try {
    const [pickHeads, coinCount, minWins, providerRandomness] = decodeAbiParameters(
      GAME_STATE_PARAMS,
      gameState,
    );
    const randomness = BigInt(providerRandomness);
    if (randomness === 0n) return null; // randomness not delivered yet
    return outcomeFromRandomness({ pickHeads, coinCount, minWins }, randomness);
  } catch {
    return null;
  }
}

/**
 * Last-resort faces when a settled row carries neither a decodable gameState
 * nor the raw VRF word: a win shows exactly `minWins` hits of the picked side,
 * a loss one short. Without this fallback the round could never leave the
 * flipping state (mirrors the production coinflip's settle fallback).
 */
export function outcomeFromResult(bet: CoinflipBet, won: boolean): CoinflipOutcome {
  const hits = won ? bet.minWins : Math.max(0, bet.minWins - 1);
  const pickedSide: CoinSide = bet.pickHeads ? 'heads' : 'tails';
  const otherSide: CoinSide = bet.pickHeads ? 'tails' : 'heads';
  const coins = Array.from({ length: bet.coinCount }, (_, i): CoinSide =>
    i < hits ? pickedSide : otherSide,
  );
  return { ...bet, randomness: 0n, coins, pickedSideWins: hits, won };
}

function nCk(n: number, k: number): number {
  if (k > n) return 0;
  if (k === 0 || k === n) return 1;
  const effectiveK = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= effectiveK; i++) {
    result = (result * (n - effectiveK + i)) / i;
  }
  return result;
}

export function winningWays(coinCount: number, minWins: number): number {
  let ways = 0;
  for (let wins = minWins; wins <= coinCount; wins++) {
    ways += nCk(coinCount, wins);
  }
  return ways;
}

export function winProbability(coinCount: number, minWins: number): number {
  return winningWays(coinCount, minWins) / 2 ** coinCount;
}

export function payoutMultiplier(coinCount: number, minWins: number): number {
  return (0.98 * 2 ** coinCount) / winningWays(coinCount, minWins);
}

/** Floor math identical to CoinflipGame._getMaxPayout. */
export function maxPayout(wager: bigint, coinCount: number, minWins: number): bigint {
  const totalWays = 1n << BigInt(coinCount);
  const ways = BigInt(winningWays(coinCount, minWins));
  return (wager * RTP_BPS * totalWays) / (BASIS_POINTS * ways);
}

export function maxReservedProfit(wager: bigint, coinCount: number, minWins: number): bigint {
  const payout = maxPayout(wager, coinCount, minWins);
  return payout > wager ? payout - wager : 0n;
}

// SessionPhase enum from ICasinoGameV2.sol
export const PHASE_SETTLED = 3;
export const PHASE_FORFEITED = 4;
export const PHASE_CANCELLED = 5;

export function isTerminalPhase(phase: number | undefined): boolean {
  return phase === PHASE_SETTLED || phase === PHASE_FORFEITED || phase === PHASE_CANCELLED;
}
