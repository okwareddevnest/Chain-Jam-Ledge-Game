// Host-side implementation of `getRandomnessVerification` for the simulator —
// the piece the game's "provably fair" dialog calls (feature-detected) to get
// a cryptographic verdict on each VRF fulfillment. Mirrors what the production
// host does (apps/web/src/lib/randomness-verification.ts): the router keeps no
// request state, so the artifacts come from the fulfillment transaction — the
// `RandomnessFulfilled` log and the request echoed in the calldata — and are
// re-checked locally per docs/RANDOMNESS_VERIFICATION.md.

import {
  decodeEventLog,
  decodeFunctionData,
  getAbiItem,
  getAddress,
  numberToHex,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';

import type {
  RandomnessRequestEchoV1,
  RandomnessRequestV1,
  RandomnessRequestVerificationV1,
  RandomnessVerificationV1,
  VrfVerificationChecksV1,
} from '@chain/casino-sdk';

import { deriveRandomness, verify as verifyEcvrf } from './verify-network-ecvrf.ts';
import {
  computeRequestId,
  recoverFulfillmentSigner,
  VERIFY_NETWORK_ROUTER_ABI,
  type VerifyNetworkRequest,
  type VrfProof,
} from './verify-network-router.ts';

const hostRouterAbi = [
  {
    inputs: [],
    name: 'router',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const RANDOMNESS_FULFILLED_EVENT = getAbiItem({
  abi: VERIFY_NETWORK_ROUTER_ABI,
  name: 'RandomnessFulfilled',
});

/** The reads the verification needs; any viem public client satisfies it. */
export type VerificationClient = Pick<
  PublicClient,
  'getTransactionReceipt' | 'getTransaction' | 'getLogs' | 'readContract'
>;

const hex32 = (value: bigint): Hex => numberToHex(value, { size: 32 });
const sameHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function findFulfillmentLog(
  logs: readonly { address: Address; data: Hex; topics: readonly Hex[] }[],
  router: Address,
  requestId: Hex,
): { randomness: Hex; proof: VrfProof; enclaveSignature: Hex } | undefined {
  for (const log of logs) {
    if (!sameHex(log.address, router) || log.topics.length === 0) continue;
    try {
      const decoded = decodeEventLog({
        abi: VERIFY_NETWORK_ROUTER_ABI,
        eventName: 'RandomnessFulfilled',
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
        strict: true,
      });
      if (sameHex(decoded.args.requestId, requestId)) {
        return {
          randomness: decoded.args.randomness,
          proof: decoded.args.proof,
          enclaveSignature: decoded.args.enclaveSignature,
        };
      }
    } catch {
      // Other router or host logs in the same transaction.
    }
  }
  return undefined;
}

/**
 * The request the node echoed when fulfilling, taken from the transaction's
 * calldata (single or batched fulfillment) and accepted only when it hashes
 * to the request id — that binding is what makes its `fulfiller` trustworthy.
 */
export function findEchoedRequest(
  input: Hex,
  requestId: Hex,
  chainId: number,
  router: Address,
): VerifyNetworkRequest | undefined {
  let candidates: VerifyNetworkRequest[];
  try {
    const decoded = decodeFunctionData({ abi: VERIFY_NETWORK_ROUTER_ABI, data: input });
    if (decoded.functionName === 'fulfillRandomness') {
      candidates = [decoded.args[0]];
    } else if (decoded.functionName === 'fulfillRandomnessBatch') {
      candidates = decoded.args[0].map(fulfillment => fulfillment.request);
    } else {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return candidates.find(candidate =>
    sameHex(computeRequestId(chainId, router, candidate), requestId),
  );
}

function echoToV1(echo: VerifyNetworkRequest): RandomnessRequestEchoV1 {
  return {
    consumer: echo.consumer,
    sequence: echo.sequence.toString(),
    fulfiller: echo.fulfiller,
    assignedAt: echo.assignedAt.toString(),
    fee: echo.fee.toString(),
    gasPrice: echo.gasPrice.toString(),
    callbackGasLimit: echo.callbackGasLimit.toString(),
    callbackData: echo.callbackData,
  };
}

/** Rows projected before the hash existed: the router's log carries it. */
async function findFulfillmentTransaction(
  client: VerificationClient,
  router: Address,
  requestId: Hex,
): Promise<Hex | undefined> {
  const logs = await client.getLogs({
    address: router,
    event: RANDOMNESS_FULFILLED_EVENT,
    args: { requestId },
    fromBlock: 0n,
  });
  return logs.at(-1)?.transactionHash ?? undefined;
}

async function verifyRequest(
  client: VerificationClient,
  chainId: number,
  router: Address,
  request: RandomnessRequestV1,
): Promise<RandomnessRequestVerificationV1> {
  try {
    const transactionHash =
      request.transactionHash ??
      (await findFulfillmentTransaction(client, router, request.requestId));
    if (!transactionHash) return { ...request };
    const [receipt, transaction] = await Promise.all([
      client.getTransactionReceipt({ hash: transactionHash }),
      client.getTransaction({ hash: transactionHash }),
    ]);
    const log = findFulfillmentLog(receipt.logs, router, request.requestId);
    if (!log) return { ...request };
    const { randomness, proof, enclaveSignature } = log;
    const requestId = request.requestId;
    const echo = findEchoedRequest(transaction.input, requestId, chainId, router);

    // The router registers every node under the address of its enclave key, so
    // the key the signature recovers to is the key the proof is checked under;
    // `signerMatchesFulfiller` then ties that key to the assigned node.
    const signer = await recoverFulfillmentSigner({
      chainId,
      router,
      requestId,
      proof,
      enclaveSignature,
    });
    const vrfProofValid =
      signer !== null && verifyEcvrf({ publicKey: signer.publicKey, proof, alpha: requestId });
    const checks: VrfVerificationChecksV1 = {
      vrfProofValid,
      vrfBetaMatchesRandomness:
        vrfProofValid &&
        sameHex(deriveRandomness(proof), randomness) &&
        (request.randomness === undefined || sameHex(request.randomness, randomness)),
      enclaveSignatureValid: signer !== null,
      signerMatchesFulfiller:
        signer !== null && echo !== undefined && signer.address === getAddress(echo.fulfiller),
    };
    return {
      ...request,
      // Preserve the game's recorded word so a mismatch remains reviewable.
      // The router's word is always available separately in artifacts.
      randomness: request.randomness ?? randomness,
      fulfilled: true,
      transactionHash,
      artifacts: {
        randomness,
        proof: [hex32(proof[0]), hex32(proof[1]), hex32(proof[2]), hex32(proof[3])],
        enclaveSignature,
        alpha: requestId,
      },
      request: echo ? echoToV1(echo) : undefined,
      fulfiller: echo?.fulfiller,
      nodePublicKey: signer ? [hex32(signer.publicKey[0]), hex32(signer.publicKey[1])] : undefined,
      checks,
      valid: Object.values(checks).every(Boolean),
    };
  } catch {
    // Reads failed for this request only — fulfilled + no checks renders as
    // "could not verify" with a retry, NOT as invalid.
    return { ...request };
  }
}

/** Verifies every fulfilled request against the router through the given client. */
export async function verifyRandomnessRequestsWith(input: {
  client: VerificationClient;
  chainId: number;
  router: Address;
  requests: RandomnessRequestV1[];
}): Promise<RandomnessVerificationV1> {
  const { client, chainId, router, requests } = input;
  const verified = await Promise.all(
    requests.map(request =>
      request.fulfilled
        ? verifyRequest(client, chainId, router, request)
        : Promise.resolve({ ...request }),
    ),
  );
  return { supported: true, chainId, routerAddress: router, requests: verified };
}

/**
 * Verify every VRF request of a session against on-chain router state.
 * Throws when the chain (or the router address) is unreachable — the game
 * renders that as "could not verify, retry", per the SDK doc.
 */
export async function verifySessionRandomness(input: {
  publicClient: PublicClient;
  chainId: number;
  /** LocalCasinoHost address — its `router()` getter locates the artifacts. */
  proxy: Address;
  requests: RandomnessRequestV1[];
}): Promise<RandomnessVerificationV1> {
  const { publicClient, chainId, proxy, requests } = input;
  const router = (await publicClient.readContract({
    address: proxy,
    abi: hostRouterAbi,
    functionName: 'router',
  })) as Address;
  if (!router || router === zeroAddress) {
    return { supported: false, chainId, requests: [] };
  }
  return verifyRandomnessRequestsWith({ client: publicClient, chainId, router, requests });
}
