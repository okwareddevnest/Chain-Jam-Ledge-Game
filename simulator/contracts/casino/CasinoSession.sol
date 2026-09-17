// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Mirror of packages/contracts/contracts/Casino/CasinoSession.sol in the chain repo, so the harness
// commits and echoes byte-identical session snapshots. Keep in sync with upstream.

import { SessionPhase } from '../ICasinoGameV2.sol';

/// @notice The full state of an open casino session. It is never stored: the
///         facet keeps `keccak256(abi.encode(session))` per session id, emits
///         the encoded bytes on every step and takes them back as calldata
///         (from the player, the keeper or the Verify Network node echo).
struct CasinoSession {
  uint256 sessionId;
  address player;
  address vault;
  address game;
  address token;
  uint256 wagerBase;
  uint256 escrowedStake;
  uint256 reservedProfit;
  uint256 maxEscrowStake;
  uint256 maxReservedProfit;
  /// @dev Action deadline while waiting for the player, randomness deadline while waiting for VRF.
  uint256 deadlineBlock;
  uint32 step;
  SessionPhase phase;
  uint256 riskMaxPayout;
  uint256 riskProbabilityWad;
  uint256 riskSubVarianceScaled;
  bool riskHeavyTail;
  bool riskHighMultiplierFloor;
  bytes gameData;
  bytes gameState;
}
