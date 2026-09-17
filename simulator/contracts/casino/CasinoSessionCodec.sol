// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Mirror of packages/contracts/contracts/Casino/CasinoSessionCodec.sol in the chain repo, so the harness
// commits and echoes byte-identical session snapshots. Keep in sync with upstream.
// The only deviation: OpenZeppelin's SafeCast is replaced by the range checks below so the
// harness compiles with solc alone.

import { SessionPhase } from '../ICasinoGameV2.sol';
import { CasinoSession } from './CasinoSession.sol';

/// @notice Compact big-endian encoding of a `CasinoSession`. The bytes are emitted on every step,
///         echoed back as calldata and hashed three times per round, so every byte costs ~30 gas;
///         packing the fixed fields into 235 bytes (vs 640 ABI-encoded) is worth a hand-rolled codec.
///
/// Layout (offsets in bytes):
///   0   uint64  sessionId
///   8   address player
///   28  address vault
///   48  address game
///   68  address token
///   88  uint128 wagerBase
///   104 uint128 escrowedStake
///   120 uint128 reservedProfit
///   136 uint128 maxEscrowStake
///   152 uint128 maxReservedProfit
///   168 uint40  deadlineBlock
///   173 uint32  step
///   177 uint8   phase
///   178 uint128 riskMaxPayout
///   194 uint64  riskProbabilityWad
///   202 uint256 riskSubVarianceScaled
///   234 uint8   flags (bit0 heavyTail, bit1 highMultiplierFloor)
///   235 uint16  gameData length, then gameData
///   ... uint16  gameState length, then gameState
library CasinoSessionCodec {
  uint256 private constant FIXED_LENGTH = 235;
  uint8 private constant FLAG_HEAVY_TAIL = 1;
  uint8 private constant FLAG_HIGH_MULTIPLIER_FLOOR = 2;

  error CasinoSessionCodec__InvalidLength();

  function encode(CasinoSession memory s) internal pure returns (bytes memory) {
    uint8 flags = (s.riskHeavyTail ? FLAG_HEAVY_TAIL : 0) |
      (s.riskHighMultiplierFloor ? FLAG_HIGH_MULTIPLIER_FLOOR : 0);
    return
      bytes.concat(
        abi.encodePacked(
          _toUint64(s.sessionId),
          s.player,
          s.vault,
          s.game,
          s.token,
          _toUint128(s.wagerBase),
          _toUint128(s.escrowedStake),
          _toUint128(s.reservedProfit),
          _toUint128(s.maxEscrowStake),
          _toUint128(s.maxReservedProfit)
        ),
        abi.encodePacked(
          _toUint40(s.deadlineBlock),
          s.step,
          uint8(s.phase),
          _toUint128(s.riskMaxPayout),
          _toUint64(s.riskProbabilityWad),
          s.riskSubVarianceScaled,
          flags,
          _toUint16(s.gameData.length),
          s.gameData,
          _toUint16(s.gameState.length),
          s.gameState
        )
      );
  }

  function decode(bytes calldata data) internal pure returns (CasinoSession memory s) {
    if (data.length < FIXED_LENGTH + 4) {
      revert CasinoSessionCodec__InvalidLength();
    }
    s.sessionId = uint64(bytes8(data[0:8]));
    s.player = address(bytes20(data[8:28]));
    s.vault = address(bytes20(data[28:48]));
    s.game = address(bytes20(data[48:68]));
    s.token = address(bytes20(data[68:88]));
    s.wagerBase = uint128(bytes16(data[88:104]));
    s.escrowedStake = uint128(bytes16(data[104:120]));
    s.reservedProfit = uint128(bytes16(data[120:136]));
    s.maxEscrowStake = uint128(bytes16(data[136:152]));
    s.maxReservedProfit = uint128(bytes16(data[152:168]));
    s.deadlineBlock = uint40(bytes5(data[168:173]));
    s.step = uint32(bytes4(data[173:177]));
    s.phase = SessionPhase(uint8(data[177]));
    s.riskMaxPayout = uint128(bytes16(data[178:194]));
    s.riskProbabilityWad = uint64(bytes8(data[194:202]));
    s.riskSubVarianceScaled = uint256(bytes32(data[202:234]));
    uint8 flags = uint8(data[234]);
    s.riskHeavyTail = flags & FLAG_HEAVY_TAIL != 0;
    s.riskHighMultiplierFloor = flags & FLAG_HIGH_MULTIPLIER_FLOOR != 0;

    uint256 offset = FIXED_LENGTH;
    uint256 gameDataLength = uint16(bytes2(data[offset:offset + 2]));
    offset += 2;
    if (data.length < offset + gameDataLength + 2) {
      revert CasinoSessionCodec__InvalidLength();
    }
    s.gameData = data[offset:offset + gameDataLength];
    offset += gameDataLength;
    uint256 gameStateLength = uint16(bytes2(data[offset:offset + 2]));
    offset += 2;
    if (data.length != offset + gameStateLength) {
      revert CasinoSessionCodec__InvalidLength();
    }
    s.gameState = data[offset:offset + gameStateLength];
  }

  error CasinoSessionCodec__ValueOutOfRange(uint256 value, uint8 bits);

  function _toUint128(uint256 value) private pure returns (uint128) {
    if (value > type(uint128).max) revert CasinoSessionCodec__ValueOutOfRange(value, 128);
    return uint128(value);
  }

  function _toUint64(uint256 value) private pure returns (uint64) {
    if (value > type(uint64).max) revert CasinoSessionCodec__ValueOutOfRange(value, 64);
    return uint64(value);
  }

  function _toUint40(uint256 value) private pure returns (uint40) {
    if (value > type(uint40).max) revert CasinoSessionCodec__ValueOutOfRange(value, 40);
    return uint40(value);
  }

  function _toUint16(uint256 value) private pure returns (uint16) {
    if (value > type(uint16).max) revert CasinoSessionCodec__ValueOutOfRange(value, 16);
    return uint16(value);
  }
}
