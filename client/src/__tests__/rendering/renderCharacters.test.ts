import { describe, it, expect } from 'vitest';
import {
  ENERGY_ICON_THRESHOLD,
  ENERGY_ICON_SIZE,
  ENERGY_ICON_GAP,
  shouldUseEnergyIcons,
  calculateEnergyIconRowWidth,
} from '../../rendering/renderCharacters.js';

describe('renderCharacters - energy display helpers', () => {
  describe('shouldUseEnergyIcons', () => {
    it('should use icons for energy 1 through ENERGY_ICON_THRESHOLD', () => {
      for (let e = 1; e <= ENERGY_ICON_THRESHOLD; e++) {
        expect(shouldUseEnergyIcons(e)).toBe(true);
      }
    });

    it('should use icons for energy 0', () => {
      expect(shouldUseEnergyIcons(0)).toBe(true);
    });

    it('should NOT use icons for energy above ENERGY_ICON_THRESHOLD', () => {
      expect(shouldUseEnergyIcons(ENERGY_ICON_THRESHOLD + 1)).toBe(false);
      expect(shouldUseEnergyIcons(ENERGY_ICON_THRESHOLD + 2)).toBe(false);
      expect(shouldUseEnergyIcons(10)).toBe(false);
    });

    it('should use icons for energy exactly at the threshold (6)', () => {
      // This was the original bug: energy=6 fell into a dead zone
      expect(shouldUseEnergyIcons(6)).toBe(true);
    });

    it('should NOT use icons for energy 7 (first value above threshold)', () => {
      expect(shouldUseEnergyIcons(7)).toBe(false);
    });
  });

  describe('ENERGY_ICON_THRESHOLD', () => {
    it('should be 6 (icons for 1-6, text for 7+)', () => {
      expect(ENERGY_ICON_THRESHOLD).toBe(6);
    });
  });

  describe('calculateEnergyIconRowWidth', () => {
    it('should return 0 for energy 0', () => {
      expect(calculateEnergyIconRowWidth(0)).toBe(0);
    });

    it('should return icon size for energy 1 (no gaps)', () => {
      expect(calculateEnergyIconRowWidth(1)).toBe(ENERGY_ICON_SIZE);
    });

    it('should include gaps between icons for energy > 1', () => {
      // 2 icons: 2 * size + 1 * gap
      expect(calculateEnergyIconRowWidth(2)).toBe(2 * ENERGY_ICON_SIZE + 1 * ENERGY_ICON_GAP);
    });

    it('should calculate correctly for energy at threshold (6)', () => {
      const expected = 6 * ENERGY_ICON_SIZE + 5 * ENERGY_ICON_GAP;
      expect(calculateEnergyIconRowWidth(6)).toBe(expected);
    });

    it('should accept custom icon size and gap', () => {
      const customSize = 20;
      const customGap = 8;
      // 3 icons: 3 * 20 + 2 * 8 = 76
      expect(calculateEnergyIconRowWidth(3, customSize, customGap)).toBe(76);
    });
  });
});
