import { useSyncExternalStore } from 'react';

/**
 * Game-steered balance ledger.
 *
 * On-chain balance reads race the casino flow from both sides: a poll can land
 * mid-round and flash a payout before the game reveals it, or deliver a stale
 * pre-bet value after the wager already left. So the displayed balance is
 * never refetched automatically — the game host drives it directly:
 *
 *  - bet placed  → the stake is subtracted immediately
 *  - reveal      → the payout is added (a loss adds nothing)
 *
 * The chain is consulted only to reconcile: once no round has been ongoing for
 * `RECONCILE_DELAY_MS`, a single fresh read is taken and adopted as the new
 * baseline. A bet placed before the read lands cancels it: the pending timer
 * is cleared and an in-flight read's result is voided via the epoch counter,
 * so a stale value can never clobber the ledger.
 */

const RECONCILE_DELAY_MS = 3_000;

type BalanceFetcher = () => Promise<bigint | undefined>;

/** Last chain-confirmed balance; display anchor while games play. */
let baseline: bigint | undefined;
/** Net game deltas (bets −, payouts +) applied since the baseline was adopted. */
let adjustment = 0n;
const activeRounds = new Set<string>();
/** Bumped on every bet — an in-flight reconcile read from an older epoch is discarded. */
let epoch = 0;
/** Account the ledger state belongs to; switching wallets resets it. */
let scope: string | undefined;
let reconcileTimer: ReturnType<typeof setTimeout> | undefined;
const fetchers = new Set<BalanceFetcher>();

const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function cancelScheduledReconcile() {
  if (reconcileTimer === undefined) return;
  clearTimeout(reconcileTimer);
  reconcileTimer = undefined;
}

function scheduleReconcile() {
  cancelScheduledReconcile();
  reconcileTimer = setTimeout(() => {
    reconcileTimer = undefined;
    void runReconcile();
  }, RECONCILE_DELAY_MS);
}

async function runReconcile(): Promise<void> {
  if (activeRounds.size > 0) return;
  const fetcher: BalanceFetcher | undefined = fetchers.values().next().value;
  if (!fetcher) return;
  const epochAtStart = epoch;
  let fresh: bigint | undefined;
  try {
    fresh = await fetcher();
  } catch {
    return;
  }
  if (fresh === undefined) return;
  // A bet placed while the read was in flight makes the result stale — drop it.
  if (epoch !== epochAtStart || activeRounds.size > 0) return;
  baseline = fresh;
  adjustment = 0n;
  notify();
}

/** Registers the function used to read the balance fresh from chain. */
export function registerBalanceFetcher(fetcher: BalanceFetcher): () => void {
  fetchers.add(fetcher);
  return () => {
    fetchers.delete(fetcher);
  };
}

/** Reconciles with the chain immediately. Subject to the same guards as the idle reconcile. */
export function reconcileBalanceNow(): void {
  void runReconcile();
}

/** A bet left the wallet: subtract it now and cancel any pending/in-flight reconcile. */
export function betPlaced(roundKey: string, stake: bigint): void {
  epoch += 1;
  cancelScheduledReconcile();
  activeRounds.add(roundKey);
  adjustment -= stake;
  notify();
}

/** The send failed after `betPlaced` — the stake never left, put it back. */
export function refundStake(stake: bigint): void {
  if (stake === 0n) return;
  adjustment += stake;
  notify();
}

/** The game presented the outcome: credit the payout and end the round. */
export function roundRevealed(roundKey: string, payout: bigint): void {
  if (!activeRounds.delete(roundKey)) return;
  adjustment += payout;
  if (activeRounds.size === 0) scheduleReconcile();
  notify();
}

/** Ends a round without a payout (loss, unmount, cancelled) — reconcile catches the rest. */
export function roundClosed(roundKey: string): void {
  if (!activeRounds.delete(roundKey)) return;
  if (activeRounds.size === 0) scheduleReconcile();
  notify();
}

/** Drops all ledger state when the connected account changes. */
export function resetLedgerScope(nextScope: string | undefined): void {
  if (scope === nextScope) return;
  scope = nextScope;
  epoch += 1;
  cancelScheduledReconcile();
  activeRounds.clear();
  baseline = undefined;
  adjustment = 0n;
  notify();
}

/**
 * The balance to display. Before any game activity the raw chain read seeds the
 * baseline; afterwards the ledger is authoritative and raw updates are ignored
 * until a reconcile adopts a fresh value.
 */
export function useLedgeredBalance(raw: bigint | undefined): bigint | undefined {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  if (baseline === undefined) {
    if (raw === undefined) return undefined;
    if (activeRounds.size === 0 && adjustment === 0n) {
      // Seeding a shared module value during render is safe: it's idempotent
      // and every consumer reads the same cached `raw`.
      baseline = raw;
      return raw;
    }
    const value = raw + adjustment;
    return value < 0n ? 0n : value;
  }
  const value = baseline + adjustment;
  return value < 0n ? 0n : value;
}
