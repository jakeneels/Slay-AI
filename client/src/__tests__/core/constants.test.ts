import { describe, it, expect } from 'vitest';
import {
  WIDTH,
  HEIGHT,
  MAX_SLOTS,
  SLOTS_PER_SIDE,
  RANGE_OPTIMAL_BONUS,
  RANGE_PENALTY_PER_SLOT,
  RANGE_MODIFIER_MIN,
  RANGE_MODIFIER_MAX,
  calculateRangeModifier
} from '../../core/constants.js';

describe('constants', () => {
  it('should export WIDTH constant', () => {
    expect(WIDTH).toBe(1440);
  });

  it('should export HEIGHT constant', () => {
    expect(HEIGHT).toBe(800);
  });

  it('should export 12-lane battlefield constants', () => {
    expect(MAX_SLOTS).toBe(12);
    expect(SLOTS_PER_SIDE).toBe(6);
  });
});

describe('calculateRangeModifier', () => {
  it('returns 1.0 when optimalRange is undefined', () => {
    expect(calculateRangeModifier(3)).toBe(1.0);
    expect(calculateRangeModifier(0)).toBe(1.0);
    expect(calculateRangeModifier(7)).toBe(1.0);
  });

  it('returns 1.0 when optimalRange is null-ish', () => {
    expect(calculateRangeModifier(3, undefined)).toBe(1.0);
  });

  it('returns RANGE_MODIFIER_MAX (1.20) at exact optimal range', () => {
    expect(calculateRangeModifier(3, 3)).toBe(RANGE_MODIFIER_MAX);
    expect(calculateRangeModifier(1, 1)).toBe(RANGE_MODIFIER_MAX);
    expect(calculateRangeModifier(0, 0)).toBe(RANGE_MODIFIER_MAX);
  });

  it('reduces by RANGE_PENALTY_PER_SLOT for each slot away from optimal', () => {
    // optimalRange = 3, distance = 4 → 1 slot away → 1.20 - 0.10 = 1.10
    expect(calculateRangeModifier(4, 3)).toBeCloseTo(1.10, 5);
    // optimalRange = 3, distance = 2 → 1 slot away → 1.10
    expect(calculateRangeModifier(2, 3)).toBeCloseTo(1.10, 5);
    // optimalRange = 3, distance = 5 → 2 slots away → 1.00
    expect(calculateRangeModifier(5, 3)).toBeCloseTo(1.00, 5);
    // optimalRange = 3, distance = 1 → 2 slots away → 1.00
    expect(calculateRangeModifier(1, 3)).toBeCloseTo(1.00, 5);
  });

  it('is symmetric around optimal range', () => {
    // 1 slot over = 1 slot under
    expect(calculateRangeModifier(4, 3)).toBeCloseTo(calculateRangeModifier(2, 3), 5);
    // 2 slots over = 2 slots under
    expect(calculateRangeModifier(5, 3)).toBeCloseTo(calculateRangeModifier(1, 3), 5);
  });

  it('never drops below RANGE_MODIFIER_MIN (0.70)', () => {
    // optimalRange = 1, distance = 7 → 6 slots away → 1.20 - 0.60 = 0.60, clamped to 0.70
    expect(calculateRangeModifier(7, 1)).toBe(RANGE_MODIFIER_MIN);
    // extreme case
    expect(calculateRangeModifier(100, 0)).toBe(RANGE_MODIFIER_MIN);
  });

  it('never exceeds RANGE_MODIFIER_MAX (1.20)', () => {
    // At optimal, it's exactly max
    expect(calculateRangeModifier(3, 3)).toBe(RANGE_MODIFIER_MAX);
    // Even if optimalRange equals distance, can't exceed
    expect(calculateRangeModifier(0, 0)).toBeLessThanOrEqual(RANGE_MODIFIER_MAX);
  });

  it('works for melee cards (optimalRange = 1)', () => {
    // Distance 1 (adjacent): 120%
    expect(calculateRangeModifier(1, 1)).toBeCloseTo(1.20, 5);
    // Distance 2: 110%
    expect(calculateRangeModifier(2, 1)).toBeCloseTo(1.10, 5);
    // Distance 3: 100%
    expect(calculateRangeModifier(3, 1)).toBeCloseTo(1.00, 5);
    // Distance 4: 90%
    expect(calculateRangeModifier(4, 1)).toBeCloseTo(0.90, 5);
    // Distance 5: 80%
    expect(calculateRangeModifier(5, 1)).toBeCloseTo(0.80, 5);
    // Distance 6: 70% (floor)
    expect(calculateRangeModifier(6, 1)).toBeCloseTo(0.70, 5);
    // Distance 7: still 70% (floor)
    expect(calculateRangeModifier(7, 1)).toBeCloseTo(0.70, 5);
  });

  it('works for long-range cards (optimalRange = 4)', () => {
    // Distance 4 (optimal): 120%
    expect(calculateRangeModifier(4, 4)).toBeCloseTo(1.20, 5);
    // Distance 1 (too close): 1.20 - 0.30 = 0.90
    expect(calculateRangeModifier(1, 4)).toBeCloseTo(0.90, 5);
    // Distance 7 (too far): 1.20 - 0.30 = 0.90
    expect(calculateRangeModifier(7, 4)).toBeCloseTo(0.90, 5);
  });

  it('constants are self-consistent', () => {
    expect(RANGE_MODIFIER_MAX).toBe(1.0 + RANGE_OPTIMAL_BONUS);
    expect(RANGE_OPTIMAL_BONUS).toBe(0.20);
    expect(RANGE_PENALTY_PER_SLOT).toBe(0.10);
    expect(RANGE_MODIFIER_MIN).toBe(0.70);
  });
});

