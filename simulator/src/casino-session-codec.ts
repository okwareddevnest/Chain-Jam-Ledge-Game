// Mirror of packages/contracts/helpers/casino-session-codec.ts in the chain repo — the
// TypeScript twin of CasinoSessionCodec.sol. Keep in sync with upstream.
type Hex = `0x${string}`;

export const CASINO_SESSION_PHASE = {
  NONE: 0,
  WAITING_RANDOMNESS: 1,
  WAITING_PLAYER_ACTION: 2,
  SETTLED: 3,
  FORFEITED: 4,
  CANCELLED: 5,
} as const;

/**
 * A decoded `CasinoSession` (contracts/Casino/CasinoSession.sol). Integers are
 * decimal strings and addresses are lowercased so the shape can be stored in
 * read models as-is.
 */
export type CasinoSessionSnapshot = {
  sessionId: string;
  player: Hex;
  vault: Hex;
  game: Hex;
  token: Hex;
  wagerBase: string;
  escrowedStake: string;
  reservedProfit: string;
  maxEscrowStake: string;
  maxReservedProfit: string;
  /** Action deadline while waiting for the player, randomness deadline while waiting for VRF. */
  deadlineBlock: string;
  step: number;
  phase: number;
  riskMaxPayout: string;
  riskProbabilityWad: string;
  riskSubVarianceScaled: string;
  riskHeavyTail: boolean;
  riskHighMultiplierFloor: boolean;
  gameData: Hex;
  gameState: Hex;
};

export class CasinoSessionCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CasinoSessionCodecError';
  }
}

const FIXED_LENGTH = 235;
const FLAG_HEAVY_TAIL = 1;
const FLAG_HIGH_MULTIPLIER_FLOOR = 2;

const WIDTH = {
  uint8: 1,
  uint16: 2,
  uint32: 4,
  uint40: 5,
  uint64: 8,
  uint128: 16,
  uint256: 32,
  address: 20,
} as const;

class HexReader {
  private offset = 0;

  constructor(private readonly hex: string) {}

  get remaining(): number {
    return this.hex.length / 2 - this.offset;
  }

  take(byteLength: number): string {
    if (byteLength > this.remaining) {
      throw new CasinoSessionCodecError('Encoded session is truncated');
    }
    const slice = this.hex.slice(this.offset * 2, (this.offset + byteLength) * 2);
    this.offset += byteLength;
    return slice;
  }

  uint(byteLength: number): bigint {
    return BigInt(`0x${this.take(byteLength)}`);
  }

  address(): Hex {
    return `0x${this.take(WIDTH.address)}`;
  }

  bytes(): Hex {
    const length = Number(this.uint(WIDTH.uint16));
    return `0x${this.take(length)}`;
  }
}

function stripHexPrefix(value: string, label: string): string {
  const bytes = value.startsWith('0x') ? value.slice(2) : value;
  if (bytes.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(bytes)) {
    throw new CasinoSessionCodecError(`${label} is not valid hex`);
  }
  return bytes.toLowerCase();
}

/** Mirrors `CasinoSessionCodec.decode`; throws on any length mismatch, like the contract. */
export function decodeCasinoSession(encoded: string): CasinoSessionSnapshot {
  const bytes = stripHexPrefix(encoded, 'Encoded session');
  if (bytes.length / 2 < FIXED_LENGTH + 4) {
    throw new CasinoSessionCodecError('Encoded session is shorter than the fixed layout');
  }
  const reader = new HexReader(bytes);
  const sessionId = reader.uint(WIDTH.uint64).toString();
  const player = reader.address();
  const vault = reader.address();
  const game = reader.address();
  const token = reader.address();
  const wagerBase = reader.uint(WIDTH.uint128).toString();
  const escrowedStake = reader.uint(WIDTH.uint128).toString();
  const reservedProfit = reader.uint(WIDTH.uint128).toString();
  const maxEscrowStake = reader.uint(WIDTH.uint128).toString();
  const maxReservedProfit = reader.uint(WIDTH.uint128).toString();
  const deadlineBlock = reader.uint(WIDTH.uint40).toString();
  const step = Number(reader.uint(WIDTH.uint32));
  const phase = Number(reader.uint(WIDTH.uint8));
  const riskMaxPayout = reader.uint(WIDTH.uint128).toString();
  const riskProbabilityWad = reader.uint(WIDTH.uint64).toString();
  const riskSubVarianceScaled = reader.uint(WIDTH.uint256).toString();
  const flags = Number(reader.uint(WIDTH.uint8));
  const gameData = reader.bytes();
  const gameState = reader.bytes();
  if (reader.remaining !== 0) {
    throw new CasinoSessionCodecError('Encoded session has trailing bytes');
  }
  return {
    sessionId,
    player,
    vault,
    game,
    token,
    wagerBase,
    escrowedStake,
    reservedProfit,
    maxEscrowStake,
    maxReservedProfit,
    deadlineBlock,
    step,
    phase,
    riskMaxPayout,
    riskProbabilityWad,
    riskSubVarianceScaled,
    riskHeavyTail: (flags & FLAG_HEAVY_TAIL) !== 0,
    riskHighMultiplierFloor: (flags & FLAG_HIGH_MULTIPLIER_FLOOR) !== 0,
    gameData,
    gameState,
  };
}

function uintHex(value: bigint | number | string, byteLength: number, label: string): string {
  const big = BigInt(value);
  if (big < 0n || big >= 1n << BigInt(byteLength * 8)) {
    throw new CasinoSessionCodecError(`${label} does not fit in ${byteLength} bytes`);
  }
  return big.toString(16).padStart(byteLength * 2, '0');
}

function addressHex(value: string, label: string): string {
  const bytes = stripHexPrefix(value, label);
  if (bytes.length !== WIDTH.address * 2) {
    throw new CasinoSessionCodecError(`${label} is not a 20-byte address`);
  }
  return bytes;
}

function lengthPrefixedHex(value: string, label: string): string {
  const bytes = stripHexPrefix(value, label);
  return uintHex(bytes.length / 2, WIDTH.uint16, `${label} length`) + bytes;
}

/** Mirrors `CasinoSessionCodec.encode`; the inverse of {@link decodeCasinoSession}. */
export function encodeCasinoSession(session: CasinoSessionSnapshot): Hex {
  const flags =
    (session.riskHeavyTail ? FLAG_HEAVY_TAIL : 0) |
    (session.riskHighMultiplierFloor ? FLAG_HIGH_MULTIPLIER_FLOOR : 0);
  return `0x${[
    uintHex(session.sessionId, WIDTH.uint64, 'sessionId'),
    addressHex(session.player, 'player'),
    addressHex(session.vault, 'vault'),
    addressHex(session.game, 'game'),
    addressHex(session.token, 'token'),
    uintHex(session.wagerBase, WIDTH.uint128, 'wagerBase'),
    uintHex(session.escrowedStake, WIDTH.uint128, 'escrowedStake'),
    uintHex(session.reservedProfit, WIDTH.uint128, 'reservedProfit'),
    uintHex(session.maxEscrowStake, WIDTH.uint128, 'maxEscrowStake'),
    uintHex(session.maxReservedProfit, WIDTH.uint128, 'maxReservedProfit'),
    uintHex(session.deadlineBlock, WIDTH.uint40, 'deadlineBlock'),
    uintHex(session.step, WIDTH.uint32, 'step'),
    uintHex(session.phase, WIDTH.uint8, 'phase'),
    uintHex(session.riskMaxPayout, WIDTH.uint128, 'riskMaxPayout'),
    uintHex(session.riskProbabilityWad, WIDTH.uint64, 'riskProbabilityWad'),
    uintHex(session.riskSubVarianceScaled, WIDTH.uint256, 'riskSubVarianceScaled'),
    uintHex(flags, WIDTH.uint8, 'flags'),
    lengthPrefixedHex(session.gameData, 'gameData'),
    lengthPrefixedHex(session.gameState, 'gameState'),
  ].join('')}`;
}
