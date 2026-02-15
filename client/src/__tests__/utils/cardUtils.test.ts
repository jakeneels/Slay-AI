import { describe, it, expect } from 'vitest';
import { getRarityColor } from '../../utils/cardUtils.js';

describe('cardUtils', () => {
  describe('getRarityColor', () => {
    it('should return green for common rarity', () => {
      expect(getRarityColor('common')).toBe(0x22c55e);
    });

    it('should return cyan for rare rarity', () => {
      expect(getRarityColor('rare')).toBe(0x06b6d4);
    });

    it('should return purple for epic rarity', () => {
      expect(getRarityColor('epic')).toBe(0xa855f7);
    });

    it('should return orange/gold for legendary rarity', () => {
      expect(getRarityColor('legendary')).toBe(0xf59e0b);
    });

    it('should return hot pink for mythic rarity', () => {
      expect(getRarityColor('mythic')).toBe(0xff0080);
    });

    it('should be case insensitive', () => {
      expect(getRarityColor('COMMON')).toBe(0x22c55e);
      expect(getRarityColor('Rare')).toBe(0x3b82f6);
      expect(getRarityColor('mYtHiC')).toBe(0xff0080);
    });

    it('should return white for unknown rarity', () => {
      expect(getRarityColor('unknown')).toBe(0xffffff);
      expect(getRarityColor('')).toBe(0xffffff);
      expect(getRarityColor('invalid_rarity')).toBe(0xffffff);
    });
  });
});

