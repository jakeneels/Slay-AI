import { describe, it, expect } from 'vitest';
import {
  ENERGY_ICON_SIZE,
  resolveVisualProfile,
  computeSpritePlacement,
} from '../../rendering/renderCharacters.js';

describe('renderCharacters - energy display constants', () => {
  it('should export ENERGY_ICON_SIZE as 14', () => {
    expect(ENERGY_ICON_SIZE).toBe(14);
  });
});

describe('renderCharacters - visual profile', () => {
  it('should resolve defaults when visual metadata is missing', () => {
    const profile = resolveVisualProfile(undefined);
    expect(profile).toEqual({
      scale: 1,
      anchorX: 0.5,
      anchorY: 1,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it('should keep feet aligned on ground across anchor changes', () => {
    const slotCenterX = 400;
    const groundY = 700;
    const spriteWidth = 160;
    const spriteHeight = 220;

    const centered = computeSpritePlacement(slotCenterX, groundY, spriteWidth, spriteHeight, {
      scale: 1,
      anchorX: 0.5,
      anchorY: 0.5,
      offsetX: 0,
      offsetY: 0,
    });
    const bottomCentered = centered.y + (1 - 0.5) * spriteHeight;

    const footAnchored = computeSpritePlacement(slotCenterX, groundY, spriteWidth, spriteHeight, {
      scale: 1,
      anchorX: 0.5,
      anchorY: 1,
      offsetX: 0,
      offsetY: 0,
    });
    const bottomFootAnchored = footAnchored.y + (1 - 1) * spriteHeight;

    expect(bottomCentered).toBe(groundY);
    expect(bottomFootAnchored).toBe(groundY);
  });
});
