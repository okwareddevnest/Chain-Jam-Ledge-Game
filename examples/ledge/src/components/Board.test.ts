import { describe, expect, it } from 'vitest';

import { laneStateFor } from './Board';
import type { ActiveRound } from '../lib/useLedgeRound';

const round = (patch: Partial<ActiveRound>): ActiveRound => ({
  phase: 'settled',
  allocation: [5, 0, 0, 0, 0],
  wager: 1n,
  sessionId: null,
  toppled: [true, false, false, false, false],
  payout: 1n,
  revealedLanes: 5,
  message: null,
  ...patch,
});

describe('laneStateFor', () => {
  it('gives no verdict to a lane the player never used', () => {
    const settled = round({});

    expect(laneStateFor(settled, 1)).toBe('idle');
    expect(laneStateFor(settled, 4)).toBe('idle');
  });

  it('reports the verdict for lanes the player did use', () => {
    const settled = round({
      allocation: [1, 0, 0, 0, 4],
      toppled: [true, false, false, false, false],
    });

    expect(laneStateFor(settled, 0)).toBe('toppled');
    expect(laneStateFor(settled, 4)).toBe('held');
  });

  it('marks the lane currently resolving as deciding', () => {
    const midCascade = round({
      allocation: [1, 0, 0, 0, 4],
      revealedLanes: 4,
      phase: 'revealing',
    });

    expect(laneStateFor(midCascade, 0)).toBe('toppled');
    expect(laneStateFor(midCascade, 4)).toBe('deciding');
  });

  it('shows nothing before a bet is resolved', () => {
    expect(laneStateFor(round({ toppled: null }), 0)).toBe('idle');
  });
});
