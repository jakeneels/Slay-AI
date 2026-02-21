import { describe, it, expect } from 'vitest';
import {
  ENERGY_ICON_SIZE,
  resolveVisualProfile,
  computeSpritePlacement,
  deriveTurnBreadcrumbState,
} from '../../rendering/renderCharacters.js';
import { getGameState } from '../../core/gameState.js';
import { createMockCharacter, setupGameState } from '../utils/test-helpers.js';

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

describe('renderCharacters - turn breadcrumbs', () => {
  it('derives turn marker positions for living queued characters only', () => {
    const allyA = createMockCharacter({ id: 'ally_a', isPlayer: true, hp: 100 });
    const allyB = createMockCharacter({ id: 'ally_b', isPlayer: true, hp: 100 });
    const enemyA = createMockCharacter({ id: 'enemy_a', isPlayer: false, hp: 0 });
    setupGameState({
      characters: [allyA, allyB, enemyA],
      currentPlayerId: 'ally_a',
      turnQueue: ['ally_a', 'enemy_a', 'ally_b'],
      turnQueueIndex: 0,
    });

    const breadcrumbState = deriveTurnBreadcrumbState(getGameState());
    expect(breadcrumbState.turnPositionByCharacterId).toEqual({
      ally_a: 1,
      ally_b: 2,
    });
    expect(breadcrumbState.linkedPairIds).toBeNull();
    expect(breadcrumbState.canSwapLinkedPair).toBe(false);
  });

  it('flags linked ally pair when current and next queue turns are swappable allies', () => {
    const allyA = createMockCharacter({ id: 'ally_a', isPlayer: true, hp: 100 });
    const allyB = createMockCharacter({ id: 'ally_b', isPlayer: true, hp: 100 });
    setupGameState({
      characters: [allyA, allyB],
      currentPlayerId: 'ally_a',
      turnQueue: ['ally_a', 'ally_b'],
      turnQueueIndex: 0,
    });

    const breadcrumbState = deriveTurnBreadcrumbState(getGameState());
    expect(breadcrumbState.linkedPairIds).toEqual(['ally_a', 'ally_b']);
    expect(breadcrumbState.canSwapLinkedPair).toBe(true);
  });
});
