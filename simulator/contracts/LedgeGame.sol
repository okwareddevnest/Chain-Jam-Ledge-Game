// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ICasinoGameV2, SessionContext, SessionPhase, StepResult} from "./ICasinoGameV2.sol";

/// @title LEDGE — topple the piles on the ledge.
/// @notice Five priced piles, five coins. The player spreads the coins across the lanes;
///         each used lane topples independently. Instant settle: one randomness request.
/// @dev Declared theoretical RTP is exactly 96% for every one of the 126 allocations,
///      because PRIZE(i) * BASE(i) is the same constant on every lane. See DESIGN.md.
contract LedgeGame is ICasinoGameV2 {
    error LedgeGame__InvalidAllocation();
    error LedgeGame__NoPlayerAction();

    uint256 internal constant LANE_COUNT = 5;
    uint256 internal constant N_COINS = 5;

    /// @dev Denominator every topple threshold is expressed over.
    uint256 internal constant PROB_DENOM = 375_000;

    /// @dev floor(2**24 / PROB_DENOM) * PROB_DENOM. Draws at or above this are rejected so
    ///      the low end of the range is not over-represented. Never `% n` a raw byte.
    uint256 internal constant DRAW_LIMIT = 16_500_000;

    uint256 internal constant DRAW_BYTES = 3;
    uint256 internal constant SEED_BYTES = 32;

    uint256 internal constant RTP_NUMERATOR = 24;
    uint256 internal constant RTP_DENOMINATOR = 25;
    uint256 internal constant WAD = 1e18;

    // --- paytable -----------------------------------------------------------------
    // Solidity has no constant arrays, so the table lives in two pure functions.
    // Invariant, asserted in the TypeScript mirror: _prize(i) * _base(i) == 72000 for all i.

    function _prize(uint256 lane) internal pure returns (uint256) {
        if (lane == 0) return 1;
        if (lane == 1) return 2;
        if (lane == 2) return 5;
        if (lane == 3) return 15;
        return 50;
    }

    function _base(uint256 lane) internal pure returns (uint256) {
        if (lane == 0) return 72_000;
        if (lane == 1) return 36_000;
        if (lane == 2) return 14_400;
        if (lane == 3) return 4_800;
        return 1_440;
    }

    function _threshold(uint256 lane, uint256 coins) internal pure returns (uint256) {
        return _base(lane) * coins;
    }

    // --- allocation ---------------------------------------------------------------

    function _decodeAllocation(bytes memory gameData)
        internal
        pure
        returns (uint8[5] memory allocation)
    {
        allocation = abi.decode(gameData, (uint8[5]));

        uint256 total;
        for (uint256 lane; lane < LANE_COUNT; ++lane) {
            total += allocation[lane];
        }
        if (total != N_COINS) revert LedgeGame__InvalidAllocation();
    }

    function _usedMultiplierSum(uint8[5] memory allocation) internal pure returns (uint256 sum) {
        for (uint256 lane; lane < LANE_COUNT; ++lane) {
            if (allocation[lane] > 0) sum += _prize(lane);
        }
    }

    // --- the single payout path ----------------------------------------------------
    // quoteCaps, quoteRiskParams, onSessionStart and onRandomness all route through these
    // two functions, so the reserve and the settled payout can never disagree by a base
    // unit (CONTRACT_CONSTRAINTS.md: "Route ... through one payout function").

    function _maxPayout(uint256 wager, uint8[5] memory allocation) internal pure returns (uint256) {
        return wager * _usedMultiplierSum(allocation);
    }

    function _maxReservedProfit(uint256 wager, uint8[5] memory allocation)
        internal
        pure
        returns (uint256)
    {
        uint256 ceiling = _maxPayout(wager, allocation);
        return ceiling > wager ? ceiling - wager : 0;
    }

    /// @dev Probability of the single highest-paying outcome (every used lane topples),
    ///      not any-win. Truncating division keeps the quote just under the true value.
    function _topOutcomeProbabilityWad(uint8[5] memory allocation)
        internal
        pure
        returns (uint256 probabilityWad)
    {
        probabilityWad = WAD;
        for (uint256 lane; lane < LANE_COUNT; ++lane) {
            uint256 coins = allocation[lane];
            if (coins == 0) continue;
            probabilityWad = (probabilityWad * _threshold(lane, coins)) / PROB_DENOM;
        }
        if (probabilityWad > WAD) probabilityWad = WAD;
    }

    // --- randomness -----------------------------------------------------------------

    /// @dev Reads 3 bytes per draw, rejects at or above DRAW_LIMIT, re-hashes the seed when
    ///      it runs out. Byte-identical to `createDrawStream` in src/lib/ledge.ts.
    function _nextDraw(bytes32 seed, uint256 index)
        internal
        pure
        returns (uint256 draw, bytes32 nextSeed, uint256 nextIndex)
    {
        while (true) {
            if (index + DRAW_BYTES <= SEED_BYTES) {
                uint256 value = (uint256(uint8(seed[index])) << 16)
                    | (uint256(uint8(seed[index + 1])) << 8)
                    | uint256(uint8(seed[index + 2]));
                index += DRAW_BYTES;

                if (value < DRAW_LIMIT) {
                    return (value % PROB_DENOM, seed, index);
                }
                continue;
            }
            seed = keccak256(abi.encodePacked(seed));
            index = 0;
        }

        revert LedgeGame__InvalidAllocation(); // unreachable; satisfies the compiler
    }

    function _resolve(uint8[5] memory allocation, bytes32 randomness)
        internal
        pure
        returns (bool[5] memory toppled, uint256 multiplier)
    {
        bytes32 seed = randomness;
        uint256 index;

        for (uint256 lane; lane < LANE_COUNT; ++lane) {
            uint256 coins = allocation[lane];
            if (coins == 0) continue;

            uint256 draw;
            (draw, seed, index) = _nextDraw(seed, index);

            if (draw < _threshold(lane, coins)) {
                toppled[lane] = true;
                multiplier += _prize(lane);
            }
        }
    }

    // --- ICasinoGameV2 ----------------------------------------------------------------

    function quoteCaps(uint256 wager, bytes calldata gameData)
        external
        pure
        returns (uint256 maxEscrowStake, uint256 maxReservedProfit)
    {
        uint8[5] memory allocation = _decodeAllocation(gameData);

        maxEscrowStake = wager;
        maxReservedProfit = _maxReservedProfit(wager, allocation);
    }

    function quoteRiskParams(uint256 wager, bytes calldata gameData)
        external
        pure
        returns (
            uint256 maxPayout,
            uint256 probabilityWad,
            uint256 expectedPayout,
            uint256 subJackpotVarianceScaled
        )
    {
        uint8[5] memory allocation = _decodeAllocation(gameData);

        maxPayout = _maxPayout(wager, allocation);
        probabilityWad = _topOutcomeProbabilityWad(allocation);
        expectedPayout = (wager * RTP_NUMERATOR) / RTP_DENOMINATOR;

        // Max multiplier is 73x at worst, below the 100x heavy-tail threshold, so the
        // tiered jackpot reserve path never engages and no sub-jackpot variance is needed.
        subJackpotVarianceScaled = 0;
    }

    function onSessionStart(SessionContext calldata ctx)
        external
        pure
        returns (StepResult memory stepResult)
    {
        uint8[5] memory allocation = _decodeAllocation(ctx.gameData);
        bool[5] memory untoppled;

        stepResult.newGameState = abi.encode(allocation, untoppled, uint256(0));
        stepResult.escrowDelta = 0;
        stepResult.reservedProfitDelta = int256(_maxReservedProfit(ctx.wagerBase, allocation));
        stepResult.nextPhase = SessionPhase.WAITING_RANDOMNESS;
        stepResult.requestRandomnessNow = true;
        stepResult.payout = 0;
    }

    function onRandomness(SessionContext calldata ctx, bytes32 randomness)
        external
        pure
        returns (StepResult memory stepResult)
    {
        uint8[5] memory allocation = _decodeAllocation(ctx.gameData);
        (bool[5] memory toppled, uint256 multiplier) = _resolve(allocation, randomness);

        uint256 payout = ctx.wagerBase * multiplier;

        stepResult.newGameState = abi.encode(allocation, toppled, payout);
        stepResult.escrowDelta = 0;

        // Must stay 0: the facet releases the reserve at settlement, and releasing it here
        // would drop the payout cap to the stake and revert every win above 1x.
        stepResult.reservedProfitDelta = 0;

        stepResult.nextPhase = SessionPhase.SETTLED;
        stepResult.requestRandomnessNow = false;
        stepResult.payout = payout;
    }

    /// @notice LEDGE resolves in a single step; there are no mid-round moves.
    function onPlayerAction(SessionContext calldata, bytes calldata)
        external
        pure
        returns (StepResult memory)
    {
        revert LedgeGame__NoPlayerAction();
    }

    /// @notice Nothing is cashable mid-round: the session never reaches WAITING_PLAYER_ACTION.
    function quoteForfeitPayout(SessionContext calldata)
        external
        pure
        returns (uint256 cashoutValue)
    {
        return 0;
    }
}
