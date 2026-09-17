// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ICasinoGameV2, SessionContext, SessionPhase, StepResult } from './ICasinoGameV2.sol';
import { CasinoSession } from './casino/CasinoSession.sol';
import { CasinoSessionCodec } from './casino/CasinoSessionCodec.sol';

interface IVerifyNetworkRouter {
  function requestRandomness(bytes calldata clientData) external returns (bytes32 requestId);
}

interface IERC20Minimal {
  function transfer(address to, uint256 amount) external returns (bool);
  function transferFrom(address from, address to, uint256 amount) external returns (bool);
  function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice Trivial liquidity pool standing in for the production ERC4626 vault:
///         it holds the house funds and lets the host move them for payouts.
contract LocalCasinoVault {
  address public immutable asset;

  constructor(address token, address host) {
    asset = token;
    IERC20Minimal(token).approve(host, type(uint256).max);
  }
}

/**
 * @notice Minimal stand-in for the production CasinoGameFacet, for testing
 *         ICasinoGameV2 games locally. It reproduces the facet's stateless
 *         session lifecycle — only a hash of each session is stored, the
 *         encoded snapshot is emitted on every step and echoed back by the
 *         player, the keeper and the Verify Network node — and emits
 *         byte-identical events (off-chain decoders rely on the exact shape),
 *         but drops everything a local harness doesn't need: the diamond,
 *         access control, portfolio risk accounting, min/max bet policies and
 *         fee accounting. This host is its own Verify Network router client —
 *         fund it via router.depositClientBalance(host).
 */
contract LocalCasinoHost {
  // Same defaults as the production facet.
  uint256 public constant ACTION_TIMEOUT_BLOCKS = 43200;
  uint256 public constant RANDOMNESS_TIMEOUT_BLOCKS = 15;
  uint256 private constant WAD = 1e18;
  uint16 private constant BASIS_POINTS = 10_000;
  uint16 private constant FORFEIT_WINNINGS_CUT_BPS = 1_000;
  uint256 private constant FORFEIT_QUOTE_GAS_LIMIT = 400_000;

  IVerifyNetworkRouter public immutable router;
  address public immutable token;
  address public immutable vault;
  uint256 public currentSessionId;

  mapping(uint256 => bytes32) private sessionCommitments;
  mapping(address => string) public gameNames;

  // Events identical to the production CasinoGameFacet — decoders rely on the exact shape.
  event GameWhitelistUpdated(address indexed game, bool whitelisted, string gameName);
  event CasinoSessionOpened(
    uint256 indexed sessionId,
    address indexed game,
    address indexed player,
    address vault,
    uint256 wager
  );
  event CasinoSessionAdvanced(
    uint256 indexed sessionId,
    uint32 indexed step,
    bytes32 requestId,
    bytes32 randomness,
    bytes session
  );
  event CasinoSessionSettled(
    uint256 indexed sessionId,
    address indexed game,
    address indexed player,
    SessionPhase phase,
    uint256 payout,
    bytes32 randomness,
    bytes gameState
  );

  error LocalCasinoHost__InvalidWager();
  error LocalCasinoHost__UnsupportedVault(address vault);
  error LocalCasinoHost__GameNotRegistered(address game);
  error LocalCasinoHost__InvalidSessionCaps(uint256 wager, uint256 maxEscrowStake);
  error LocalCasinoHost__InvalidRiskProbability();
  error LocalCasinoHost__SessionMismatch(uint256 sessionId);
  error LocalCasinoHost__InvalidSessionPhase(uint256 sessionId, SessionPhase expected, SessionPhase actual);
  error LocalCasinoHost__NotSessionPlayer(uint256 sessionId, address caller);
  error LocalCasinoHost__ActionDeadlinePassed(uint256 sessionId, uint256 deadlineBlock);
  error LocalCasinoHost__ActionDeadlineNotPassed(uint256 sessionId, uint256 deadlineBlock);
  error LocalCasinoHost__RandomnessDeadlineNotPassed(uint256 sessionId, uint256 deadlineBlock);
  error LocalCasinoHost__OnlyRouter(address caller);
  error LocalCasinoHost__InvalidProviderRandomness();
  error LocalCasinoHost__InvalidRandomnessRequestId();
  error LocalCasinoHost__EscrowIncreaseNotAllowed();
  error LocalCasinoHost__EscrowUnderflow(uint256 currentEscrow, uint256 decreaseAmount);
  error LocalCasinoHost__ReservedProfitUnderflow(uint256 currentReservedProfit, uint256 decreaseAmount);
  error LocalCasinoHost__EscrowCapExceeded(uint256 escrowedStake, uint256 maxEscrowStake);
  error LocalCasinoHost__ReservedProfitCapExceeded(uint256 reservedProfit, uint256 maxReservedProfit);
  error LocalCasinoHost__InvalidStepTransition(SessionPhase nextPhase, bool requestRandomnessNow);
  error LocalCasinoHost__InvalidPayout(uint256 maxAllowedPayout, uint256 payout);

  constructor(address token_, address router_) {
    token = token_;
    router = IVerifyNetworkRouter(router_);
    vault = address(new LocalCasinoVault(token_, address(this)));
  }

  /// @notice Local-only, permissionless stand-in for the security-council whitelist.
  function registerGame(address game, string calldata gameName) external {
    gameNames[game] = gameName;
    emit GameWhitelistUpdated(game, true, gameName);
  }

  function getGameName(address game) external view returns (string memory gameName) {
    return gameNames[game];
  }

  function getSessionCommitment(uint256 sessionId) external view returns (bytes32) {
    return sessionCommitments[sessionId];
  }

  function decodeSession(bytes calldata encodedSession) external pure returns (CasinoSession memory) {
    return CasinoSessionCodec.decode(encodedSession);
  }

  function encodeSession(CasinoSession calldata session) external pure returns (bytes memory) {
    return CasinoSessionCodec.encode(session);
  }

  function openSession(
    address game,
    address vault_,
    uint256 wager,
    bytes calldata gameData
  ) external returns (uint256 sessionId, bytes32 requestId) {
    if (wager == 0) revert LocalCasinoHost__InvalidWager();
    if (vault_ != vault) revert LocalCasinoHost__UnsupportedVault(vault_);
    if (bytes(gameNames[game]).length == 0) revert LocalCasinoHost__GameNotRegistered(game);

    CasinoSession memory session;
    session.player = msg.sender;
    session.vault = vault;
    session.game = game;
    session.token = token;
    session.wagerBase = wager;
    session.escrowedStake = wager;
    session.gameData = gameData;

    (session.maxEscrowStake, session.maxReservedProfit) = ICasinoGameV2(game).quoteCaps(wager, gameData);
    if (session.maxEscrowStake < wager) {
      revert LocalCasinoHost__InvalidSessionCaps(wager, session.maxEscrowStake);
    }
    // Keep games honest about the production risk interface even though the
    // harness runs no portfolio accounting (the heavy-tail flags stay unset).
    (session.riskMaxPayout, session.riskProbabilityWad, , session.riskSubVarianceScaled) = ICasinoGameV2(game)
      .quoteRiskParams(wager, gameData);
    if (session.riskProbabilityWad > WAD) revert LocalCasinoHost__InvalidRiskProbability();

    IERC20Minimal(token).transferFrom(msg.sender, address(this), wager);

    sessionId = ++currentSessionId;
    session.sessionId = sessionId;
    emit CasinoSessionOpened(sessionId, game, msg.sender, vault, wager);

    StepResult memory stepResult = ICasinoGameV2(game).onSessionStart(_toSessionContext(session));
    requestId = _processStepResult(session, stepResult, true, bytes32(0));
  }

  function submitAction(
    bytes calldata encodedSession,
    bytes calldata actionData
  ) external returns (bytes32 requestId) {
    CasinoSession memory session = _loadSession(encodedSession);
    _requireSessionPhase(session, SessionPhase.WAITING_PLAYER_ACTION);
    if (session.player != msg.sender) {
      revert LocalCasinoHost__NotSessionPlayer(session.sessionId, msg.sender);
    }
    if (block.number > session.deadlineBlock) {
      revert LocalCasinoHost__ActionDeadlinePassed(session.sessionId, session.deadlineBlock);
    }

    StepResult memory stepResult = ICasinoGameV2(session.game).onPlayerAction(
      _toSessionContext(session),
      actionData
    );
    requestId = _processStepResult(session, stepResult, true, bytes32(0));
  }

  /// @notice Verify Network router callback. `clientData` is the encoded session this host
  ///         handed to `requestRandomness`, already validated by the router against `requestId`.
  function onRandomnessFulfilled(
    bytes32 requestId,
    bytes32 randomness,
    bytes calldata clientData
  ) external {
    if (msg.sender != address(router)) revert LocalCasinoHost__OnlyRouter(msg.sender);
    if (randomness == bytes32(0) || requestId == bytes32(0)) {
      revert LocalCasinoHost__InvalidProviderRandomness();
    }

    CasinoSession memory session = _loadSession(clientData);
    _requireSessionPhase(session, SessionPhase.WAITING_RANDOMNESS);

    StepResult memory stepResult = ICasinoGameV2(session.game).onRandomness(
      _toSessionContext(session),
      randomness
    );
    _processStepResult(session, stepResult, false, randomness);
  }

  function forfeitExpiredSession(bytes calldata encodedSession) external returns (uint256 payout) {
    return _forfeitExpiredSession(encodedSession);
  }

  function forfeitExpiredSessions(bytes[] calldata encodedSessions) external {
    for (uint256 i = 0; i < encodedSessions.length; i++) {
      _forfeitExpiredSession(encodedSessions[i]);
    }
  }

  function cancelStuckRandomness(bytes calldata encodedSession) external returns (uint256 payout) {
    CasinoSession memory session = _loadSession(encodedSession);
    _requireSessionPhase(session, SessionPhase.WAITING_RANDOMNESS);
    if (block.number <= session.deadlineBlock) {
      revert LocalCasinoHost__RandomnessDeadlineNotPassed(session.sessionId, session.deadlineBlock);
    }

    payout = session.escrowedStake;
    _finalizeSession(session, SessionPhase.CANCELLED, payout, bytes32(0));
  }

  function _forfeitExpiredSession(bytes calldata encodedSession) private returns (uint256 payout) {
    CasinoSession memory session = _loadSession(encodedSession);
    _requireSessionPhase(session, SessionPhase.WAITING_PLAYER_ACTION);
    if (block.number <= session.deadlineBlock) {
      revert LocalCasinoHost__ActionDeadlineNotPassed(session.sessionId, session.deadlineBlock);
    }
    payout = _quoteForfeitPayout(session);
    _finalizeSession(session, SessionPhase.FORFEITED, payout, bytes32(0));
  }

  /// @dev Same forfeit payout rule as the production facet: the player keeps their
  ///      current cash-out value minus FORFEIT_WINNINGS_CUT_BPS, and any quote
  ///      failure (game predates quoteForfeitPayout, revert, bad return) pays 0.
  function _quoteForfeitPayout(CasinoSession memory session) private view returns (uint256 payout) {
    address game = session.game;
    bytes memory quoteCalldata = abi.encodeCall(
      ICasinoGameV2.quoteForfeitPayout,
      (_toSessionContext(session))
    );

    uint256 quote;
    bool success;
    assembly ('memory-safe') {
      let output := mload(0x40)
      success := staticcall(
        FORFEIT_QUOTE_GAS_LIMIT,
        game,
        add(quoteCalldata, 0x20),
        mload(quoteCalldata),
        output,
        0x20
      )
      if iszero(eq(returndatasize(), 0x20)) {
        success := 0
      }
      quote := mload(output)
    }
    if (!success) {
      return 0;
    }

    uint256 maxAllowedPayout = session.escrowedStake + session.reservedProfit;
    if (quote > maxAllowedPayout) {
      quote = maxAllowedPayout;
    }
    payout = (quote * (BASIS_POINTS - FORFEIT_WINNINGS_CUT_BPS)) / BASIS_POINTS;
  }

  function _processStepResult(
    CasinoSession memory session,
    StepResult memory stepResult,
    bool allowEscrowIncrease,
    bytes32 randomness
  ) private returns (bytes32 requestId) {
    _applyStepDeltas(session, stepResult, allowEscrowIncrease);

    if (session.escrowedStake > session.maxEscrowStake) {
      revert LocalCasinoHost__EscrowCapExceeded(session.escrowedStake, session.maxEscrowStake);
    }
    if (session.reservedProfit > session.maxReservedProfit) {
      revert LocalCasinoHost__ReservedProfitCapExceeded(session.reservedProfit, session.maxReservedProfit);
    }

    session.gameState = stepResult.newGameState;
    session.step += 1;

    if (stepResult.nextPhase == SessionPhase.WAITING_RANDOMNESS) {
      if (!stepResult.requestRandomnessNow) {
        revert LocalCasinoHost__InvalidStepTransition(stepResult.nextPhase, true);
      }
      session.phase = SessionPhase.WAITING_RANDOMNESS;
      session.deadlineBlock = block.number + RANDOMNESS_TIMEOUT_BLOCKS;
      bytes memory encoded = CasinoSessionCodec.encode(session);
      sessionCommitments[session.sessionId] = keccak256(encoded);
      requestId = router.requestRandomness(encoded);
      if (requestId == bytes32(0)) revert LocalCasinoHost__InvalidRandomnessRequestId();
      emit CasinoSessionAdvanced(session.sessionId, session.step, requestId, randomness, encoded);
    } else if (stepResult.nextPhase == SessionPhase.WAITING_PLAYER_ACTION) {
      if (stepResult.requestRandomnessNow) {
        revert LocalCasinoHost__InvalidStepTransition(stepResult.nextPhase, true);
      }
      session.phase = SessionPhase.WAITING_PLAYER_ACTION;
      session.deadlineBlock = block.number + ACTION_TIMEOUT_BLOCKS;
      bytes memory encoded = CasinoSessionCodec.encode(session);
      sessionCommitments[session.sessionId] = keccak256(encoded);
      emit CasinoSessionAdvanced(session.sessionId, session.step, bytes32(0), randomness, encoded);
    } else if (_isTerminalPhase(stepResult.nextPhase)) {
      if (stepResult.requestRandomnessNow) {
        revert LocalCasinoHost__InvalidStepTransition(stepResult.nextPhase, true);
      }
      _finalizeSession(session, stepResult.nextPhase, stepResult.payout, randomness);
    } else {
      revert LocalCasinoHost__InvalidStepTransition(stepResult.nextPhase, stepResult.requestRandomnessNow);
    }
  }

  function _applyStepDeltas(
    CasinoSession memory session,
    StepResult memory stepResult,
    bool allowEscrowIncrease
  ) private {
    if (stepResult.escrowDelta > 0) {
      if (!allowEscrowIncrease) revert LocalCasinoHost__EscrowIncreaseNotAllowed();
      uint256 increaseEscrow = uint256(stepResult.escrowDelta);
      IERC20Minimal(token).transferFrom(session.player, address(this), increaseEscrow);
      session.escrowedStake += increaseEscrow;
    } else if (stepResult.escrowDelta < 0) {
      uint256 decreaseEscrow = uint256(-stepResult.escrowDelta);
      if (decreaseEscrow > session.escrowedStake) {
        revert LocalCasinoHost__EscrowUnderflow(session.escrowedStake, decreaseEscrow);
      }
      session.escrowedStake -= decreaseEscrow;
      IERC20Minimal(token).transfer(session.player, decreaseEscrow);
    }

    if (stepResult.reservedProfitDelta > 0) {
      session.reservedProfit += uint256(stepResult.reservedProfitDelta);
    } else if (stepResult.reservedProfitDelta < 0) {
      uint256 decreaseReservedProfit = uint256(-stepResult.reservedProfitDelta);
      if (decreaseReservedProfit > session.reservedProfit) {
        revert LocalCasinoHost__ReservedProfitUnderflow(session.reservedProfit, decreaseReservedProfit);
      }
      session.reservedProfit -= decreaseReservedProfit;
    }
  }

  function _finalizeSession(
    CasinoSession memory session,
    SessionPhase terminalPhase,
    uint256 payout,
    bytes32 randomness
  ) private {
    uint256 escrowedStake = session.escrowedStake;
    uint256 maxAllowedPayout = escrowedStake + session.reservedProfit;
    if (payout > maxAllowedPayout) revert LocalCasinoHost__InvalidPayout(maxAllowedPayout, payout);

    delete sessionCommitments[session.sessionId];

    uint256 payoutFromEscrow = payout > escrowedStake ? escrowedStake : payout;
    uint256 payoutFromVault = payout > escrowedStake ? payout - escrowedStake : 0;
    uint256 escrowToVault = escrowedStake - payoutFromEscrow;
    address player = session.player;

    emit CasinoSessionSettled(
      session.sessionId,
      session.game,
      player,
      terminalPhase,
      payout,
      randomness,
      session.gameState
    );

    if (payoutFromEscrow > 0) IERC20Minimal(token).transfer(player, payoutFromEscrow);
    if (payoutFromVault > 0) IERC20Minimal(token).transferFrom(vault, player, payoutFromVault);
    if (escrowToVault > 0) IERC20Minimal(token).transfer(vault, escrowToVault);
  }

  function _loadSession(bytes calldata encodedSession) private view returns (CasinoSession memory session) {
    session = CasinoSessionCodec.decode(encodedSession);
    bytes32 commitment = sessionCommitments[session.sessionId];
    if (commitment == bytes32(0) || commitment != keccak256(encodedSession)) {
      revert LocalCasinoHost__SessionMismatch(session.sessionId);
    }
  }

  function _toSessionContext(CasinoSession memory session) private pure returns (SessionContext memory ctx) {
    ctx = SessionContext({
      sessionId: session.sessionId,
      player: session.player,
      vault: session.vault,
      wagerBase: session.wagerBase,
      escrowedStake: session.escrowedStake,
      reservedProfit: session.reservedProfit,
      step: session.step,
      gameData: session.gameData,
      gameState: session.gameState
    });
  }

  function _requireSessionPhase(CasinoSession memory session, SessionPhase expected) private pure {
    if (session.phase != expected) {
      revert LocalCasinoHost__InvalidSessionPhase(session.sessionId, expected, session.phase);
    }
  }

  function _isTerminalPhase(SessionPhase phase) private pure returns (bool) {
    return
      phase == SessionPhase.SETTLED || phase == SessionPhase.FORFEITED || phase == SessionPhase.CANCELLED;
  }
}
