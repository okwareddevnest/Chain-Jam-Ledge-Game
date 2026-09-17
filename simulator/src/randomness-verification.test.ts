import { describe, expect, it, vi } from 'vitest';
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  getAddress,
  type Address,
  type Hex,
} from 'viem';

import type { RandomnessRequestV1 } from '@chain/casino-sdk';
import { privateKeyToAccount } from 'viem/accounts';

import { deriveRandomness, prove as proveEcvrf } from './verify-network-ecvrf.ts';
import {
  computeRequestId,
  fulfillmentTypedData,
  VERIFY_NETWORK_ROUTER_ABI,
  type VerifyNetworkRequest,
  type VrfProof,
} from './verify-network-router.ts';
import {
  findEchoedRequest,
  verifyRandomnessRequestsWith,
  type VerificationClient,
} from './randomness-verification.ts';

const NODE_PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const CHAIN_ID = 84532;
const ROUTER = '0xc56604be8480D2F351293b129A635942DA7CAD0F' as const;
const PROXY = getAddress('0x8d3c07ed1a992bbe5f42c2cab7774262a0919a4c');
const TX_HASH = `0x${'ab'.repeat(32)}` as Hex;

const node = privateKeyToAccount(NODE_PRIVATE_KEY);

const request: VerifyNetworkRequest = {
  consumer: PROXY,
  sequence: 7n,
  fulfiller: node.address,
  assignedAt: 1_700_000_000,
  fee: 1_000n,
  gasPrice: 5n,
  callbackGasLimit: 200_000,
  callbackData: '0xdead',
};
const requestId = computeRequestId(CHAIN_ID, ROUTER, request);

type Fulfillment = { proof: VrfProof; randomness: Hex; enclaveSignature: Hex };

async function generateFulfillment(
  proof: VrfProof = proveEcvrf({ privateKey: NODE_PRIVATE_KEY, alpha: requestId }),
  signer = node,
): Promise<Fulfillment> {
  return {
    proof,
    randomness: deriveRandomness(proof),
    enclaveSignature: await signer.signTypedData(
      fulfillmentTypedData({ chainId: CHAIN_ID, router: ROUTER, requestId, proof }),
    ),
  };
}

function fulfillmentLog(fulfillment: Fulfillment, address: Address = ROUTER) {
  return {
    address,
    transactionHash: TX_HASH,
    topics: encodeEventTopics({
      abi: VERIFY_NETWORK_ROUTER_ABI,
      eventName: 'RandomnessFulfilled',
      args: { requestId },
    }),
    data: encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'uint256[4]' }, { type: 'bytes' }],
      [fulfillment.randomness, [...fulfillment.proof], fulfillment.enclaveSignature],
    ),
  };
}

function singleCalldata(fulfillment: Fulfillment, echo: VerifyNetworkRequest = request): Hex {
  return encodeFunctionData({
    abi: VERIFY_NETWORK_ROUTER_ABI,
    functionName: 'fulfillRandomness',
    args: [echo, [...fulfillment.proof], fulfillment.enclaveSignature],
  });
}

function batchCalldata(fulfillment: Fulfillment): Hex {
  const other = { ...request, sequence: 8n };
  return encodeFunctionData({
    abi: VERIFY_NETWORK_ROUTER_ABI,
    functionName: 'fulfillRandomnessBatch',
    args: [
      [
        { request: other, proof: [1n, 2n, 3n, 4n], enclaveSignature: '0x' },
        { request, proof: [...fulfillment.proof], enclaveSignature: fulfillment.enclaveSignature },
      ],
    ],
  });
}

function stubClient(input: {
  logs: ReturnType<typeof fulfillmentLog>[];
  calldata: Hex;
}): VerificationClient {
  return {
    getTransactionReceipt: async () => ({ blockNumber: 10n, logs: input.logs }),
    getTransaction: async () => ({ input: input.calldata }),
    getLogs: async () => input.logs,
    readContract: async () => {
      throw new Error('no router views are read');
    },
  } as unknown as VerificationClient;
}

const fulfilledRequest = { nonce: '1', requestId, fulfilled: true, transactionHash: TX_HASH };

const verify = (client: VerificationClient, requests: RandomnessRequestV1[] = [fulfilledRequest]) =>
  verifyRandomnessRequestsWith({ client, chainId: CHAIN_ID, router: ROUTER, requests });

describe('verifyRandomnessRequestsWith', () => {
  it('passes every check for a genuine single fulfillment', async () => {
    const fulfillment = await generateFulfillment();
    const result = await verify(
      stubClient({ logs: [fulfillmentLog(fulfillment)], calldata: singleCalldata(fulfillment) }),
    );

    expect(result.supported).toBe(true);
    expect(result.routerAddress).toBe(ROUTER);
    const [verified] = result.requests;
    expect(verified?.checks).toEqual({
      vrfProofValid: true,
      vrfBetaMatchesRandomness: true,
      enclaveSignatureValid: true,
      signerMatchesFulfiller: true,
    });
    expect(verified?.valid).toBe(true);
    expect(verified?.randomness).toBe(fulfillment.randomness);
    expect(verified?.fulfiller).toBe(node.address);
    expect(verified?.request).toEqual({
      consumer: PROXY,
      sequence: '7',
      fulfiller: node.address,
      assignedAt: '1700000000',
      fee: '1000',
      gasPrice: '5',
      callbackGasLimit: '200000',
      callbackData: '0xdead',
    });
    expect(verified?.artifacts).toEqual({
      randomness: fulfillment.randomness,
      proof: fulfillment.proof.map(limb => `0x${limb.toString(16).padStart(64, '0')}`),
      enclaveSignature: fulfillment.enclaveSignature,
      alpha: requestId,
    });
    expect(verified?.nodePublicKey).toHaveLength(2);
  });

  it('finds the echoed request inside a batched fulfillment', async () => {
    const fulfillment = await generateFulfillment();
    const result = await verify(
      stubClient({ logs: [fulfillmentLog(fulfillment)], calldata: batchCalldata(fulfillment) }),
    );

    expect(result.requests[0]?.valid).toBe(true);
    expect(result.requests[0]?.request?.sequence).toBe('7');
  });

  it('locates the fulfillment through the router log when the row has no hash', async () => {
    const fulfillment = await generateFulfillment();
    const client = stubClient({
      logs: [fulfillmentLog(fulfillment)],
      calldata: singleCalldata(fulfillment),
    });
    const withoutHash = { nonce: '1', requestId, fulfilled: true };
    const [verified] = (await verify(client, [withoutHash])).requests;
    expect(verified?.valid).toBe(true);
    expect(verified?.transactionHash).toBe(TX_HASH);

    client.getLogs = async () => [];
    expect((await verify(client, [withoutHash])).requests[0]).toEqual(withoutHash);
  });

  it('flags randomness that does not match the proof', async () => {
    const fulfillment = await generateFulfillment();
    const tampered = { ...fulfillment, randomness: requestId };
    const result = await verify(
      stubClient({ logs: [fulfillmentLog(tampered)], calldata: singleCalldata(fulfillment) }),
    );

    expect(result.requests[0]?.checks?.vrfProofValid).toBe(true);
    expect(result.requests[0]?.checks?.vrfBetaMatchesRandomness).toBe(false);
    expect(result.requests[0]?.valid).toBe(false);
  });

  it.each(['mismatch', 'match', 'uppercase match'])(
    'checks the recorded randomness against the router: %s',
    async variant => {
      const fulfillment = await generateFulfillment();
      const recorded =
        variant === 'mismatch'
          ? requestId
          : variant === 'uppercase match'
            ? (`0x${fulfillment.randomness.slice(2).toUpperCase()}` as Hex)
            : fulfillment.randomness;
      const result = await verify(
        stubClient({ logs: [fulfillmentLog(fulfillment)], calldata: singleCalldata(fulfillment) }),
        [{ ...fulfilledRequest, randomness: recorded }],
      );

      const [verified] = result.requests;
      expect(verified?.randomness).toBe(recorded);
      expect(verified?.artifacts?.randomness).toBe(fulfillment.randomness);
      expect(verified?.checks?.vrfProofValid).toBe(true);
      expect(verified?.checks?.vrfBetaMatchesRandomness).toBe(variant !== 'mismatch');
      expect(verified?.valid).toBe(variant !== 'mismatch');
    },
  );

  it('reports a signed malformed proof as invalid and retains its artifacts', async () => {
    const proof = [...proveEcvrf({ privateKey: NODE_PRIVATE_KEY, alpha: requestId })] as [
      bigint,
      bigint,
      bigint,
      bigint,
    ];
    proof[2] = 2n ** 128n;
    const malformed = await generateFulfillment(proof);
    const result = await verify(
      stubClient({ logs: [fulfillmentLog(malformed)], calldata: singleCalldata(malformed) }),
    );

    const [verified] = result.requests;
    expect(verified?.valid).toBe(false);
    expect(verified?.checks).toEqual({
      vrfProofValid: false,
      vrfBetaMatchesRandomness: false,
      enclaveSignatureValid: true,
      signerMatchesFulfiller: true,
    });
    expect(verified?.artifacts?.proof.map(BigInt)).toEqual(proof);
  });

  it('keeps actual RPC failures unavailable instead of reporting invalid proofs', async () => {
    const fulfillment = await generateFulfillment();
    const client = stubClient({
      logs: [fulfillmentLog(fulfillment)],
      calldata: singleCalldata(fulfillment),
    });
    client.getTransactionReceipt = vi.fn().mockRejectedValue(new Error('RPC unavailable'));
    const result = await verify(client);
    expect(result.requests[0]).toEqual(fulfilledRequest);
  });

  it('cannot attribute the fulfiller when the echoed request does not hash to the request id', async () => {
    const fulfillment = await generateFulfillment();
    const impostor = privateKeyToAccount(`0x${'11'.repeat(32)}`).address;
    const result = await verify(
      stubClient({
        logs: [fulfillmentLog(fulfillment)],
        calldata: singleCalldata(fulfillment, { ...request, fulfiller: impostor }),
      }),
    );

    const [verified] = result.requests;
    expect(verified?.fulfiller).toBeUndefined();
    expect(verified?.request).toBeUndefined();
    // The proof still verifies under the signer's own key; only the assignment is unproven.
    expect(verified?.checks?.vrfProofValid).toBe(true);
    expect(verified?.checks?.enclaveSignatureValid).toBe(true);
    expect(verified?.checks?.signerMatchesFulfiller).toBe(false);
    expect(verified?.valid).toBe(false);
  });

  it('rejects a fulfillment signed by a key other than the assigned fulfiller', async () => {
    const other = privateKeyToAccount(`0x${'22'.repeat(32)}`);
    const fulfillment = await generateFulfillment(undefined, other);
    const result = await verify(
      stubClient({ logs: [fulfillmentLog(fulfillment)], calldata: singleCalldata(fulfillment) }),
    );

    const [verified] = result.requests;
    expect(verified?.fulfiller).toBe(node.address);
    expect(verified?.checks).toEqual({
      vrfProofValid: false,
      vrfBetaMatchesRandomness: false,
      enclaveSignatureValid: true,
      signerMatchesFulfiller: false,
    });
  });

  it('ignores fulfillment logs from other contracts and leaves pending requests untouched', async () => {
    const fulfillment = await generateFulfillment();
    const pending = { nonce: '3', requestId: `0x${'33'.repeat(32)}` as Hex, fulfilled: false };
    const result = await verify(
      stubClient({
        logs: [fulfillmentLog(fulfillment, PROXY)],
        calldata: singleCalldata(fulfillment),
      }),
      [fulfilledRequest, pending],
    );

    expect(result.requests[0]).toEqual(fulfilledRequest);
    expect(result.requests[1]).toEqual(pending);
  });
});

describe('router mirrors', () => {
  it('binds the echoed request to the request id', async () => {
    const fulfillment = await generateFulfillment();
    expect(findEchoedRequest(singleCalldata(fulfillment), requestId, CHAIN_ID, ROUTER)).toEqual(
      request,
    );
    expect(
      findEchoedRequest(singleCalldata(fulfillment), requestId, CHAIN_ID + 1, ROUTER),
    ).toBeUndefined();
    expect(findEchoedRequest('0x1234', requestId, CHAIN_ID, ROUTER)).toBeUndefined();
  });
});
