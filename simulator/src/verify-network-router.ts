// Mirrors the verify-network-effect protocol package (packages/protocol/src: request.ts,
// fulfillment.ts, event.ts): the router's calldata and events, the request id as `Vrf.requestId`
// derives it, and the EIP-712 fulfillment digest as `Signatures` recovers it. Pure viem, so it
// stays out of the way of bundle splitting; the curve math lives in verify-network-ecvrf.ts.
//
// Copies of this file live in packages/casino-sdk/simulator/src, packages/pvp-sdk/simulator/src
// and apps/web/src/lib/verify-network-vrf; `packages/contracts/test/VerifyNetworkVrf.test.ts`
// holds this one to the real router. Edit here first, then sync the copies.

import {
  encodeAbiParameters,
  encodePacked,
  getAddress,
  hashTypedData,
  keccak256,
  parseAbi,
  recoverAddress,
  recoverPublicKey,
  stringToHex,
  type Address,
  type Hex,
} from 'viem';

/** A proof as the router takes it: `[gammaX, gammaY, c, s]`. */
export type VrfProof = readonly [bigint, bigint, bigint, bigint];

/** An enclave key as the router stores it: the uncompressed point's `[x, y]`. */
export type VrfPublicKey = readonly [bigint, bigint];

/**
 * A request as the router assigns it. Only its id is stored on the router; the fields are hashed
 * into the id, emitted, and echoed back verbatim by the fulfiller.
 */
export type VerifyNetworkRequest = {
  consumer: Address;
  sequence: bigint;
  fulfiller: Address;
  assignedAt: number;
  fee: bigint;
  gasPrice: bigint;
  callbackGasLimit: number;
  callbackData: Hex;
};

export const VERIFY_NETWORK_ROUTER_ABI = parseAbi([
  'struct Request { address consumer; uint64 sequence; address fulfiller; uint40 assignedAt; uint96 fee; uint96 gasPrice; uint32 callbackGasLimit; bytes callbackData; }',
  'struct Fulfillment { Request request; uint256[4] proof; bytes enclaveSignature; }',
  'function fulfillRandomness(Request request, uint256[4] proof, bytes enclaveSignature)',
  'function fulfillRandomnessBatch(Fulfillment[] fulfillments)',
  'function computeRequestId(Request request) view returns (bytes32)',
  'event RandomnessRequested(bytes32 indexed requestId, address indexed consumer, address indexed fulfiller, Request request)',
  'event RandomnessFulfilled(bytes32 indexed requestId, bytes32 randomness, uint256[4] proof, bytes enclaveSignature)',
]);

/** Tags the VRF service inside the request id so no other service on the router collides with it. */
export const SERVICE_VRF: Hex = keccak256(stringToHex('VerifyNetworkVRF'));

/** Mirrors `Vrf.requestId` in the router. */
export function computeRequestId(
  chainId: number,
  router: Address,
  request: VerifyNetworkRequest,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'uint256' },
        { type: 'address' },
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'uint64' },
        { type: 'address' },
        { type: 'uint40' },
        { type: 'uint96' },
        { type: 'uint96' },
        { type: 'uint32' },
        { type: 'bytes32' },
      ],
      [
        BigInt(chainId),
        router,
        SERVICE_VRF,
        request.consumer,
        request.sequence,
        request.fulfiller,
        request.assignedAt,
        request.fee,
        request.gasPrice,
        request.callbackGasLimit,
        keccak256(request.callbackData),
      ],
    ),
  );
}

/** What the enclave signs over besides the request id: `keccak256(abi.encode(proof))`. */
export function computeProofCommitment(proof: VrfProof): Hex {
  return keccak256(encodeAbiParameters([{ type: 'uint256[4]' }], [[...proof]]));
}

/** The typed data an enclave signs to deliver a fulfillment (`Signatures.fulfillmentDigest`). */
export function fulfillmentTypedData(input: {
  chainId: number;
  router: Address;
  requestId: Hex;
  proof: VrfProof;
}) {
  return {
    domain: {
      name: 'VerifyNetworkVRF',
      version: '2',
      chainId: BigInt(input.chainId),
      verifyingContract: input.router,
    },
    types: {
      Fulfillment: [
        { name: 'requestId', type: 'bytes32' },
        { name: 'proofCommitment', type: 'bytes32' },
      ],
    },
    primaryType: 'Fulfillment' as const,
    message: { requestId: input.requestId, proofCommitment: computeProofCommitment(input.proof) },
  };
}

// EIP-2: an `s` above the curve order's half is the malleable twin of a valid signature; the
// router's `Signatures.signer` rejects it, as it does any signature that is not 65 bytes.
const HALF_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;

export type FulfillmentSigner = {
  address: Address;
  /** The signer's key as the router registers nodes: the node address is its keccak hash. */
  publicKey: VrfPublicKey;
};

/**
 * The enclave that signed a fulfillment, recovered exactly as the router does it; null for a
 * signature the router would reject.
 */
export async function recoverFulfillmentSigner(input: {
  chainId: number;
  router: Address;
  requestId: Hex;
  proof: VrfProof;
  enclaveSignature: Hex;
}): Promise<FulfillmentSigner | null> {
  const signature = input.enclaveSignature;
  if (signature.length !== 132 || BigInt(`0x${signature.slice(66, 130)}`) > HALF_ORDER) {
    return null;
  }
  try {
    const hash = hashTypedData(fulfillmentTypedData(input));
    const [address, publicKey] = await Promise.all([
      recoverAddress({ hash, signature }),
      recoverPublicKey({ hash, signature }),
    ]);
    return { address: getAddress(address), publicKey: decodePublicKey(publicKey) };
  } catch {
    return null;
  }
}

/** The `[x, y]` limbs of an uncompressed secp256k1 key (`0x04 || x || y`). */
export function decodePublicKey(publicKey: Hex): VrfPublicKey {
  return [BigInt(`0x${publicKey.slice(4, 68)}`), BigInt(`0x${publicKey.slice(68, 132)}`)];
}

/** Mirrors `Nodes.addressOf`: a node registers under the address of its enclave key. */
export function publicKeyToAddress(publicKey: VrfPublicKey): Address {
  return getAddress(
    `0x${keccak256(encodePacked(['uint256', 'uint256'], [publicKey[0], publicKey[1]])).slice(-40)}`,
  );
}
