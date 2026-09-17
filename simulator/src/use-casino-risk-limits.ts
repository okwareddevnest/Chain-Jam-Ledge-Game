import { useEffect, useState } from 'react';

import type { HostSnapshotV1 } from '@chain/casino-sdk';

import { erc20Abi } from './casino-abi';
import type { SimulatorRuntime } from './runtime';

const DEFAULT_MAX_BET_RISK_BPS = 100;
const BASIS_POINTS = 10_000n;
const REFRESH_INTERVAL = 30_000;

/**
 * The local harness drops the production portfolio risk accounting, so the
 * snapshot's `casino` block is synthesized instead: the liquidity vault's
 * token balance stands in for available liquidity and the production default
 * per-bet risk cap applies. Games exercise the same bet-size clamping they
 * ship against the real host.
 */
export function useCasinoRiskLimits(runtime: SimulatorRuntime): HostSnapshotV1['casino'] {
  const [availableLiquidity, setAvailableLiquidity] = useState<bigint | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const balance = await runtime.publicClient.readContract({
          address: runtime.token,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [runtime.liquidityVault],
        });
        if (!cancelled) setAvailableLiquidity(balance as bigint);
      } catch {
        // Local node may be restarting; keep the last published limits.
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runtime]);

  if (availableLiquidity === undefined) return undefined;
  return {
    availableLiquidity: availableLiquidity.toString(),
    maxBetRiskBps: DEFAULT_MAX_BET_RISK_BPS,
    maxAllowedReservedProfit: (
      (availableLiquidity * BigInt(DEFAULT_MAX_BET_RISK_BPS)) /
      BASIS_POINTS
    ).toString(),
  };
}
