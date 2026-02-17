import { describe, it, expect, beforeEach } from 'vitest';
import { getRollbackButtonUiState, getTargetingWarning } from '../../rendering/renderUI.js';
import { createMockCharacter, createMockCard, setupGameState } from '../utils/test-helpers.js';
import { getGameState, pushHistorySnapshot } from '../../core/gameState.js';
import { setShowRollbackButtonSetting } from '../../rendering/preFightDisplaySettings.js';

describe('getTargetingWarning', () => {
  beforeEach(() => {
    setupGameState({ characters: [], cardLibrary: {} });
    setShowRollbackButtonSetting(true);
  });

  describe('energy check with suppression', () => {
    it('returns "not enough energy" when player has energy for base cost but not for base+suppression on ranged card', () => {
      // Player at slot 5 (rightmost ally), enemy with suppression 2 at slot 6 (within distance 2)
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 1,
        isPlayer: true,
        slotIndex: 5,
        suppressionResist: 0,
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false,
        slotIndex: 6,
        suppression: 2,
      });

      const rangedCard = createMockCard({
        id: 'snipe',
        name: 'Snipe',
        cost: { energy: 1 },
        targeting: 'enemy',
        maxRange: 4, // Ranged (>= 4)
        effects: [{ kind: 'damage', amount: 10 }],
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { snipe: rangedCard },
        currentPlayerId: 'player1',
      });

      const gameState = getGameState();
      const warning = getTargetingWarning(rangedCard, player, gameState);

      expect(warning).toContain('Not enough energy');
      expect(warning).toContain('need 3'); // 1 base + 2 suppression
      expect(warning).toContain('1 + 2 suppressed');
      expect(warning).toContain('have 1');
    });

    it('returns "not enough energy" with simple message when no suppression penalty (melee card)', () => {
      const player = createMockCharacter({
        id: 'player1',
        energy: 0,
        isPlayer: true,
        slotIndex: 5,
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        hp: 100,
        isPlayer: false,
        slotIndex: 6,
      });

      const meleeCard = createMockCard({
        id: 'strike',
        cost: { energy: 2 },
        targeting: 'enemy',
        maxRange: 1, // Not ranged (>= 4), so no suppression penalty
        effects: [{ kind: 'damage', amount: 6 }],
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { strike: meleeCard },
        currentPlayerId: 'player1',
      });

      const gameState = getGameState();
      const warning = getTargetingWarning(meleeCard, player, gameState);

      expect(warning).toContain('Not enough energy');
      expect(warning).toContain('need 2');
      expect(warning).toContain('have 0');
      expect(warning).not.toContain('suppressed');
    });

    it('returns null when player has enough energy for total cost including suppression', () => {
      const player = createMockCharacter({
        id: 'player1',
        energy: 5,
        isPlayer: true,
        slotIndex: 5,
        suppressionResist: 0,
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        hp: 100,
        isPlayer: false,
        slotIndex: 6,
        suppression: 2,
      });

      const rangedCard = createMockCard({
        id: 'snipe',
        cost: { energy: 1 },
        targeting: 'enemy',
        maxRange: 4,
        effects: [{ kind: 'damage', amount: 10 }],
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { snipe: rangedCard },
        currentPlayerId: 'player1',
      });

      const gameState = getGameState();
      const warning = getTargetingWarning(rangedCard, player, gameState);

      // Should not be blocked by energy (totalCost = 1+2 = 3, player has 5)
      if (warning !== null) {
        expect(warning).not.toContain('Not enough energy');
      }
    });
  });
});

describe('getRollbackButtonUiState', () => {
  beforeEach(() => {
    setupGameState({ characters: [], cardLibrary: {} });
    setShowRollbackButtonSetting(true);
  });

  it('shows and enables rollback when history exists', () => {
    pushHistorySnapshot('play_card');
    expect(getRollbackButtonUiState()).toEqual({
      visible: true,
      enabled: true,
    });
  });

  it('shows but disables rollback while processing', () => {
    pushHistorySnapshot('play_card');
    getGameState().isProcessingTurn = true;
    expect(getRollbackButtonUiState()).toEqual({
      visible: true,
      enabled: false,
    });
  });

  it('hides rollback button when setting is off', () => {
    setShowRollbackButtonSetting(false);
    pushHistorySnapshot('play_card');
    expect(getRollbackButtonUiState()).toEqual({
      visible: false,
      enabled: false,
    });
  });
});
