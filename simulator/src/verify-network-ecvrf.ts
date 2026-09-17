// Verbatim mirror of verify-network-effect `packages/protocol/src/ecvrf.ts`; keep it diffable
// against upstream. Copies live in packages/casino-sdk/simulator/src, packages/pvp-sdk/simulator/src
// and apps/web/src/lib/verify-network-vrf; `packages/contracts/test/VerifyNetworkVrf.test.ts`
// holds this one to the real verifier. Edit here first, then sync the copies.

import { secp256k1 } from '@noble/curves/secp256k1.js';
import {
  bytesToNumberBE,
  concatBytes,
  createHmacDrbg,
  numberToBytesBE,
} from '@noble/curves/utils.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, encodeAbiParameters, hexToBytes, keccak256, zeroHash, type Hex } from 'viem';

/**
 * ECVRF-SECP256K1-SHA256-TAI, the RFC 9381 cipher suite the router's `ECVRFVerifier` checks,
 * on `@noble/curves` and `@noble/hashes`. Hash-to-curve, the challenge, the proof encoding,
 * and the randomness derivation mirror `VRF.sol` so the enclave and the router agree byte for
 * byte; the nonce is RFC 6979, as RFC 9381 prescribes for the suite. Every function is pure and
 * synchronous, so it runs unchanged on a `node:worker_threads` worker, under Node and Bun.
 */

/** A proof as the router takes it: `[gammaX, gammaY, c, s]`. */
export type Proof = readonly [gammaX: bigint, gammaY: bigint, c: bigint, s: bigint];

/** An enclave key as the router stores it: the uncompressed point's `[x, y]`. */
export type PublicKey = readonly [x: bigint, y: bigint];

/**
 * `VRF.HASH_TO_CURVE_MAX_ITERATIONS`: the try-and-increment attempts the on-chain verifier makes
 * before declaring an alpha unfulfillable (probability 2^-50 per request).
 */
export const HASH_TO_CURVE_MAX_ITERATIONS = 50;

/** What a fulfiller submits for an alpha that fails the hash-to-curve check. */
export const SENTINEL_PROOF: Proof = [0n, 0n, 0n, 0n];

/** The router recognises the sentinel by its gamma alone. */
export const isSentinel = ([gammaX, gammaY]: Proof): boolean => gammaX === 0n && gammaY === 0n;

const { Point } = secp256k1;
type CurvePoint = InstanceType<typeof Point>;
const G = Point.BASE;
/** The group order, RFC 9381's `q`. */
const Q = Point.Fn.ORDER;

/** The suite string; the byte after it separates the three hashes the suite takes. */
const SUITE = 0xfe;
/** RFC 9381 sizes for the suite: the challenge `c` is 16 bytes, the proof string 33 + 16 + 32. */
const C_BYTES = 16;
const C_LIMIT = 1n << 128n;
const PROOF_BYTES = 81;

/** The curve point at `[x, y]`. Throws when there is none, including for the sentinel. */
const point = ([x, y]: readonly [bigint, bigint]): CurvePoint => {
  const p = Point.fromAffine({ x, y });
  p.assertValidity();
  return p;
};

const limbs = (p: CurvePoint): [bigint, bigint] => {
  const { x, y } = p.toAffine();
  return [x, y];
};

/** `VRF.encodePoint`: SEC 1 compressed, the parity prefix then `x`, over the limbs as given. */
const encodePoint = (x: bigint, y: bigint): Uint8Array =>
  concatBytes(Uint8Array.of(y % 2n === 0n ? 0x02 : 0x03), numberToBytesBE(x, 32));

const compressed = (p: CurvePoint): Uint8Array => encodePoint(...limbs(p));

/**
 * The `[x, y]` point the router stores, from the key viem derives (`0x04 || x || y`). Throws
 * when the key is not on the curve.
 */
export const publicKeyPoint = (publicKey: Hex): PublicKey =>
  limbs(Point.fromBytes(hexToBytes(publicKey)));

/**
 * `VRF.tryHashToPoint`: try-and-increment over
 * `sha256(0xfe || 0x01 || compressed key || alpha || counter || 0x00)`, reading each digest as
 * the `x` of an even-`y` point; a digest of zero or at least the field prime yields none, as
 * `EllipticCurve.isOnCurve` decides. The point and the attempts it took, or `null` past the cap.
 */
const hashToCurve = (
  publicKey: PublicKey,
  alpha: Uint8Array,
  maxIterations: number,
): { point: CurvePoint; iterations: number } | null => {
  const prefix = concatBytes(Uint8Array.of(SUITE, 0x01), encodePoint(...publicKey), alpha);
  for (let counter = 0; counter < maxIterations; counter++) {
    const digest = sha256(concatBytes(prefix, Uint8Array.of(counter, 0x00)));
    try {
      const point = Point.fromBytes(concatBytes(Uint8Array.of(0x02), digest));
      return { point, iterations: counter + 1 };
    } catch {
      // No point has this x; increment.
    }
  }
  return null;
};

/**
 * `VRF.hashPoints`: the first 16 bytes of `sha256(0xfe || 0x02 || H || Gamma || U || V || 0x00)`,
 * the points compressed.
 */
const challenge = (points: CurvePoint[]): bigint =>
  bytesToNumberBE(
    sha256(
      concatBytes(Uint8Array.of(SUITE, 0x02), ...points.map(compressed), Uint8Array.of(0x00)),
    ).subarray(0, C_BYTES),
  );

const drbg = createHmacDrbg<bigint>(32, 32, (key: Uint8Array, message: Uint8Array) =>
  hmac(sha256, key, message),
);

/**
 * RFC 9381 §5.4.2.1: the nonce RFC 6979 §3.2 derives from the secret scalar and `sha256` of the
 * compressed `H`, so a proof is a function of the key and alpha alone.
 */
const nonce = (x: bigint, h: CurvePoint): bigint => {
  const h1 = bytesToNumberBE(sha256(compressed(h))) % Q;
  return drbg(concatBytes(numberToBytesBE(x, 32), numberToBytesBE(h1, 32)), candidate => {
    const k = bytesToNumberBE(candidate);
    return k > 0n && k < Q ? k : undefined;
  });
};

/**
 * Proves `alpha` (the request id) under the enclave key. Deterministic: RFC 6979 fixes the nonce.
 * Throws when `alpha` has no curve point within the on-chain cap; the fulfiller submits the
 * sentinel for such a request (see `isFulfillable`).
 */
export const prove = ({ privateKey, alpha }: { privateKey: Hex; alpha: Hex }): Proof => {
  const x = bytesToNumberBE(hexToBytes(privateKey));
  const publicKey = G.multiply(x);
  const hashed = hashToCurve(limbs(publicKey), hexToBytes(alpha), HASH_TO_CURVE_MAX_ITERATIONS);
  if (hashed === null) throw new Error('ECVRF alpha has no curve point within the on-chain cap');
  const h = hashed.point;
  const gamma = h.multiply(x);
  const k = nonce(x, h);
  const c = challenge([h, gamma, G.multiply(k), h.multiply(k)]);
  return [...limbs(gamma), c, (k + c * x) % Q];
};

/**
 * Whether `proof` proves `alpha` under `publicKey`, as `ECVRFVerifier.verify` decides: gamma must
 * be a curve point with the `y` as submitted (the router multiplies it as given), `c` must fit 16
 * bytes, `s` must be below the group order, and `alpha` must hash to a point within the cap.
 */
export const verify = ({
  publicKey,
  proof,
  alpha,
}: {
  publicKey: PublicKey;
  proof: Proof;
  alpha: Hex;
}): boolean => {
  const [gammaX, gammaY, c, s] = proof;
  if (c >= C_LIMIT || s >= Q) return false;
  try {
    const y = point(publicKey);
    const gamma = point([gammaX, gammaY]);
    const hashed = hashToCurve(publicKey, hexToBytes(alpha), HASH_TO_CURVE_MAX_ITERATIONS);
    if (hashed === null) return false;
    const h = hashed.point;
    // U = s·G − c·Y and V = s·H − c·Gamma, over public scalars.
    const u = G.mulAddUnsafe(s, y.negate(), c);
    const v = h.mulAddUnsafe(s, gamma.negate(), c);
    return challenge([h, gamma, u, v]) === c;
  } catch {
    return false;
  }
};

/**
 * The 81-byte RFC 9381 proof string: compressed gamma, `c` in 16 bytes, `s` in 32. Throws when
 * a scalar does not fit.
 */
export const encodeProof = ([gammaX, gammaY, c, s]: Proof): Hex =>
  bytesToHex(
    concatBytes(encodePoint(gammaX, gammaY), numberToBytesBE(c, C_BYTES), numberToBytesBE(s, 32)),
  );

/** The router's four limbs from an RFC 9381 proof string. Throws when the string is malformed. */
export const decodeProof = (encoded: Hex): Proof => {
  const proof = hexToBytes(encoded);
  if (proof.length !== PROOF_BYTES) throw new Error('ECVRF proof must be 81 bytes');
  // Throws when gamma is not on the curve.
  const gamma = Point.fromBytes(proof.subarray(0, 33));
  const c = bytesToNumberBE(proof.subarray(33, 33 + C_BYTES));
  const s = bytesToNumberBE(proof.subarray(33 + C_BYTES));
  if (s >= Q) throw new Error('ECVRF proof scalar s must be below the group order');
  return [...limbs(gamma), c, s];
};

/**
 * The randomness a proof yields, as `VRF.gammaToHash` derives it: sha256 of the suite byte,
 * `0x03`, the compressed gamma, and a zero byte. Zero for the sentinel, as the router emits it.
 */
export const deriveRandomness = (proof: Proof): Hex =>
  isSentinel(proof)
    ? zeroHash
    : bytesToHex(
        sha256(
          concatBytes(
            Uint8Array.of(SUITE, 0x03),
            encodePoint(proof[0], proof[1]),
            Uint8Array.of(0),
          ),
        ),
      );

/** What the enclave signs over: `keccak256(abi.encode(proof))` in the router. */
export const proofCommitment = (proof: Proof): Hex =>
  keccak256(encodeAbiParameters([{ type: 'uint256[4]' }], [proof]));

/**
 * The try-and-increment attempts `VRF.tryHashToPoint` needs to hash `alpha` to a point for
 * `publicKey`, or `null` when none is found within `maxIterations`: such a request cannot be
 * proven and is closed with the sentinel.
 */
export const hashToCurveIterations = (
  publicKey: PublicKey,
  alpha: Hex,
  maxIterations = HASH_TO_CURVE_MAX_ITERATIONS,
): number | null => hashToCurve(publicKey, hexToBytes(alpha), maxIterations)?.iterations ?? null;

/** Whether the on-chain verifier can hash `alpha` to a point for `publicKey`. */
export const isFulfillable = (
  publicKey: PublicKey,
  alpha: Hex,
  maxIterations = HASH_TO_CURVE_MAX_ITERATIONS,
): boolean => hashToCurveIterations(publicKey, alpha, maxIterations) !== null;
