// Test helper utilities for creating mock data

import type { Card, Character, CharacterDefinition, GameState } from '../../core/types.js';
import { setGameState } from '../../core/gameState.js';

/**
 * Create a mock card for testing
 */
export function createMockCard(overrides?: Partial<Card>): Card {
  return {
    id: overrides?.id || 'test_card',
    name: overrides?.name || 'Test Card',
    cost: overrides?.cost || { energy: 1 },
    effects: overrides?.effects || [{ kind: 'damage', amount: 5 }],
    targetSide: overrides?.targetSide || 'enemy',
    targeting: overrides?.targeting || 'enemy',
    ...overrides
  };
}

/**
 * Create a mock character for testing
 */
export function createMockCharacter(overrides?: Partial<Character>): Character {
  return {
    id: overrides?.id || 'test_character',
    name: overrides?.name || 'Test Character',
    hp: overrides?.hp ?? 100,
    maxHp: overrides?.maxHp ?? 100,
    energy: overrides?.energy ?? 3,
    maxEnergy: overrides?.maxEnergy ?? 3,
    deck: overrides?.deck || [],
    discardPile: overrides?.discardPile || [],
    hand: overrides?.hand || [],
    drawCount: overrides?.drawCount ?? 3,
    maxHandSize: overrides?.maxHandSize ?? 5,
    blockLayers: overrides?.blockLayers || [],
    statuses: overrides?.statuses || [],
    isPlayer: overrides?.isPlayer ?? true,
    slotIndex: overrides?.slotIndex ?? 0,
    speed: overrides?.speed ?? 0,
    moveCharges: overrides?.moveCharges ?? 0,
    suppression: overrides?.suppression ?? 0,
    suppressionResist: overrides?.suppressionResist ?? 0,
    gear: overrides?.gear ?? { weapon: null, armor: null, accessory: null },
    ...overrides
  };
}

/**
 * Create a mock character definition for testing
 */
export function createMockCharacterDefinition(overrides?: Partial<CharacterDefinition>): CharacterDefinition {
  return {
    id: overrides?.id || 'test_character',
    name: overrides?.name || 'Test Character',
    hp: overrides?.hp ?? 100,
    maxHp: overrides?.maxHp ?? 100,
    energy: overrides?.energy ?? 3,
    maxEnergy: overrides?.maxEnergy ?? 3,
    deck: overrides?.deck || [],
    discardPile: overrides?.discardPile || [],
    hand: overrides?.hand || [],
    drawCount: overrides?.drawCount ?? 3,
    maxHandSize: overrides?.maxHandSize ?? 5,
    blockLayers: overrides?.blockLayers || [],
    statuses: overrides?.statuses || [],
    isPlayer: overrides?.isPlayer ?? true,
    speed: overrides?.speed ?? 0,
    moveCharges: overrides?.moveCharges ?? 0,
    suppression: overrides?.suppression ?? 0,
    suppressionResist: overrides?.suppressionResist ?? 0,
    gear: overrides?.gear ?? { weapon: null, armor: null, accessory: null },
    stats: overrides?.stats || {
      hp: overrides?.hp ?? 100,
      maxHp: overrides?.maxHp ?? 100,
      energy: overrides?.energy ?? 3,
      maxEnergy: overrides?.maxEnergy ?? 3
    },
    startingDeck: overrides?.startingDeck || [],
    ...overrides
  };
}

/**
 * Create a mock game state for testing
 */
export function createMockGameState(overrides?: Partial<GameState>): GameState {
  return {
    characters: overrides?.characters || [],
    cardLibrary: overrides?.cardLibrary || {},
    characterLibrary: overrides?.characterLibrary || {},
    gearLibrary: overrides?.gearLibrary || {},
    cardInstances: overrides?.cardInstances || {},
    selectedCardId: overrides?.selectedCardId ?? null,
    currentPlayerId: overrides?.currentPlayerId || '',
    turnIndex: overrides?.turnIndex ?? 0,
    combatLog: overrides?.combatLog || [],
    isProcessingTurn: overrides?.isProcessingTurn ?? false,
    nextCardInstanceId: overrides?.nextCardInstanceId ?? 1,
    stats: overrides?.stats || {
      cumulativeDamage: 0,
      maxDamage: 0
    },
    combatResult: overrides?.combatResult ?? 'ongoing',
    pendingReward: overrides?.pendingReward ?? null,
    ...overrides
  };
}

/**
 * Reset game state to a clean state before each test
 */
export function resetGameState(): void {
  setGameState(createMockGameState());
}

/**
 * Set up game state with specific configuration
 */
export function setupGameState(state: Partial<GameState>): void {
  setGameState(createMockGameState(state));
}

