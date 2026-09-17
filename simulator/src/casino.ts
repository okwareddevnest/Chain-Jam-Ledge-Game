// Session types, phase helpers and calldata encoding shared with the
// production host.
import { encodeFunctionData, getAddress, parseEventLogs, type Address, type Hex } from 'viem';
import type { TransactionReceipt } from 'viem';

import { casinoGameFacetAbi, erc20Abi } from './casino-abi';

export function toAddress(value: string): Address {
  return getAddress(value.toLowerCase());
}

// `SessionPhase` mirrors the on-chain enum (see ICasinoGameV2.sol).
export const SESSION_PHASE_NAMES = [
  'NONE',
  'WAITING_RANDOMNESS',
  'WAITING_PLAYER_ACTION',
  'SETTLED',
  'FORFEITED',
  'CANCELLED',
] as const;

export type SessionPhaseName = (typeof SESSION_PHASE_NAMES)[number];

export function phaseName(phase: number | undefined): SessionPhaseName | undefined {
  if (phase === undefined) return undefined;
  return SESSION_PHASE_NAMES[phase];
}

const TERMINAL_PHASES: ReadonlySet<SessionPhaseName> = new Set([
  'SETTLED',
  'FORFEITED',
  'CANCELLED',
]);

export function isTerminalPhase(phase: number | undefined): boolean {
  const name = phaseName(phase);
  return name !== undefined && TERMINAL_PHASES.has(name);
}

export type GameIntegration = {
  slug: string;
  gameAddress: Address;
  gameName: string;
  name: string;
  description?: string;
  image?: string;
  url?: string;
};

/** The indexed session row shape the host builds snapshot items from. */
export type CasinoSessionRow = {
  sessionId: string;
  chainId: number;
  game: string;
  player: string;
  vault: string;
  token: string;
  wager: string;
  /** Total escrowed stake (wager + mid-session increases like blackjack doubles). */
  stake?: string;
  maxEscrowStake: string;
  maxReservedProfit: string;
  gameData?: string;
  gameState?: string;
  status: 'open' | 'settled';
  phase: number;
  step?: number;
  actionDeadlineBlock?: string;
  randomnessDeadlineBlock?: string;
  randomnessRequestId?: string;
  randomnessFulfilled?: boolean;
  randomnessRequests?: Array<{
    /** The session step that made the request; strictly increasing per session. */
    nonce: string;
    requestId: string;
    randomness?: string;
    fulfilled: boolean;
    transactionHash?: string;
  }>;
  payout?: string;
  openedAt: number;
  settledAt?: number;
  openTransactionHash?: string;
  settleTransactionHash?: string;
  /**
   * Latest committed `CasinoSession` bytes while the session is open. The host
   * stores only their hash, so submitAction / cancelStuckRandomness echo them.
   */
  encodedSession?: string;
};

export type BatchAction = { target: Address; value: bigint; data: Hex };

export function encodeApprove(spender: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] });
}

export function encodeOpenSession(input: {
  game: Address;
  vault: Address;
  wager: bigint;
  gameData: Hex;
}): Hex {
  return encodeFunctionData({
    abi: casinoGameFacetAbi,
    functionName: 'openSession',
    args: [input.game, input.vault, input.wager, input.gameData],
  });
}

export function encodeSubmitAction(input: { encodedSession: Hex; actionData: Hex }): Hex {
  return encodeFunctionData({
    abi: casinoGameFacetAbi,
    functionName: 'submitAction',
    args: [input.encodedSession, input.actionData],
  });
}

export function encodeCancelStuckRandomness(encodedSession: Hex): Hex {
  return encodeFunctionData({
    abi: casinoGameFacetAbi,
    functionName: 'cancelStuckRandomness',
    args: [encodedSession],
  });
}

/** Pulls the new `sessionId` out of the `CasinoSessionOpened` log of a receipt. */
export function parseOpenedSessionId(receipt: TransactionReceipt): bigint {
  const logs = parseEventLogs({
    abi: casinoGameFacetAbi,
    eventName: 'CasinoSessionOpened',
    logs: receipt.logs,
  });
  const sessionId = logs[0]?.args.sessionId;
  if (sessionId === undefined) {
    throw new Error('CasinoSessionOpened event missing from the receipt.');
  }
  return sessionId;
}

/** The committed session bytes as of one step; the host takes the latest ones back on every call. */
export type EncodedSessionSnapshot = { step: number; encodedSession: Hex };

/** Pulls the newest committed snapshot per session out of the `CasinoSessionAdvanced` logs of a receipt. */
export function parseAdvancedSessionSnapshots(
  receipt: TransactionReceipt,
): Map<string, EncodedSessionSnapshot> {
  const snapshots = new Map<string, EncodedSessionSnapshot>();
  const logs = parseEventLogs({
    abi: casinoGameFacetAbi,
    eventName: 'CasinoSessionAdvanced',
    logs: receipt.logs,
  });
  for (const log of logs) {
    const sessionId = log.args.sessionId.toString();
    const current = snapshots.get(sessionId);
    if (!current || log.args.step > current.step) {
      snapshots.set(sessionId, { step: log.args.step, encodedSession: log.args.session });
    }
  }
  return snapshots;
}

export function latestEncodedSession(
  ...candidates: Array<EncodedSessionSnapshot | undefined>
): EncodedSessionSnapshot | undefined {
  let latest: EncodedSessionSnapshot | undefined;
  for (const candidate of candidates) {
    if (candidate && (!latest || candidate.step > latest.step)) latest = candidate;
  }
  return latest;
}
