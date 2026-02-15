import { describe, it, expect } from 'vitest';
import {
  ENERGY_ICON_SIZE,
} from '../../rendering/renderCharacters.js';

describe('renderCharacters - energy display constants', () => {
  it('should export ENERGY_ICON_SIZE as 14', () => {
    expect(ENERGY_ICON_SIZE).toBe(14);
  });
});
