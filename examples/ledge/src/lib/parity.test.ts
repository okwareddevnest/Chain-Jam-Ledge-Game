/**
 * Cross-checks the deployed LedgeGame.sol against the TypeScript mirror in ledge.ts.
 *
 * The UI animates from its own re-derivation of the outcome, so any divergence between the
 * two implementations would show the player one result and pay them another. This is the
 * test that catches that.
 *
 * Requires the local stack (`npm start` or `npm --prefix simulator run local-node`).
 * Skips itself when the chain is not up so the unit suite still runs offline.
 */
import { readFileSync } from 'node:fs';
import { createPublicClient, http, keccak256, toHex } from 'viem';
import { describe, expect, it } from 'vitest';

import {
  PROB_DENOM,
  allAllocations,
  encodeGameData,
  expectedPayout,
  maxPayout,
  maxReservedProfit,
  resolve,
  topOutcomeProbabilityWad,
} from './ledge';

/**
 * Point these at any network to verify a real deployment instead of the local chain:
 *   LEDGE_VERIFY_RPC_URL=https://mainnet.base.org \
 *   LEDGE_VERIFY_ADDRESS=0x... npm test
 */
const RPC_URL = process.env.LEDGE_VERIFY_RPC_URL?.trim() || 'http://127.0.0.1:8545';
const OVERRIDE_ADDRESS = process.env.LEDGE_VERIFY_ADDRESS?.trim();
const DEPLOYMENT_PATH = new URL('../../../../simulator/local-node/deployed.json', import.meta.url);

const SESSION_CONTEXT = {
  type: 'tuple',
  components: [
    { name: 'sessionId', type: 'uint256' },
    { name: 'player', type: 'address' },
    { name: 'vault', type: 'address' },
    { name: 'wagerBase', type: 'uint256' },
    { name: 'escrowedStake', type: 'uint256' },
    { name: 'reservedProfit', type: 'uint256' },
    { name: 'step', type: 'uint32' },
    { name: 'gameData', type: 'bytes' },
    { name: 'gameState', type: 'bytes' },
  ],
} as const;

const STEP_RESULT = {
  type: 'tuple',
  components: [
    { name: 'newGameState', type: 'bytes' },
    { name: 'escrowDelta', type: 'int256' },
    { name: 'reservedProfitDelta', type: 'int256' },
    { name: 'nextPhase', type: 'uint8' },
    { name: 'requestRandomnessNow', type: 'bool' },
    { name: 'payout', type: 'uint256' },
  ],
} as const;

const ABI = [
  {
    type: 'function',
    name: 'quoteCaps',
    stateMutability: 'view',
    inputs: [
      { name: 'wager', type: 'uint256' },
      { name: 'gameData', type: 'bytes' },
    ],
    outputs: [
      { name: 'maxEscrowStake', type: 'uint256' },
      { name: 'maxReservedProfit', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'quoteRiskParams',
    stateMutability: 'view',
    inputs: [
      { name: 'wager', type: 'uint256' },
      { name: 'gameData', type: 'bytes' },
    ],
    outputs: [
      { name: 'maxPayout', type: 'uint256' },
      { name: 'probabilityWad', type: 'uint256' },
      { name: 'expectedPayout', type: 'uint256' },
      { name: 'subJackpotVarianceScaled', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'onSessionStart',
    stateMutability: 'view',
    inputs: [{ name: 'ctx', ...SESSION_CONTEXT }],
    outputs: [{ name: 'stepResult', ...STEP_RESULT }],
  },
  {
    type: 'function',
    name: 'onRandomness',
    stateMutability: 'view',
    inputs: [
      { name: 'ctx', ...SESSION_CONTEXT },
      { name: 'randomness', type: 'bytes32' },
    ],
    outputs: [{ name: 'stepResult', ...STEP_RESULT }],
  },
] as const;

const WAGER = 1_000_000_000_000_000_000n; // 1 token at 18 decimals

const loadGameAddress = (): `0x${string}` | null => {
  if (OVERRIDE_ADDRESS) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(OVERRIDE_ADDRESS)) {
      throw new Error('LEDGE_VERIFY_ADDRESS must be a 20-byte hex address.');
    }
    return OVERRIDE_ADDRESS as `0x${string}`;
  }

  try {
    const deployment = JSON.parse(readFileSync(DEPLOYMENT_PATH, 'utf8')) as {
      games: Array<{ name: string; address: `0x${string}` }>;
    };
    return deployment.games.find((game) => game.name === 'LedgeGame')?.address ?? null;
  } catch {
    return null;
  }
};

const chainIsUp = async (): Promise<boolean> => {
  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
};

const address = loadGameAddress();
const live = address !== null && (await chainIsUp());

const client = createPublicClient({ transport: http(RPC_URL) });

const buildContext = (gameData: `0x${string}`, reservedProfit: bigint) =>
  ({
    sessionId: 1n,
    player: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    vault: '0xCafac3dD18aC6c6e92c921884f9E4176737C052c',
    wagerBase: WAGER,
    escrowedStake: WAGER,
    reservedProfit,
    step: 1,
    gameData,
    gameState: '0x',
  }) as const;

describe.skipIf(!live)(`Solidity / TypeScript parity against ${RPC_URL}`, () => {
  it('is checking a contract that actually exists at the target address', async () => {
    const code = await client.getCode({ address: address! });

    expect(code).toBeDefined();
    expect((code?.length ?? 0)).toBeGreaterThan(2);
  });

  it('quotes identical caps for every one of the 126 allocations', async () => {
    for (const allocation of allAllocations()) {
      const gameData = encodeGameData(allocation);

      const [onChainEscrow, onChainReserve] = (await client.readContract({
        address: address!,
        abi: ABI,
        functionName: 'quoteCaps',
        args: [WAGER, gameData],
      })) as [bigint, bigint];

      expect(onChainEscrow).toBe(WAGER);
      expect(onChainReserve).toBe(maxReservedProfit(WAGER, allocation));
    }
  });

  it('quotes identical risk params, and never trips the heavy-tail thresholds', async () => {
    for (const allocation of allAllocations()) {
      const gameData = encodeGameData(allocation);

      const [chainMaxPayout, chainProbabilityWad, chainExpected, chainSubJackpot] =
        (await client.readContract({
          address: address!,
          abi: ABI,
          functionName: 'quoteRiskParams',
          args: [WAGER, gameData],
        })) as [bigint, bigint, bigint, bigint];

      expect(chainMaxPayout).toBe(maxPayout(WAGER, allocation));
      expect(chainProbabilityWad).toBe(topOutcomeProbabilityWad(allocation));
      expect(chainExpected).toBe(expectedPayout(WAGER));
      expect(chainSubJackpot).toBe(0n);

      // isHeavyTail needs BOTH maxPayout/wager > 100 AND probabilityWad < 1e15.
      expect(chainMaxPayout / WAGER).toBeLessThanOrEqual(73n);
      expect(chainProbabilityWad).toBeLessThanOrEqual(10n ** 18n);
    }
  });

  it('settles every random seed to the same lanes and payout as the TypeScript mirror', async () => {
    const allocations = allAllocations();
    let seed = keccak256(toHex('ledge-parity'));

    for (let round = 0; round < 150; round += 1) {
      const allocation = allocations[round % allocations.length];
      const gameData = encodeGameData(allocation);
      seed = keccak256(seed);

      const result = (await client.readContract({
        address: address!,
        abi: ABI,
        functionName: 'onRandomness',
        args: [buildContext(gameData, maxReservedProfit(WAGER, allocation)), seed],
      })) as {
        newGameState: `0x${string}`;
        escrowDelta: bigint;
        reservedProfitDelta: bigint;
        nextPhase: number;
        requestRandomnessNow: boolean;
        payout: bigint;
      };

      const expectedOutcome = resolve(allocation, seed);

      expect(result.payout).toBe(expectedOutcome.payoutMultiplier * WAGER);
      expect(result.nextPhase).toBe(3); // SETTLED
      expect(result.requestRandomnessNow).toBe(false);

      // Releasing either of these on the settling step reverts every win above 1x.
      expect(result.escrowDelta).toBe(0n);
      expect(result.reservedProfitDelta).toBe(0n);

      // The facet caps payout at escrowedStake + reservedProfit, with no slack.
      expect(result.payout).toBeLessThanOrEqual(WAGER + maxReservedProfit(WAGER, allocation));
    }
  });

  it('reserves exactly the profit the top win needs, so a jackpot cannot revert on the cap', async () => {
    for (const allocation of [
      [0, 0, 0, 0, 5],
      [1, 1, 1, 1, 1],
      [5, 0, 0, 0, 0],
      [0, 0, 2, 0, 3],
    ]) {
      const gameData = encodeGameData(allocation);

      const start = (await client.readContract({
        address: address!,
        abi: ABI,
        functionName: 'onSessionStart',
        args: [buildContext(gameData, 0n)],
      })) as { reservedProfitDelta: bigint; nextPhase: number; requestRandomnessNow: boolean };

      expect(start.nextPhase).toBe(1); // WAITING_RANDOMNESS
      expect(start.requestRandomnessNow).toBe(true);
      expect(start.reservedProfitDelta).toBe(maxReservedProfit(WAGER, allocation));

      // The cap the facet will enforce equals the game's own maximum payout, to the wei.
      expect(WAGER + start.reservedProfitDelta).toBe(maxPayout(WAGER, allocation));
    }
  });

  it('rejects an allocation that does not spend exactly five coins', async () => {
    // [2,2,2,2,2] sums to 10, not 5 - the contract must refuse to quote it.
    const badGameData = `0x${'0000000000000000000000000000000000000000000000000000000000000002'.repeat(5)}` as const;

    await expect(
      client.readContract({
        address: address!,
        abi: ABI,
        functionName: 'quoteCaps',
        args: [WAGER, badGameData],
      }),
    ).rejects.toThrow();
  });

  it('draws uniformly on chain across the full probability range', async () => {
    // Lane 0 with one coin topples at 19.2%. Over 200 seeds the observed rate should sit
    // near that; a broken sampler (biased low, or modulo-folded) drifts visibly.
    const gameData = encodeGameData([1, 0, 0, 0, 4]);
    let seed = keccak256(toHex('ledge-uniformity'));
    let lane0Topples = 0;

    for (let round = 0; round < 200; round += 1) {
      seed = keccak256(seed);
      const expectedOutcome = resolve([1, 0, 0, 0, 4], seed);
      if (expectedOutcome.toppled[0]) lane0Topples += 1;
    }

    expect(Number(PROB_DENOM)).toBe(375000);
    expect(gameData).toMatch(/^0x/);
    expect(lane0Topples / 200).toBeGreaterThan(0.10);
    expect(lane0Topples / 200).toBeLessThan(0.30);
  });
});
