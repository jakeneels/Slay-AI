import { describe, expect, it } from 'vitest';
import type { Card } from '../../core/types.js';
import { formatRangeLabel } from '../../rendering/cardTileRenderer.js';

const baseCard: Card = {
  id: 'test_card',
  name: 'Test Card',
  cost: { energy: 3 },
  effects: [{ kind: 'damage', amount: 10, effectTarget: 'target' }],
  targetSide: 'enemy',
  targeting: 'enemy',
  rarity: 'common',
};

describe('cardTileRenderer', () => {
  it('formats range label variants', () => {
    expect(formatRangeLabel({ ...baseCard, minRange: 2, maxRange: 5 })).toBe('2-5');
    expect(formatRangeLabel({ ...baseCard, optimalRange: 3, maxRange: 7 })).toBe('3/7');
    expect(formatRangeLabel({ ...baseCard, maxRange: 6 })).toBe('<=6');
    expect(formatRangeLabel({ ...baseCard, minRange: 2 })).toBe('>=2');
    expect(formatRangeLabel({ ...baseCard, optimalRange: 4 })).toBe('*4');
    expect(formatRangeLabel(baseCard)).toBeNull();
  });
});
