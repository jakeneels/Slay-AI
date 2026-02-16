// Game state management

import type { GameState } from './types.js';
import { pickRandomMap } from '../rendering/renderBackground.js';

// Game state singleton
let gameState: GameState = {
  characters: [],
  cardLibrary: {},
  characterLibrary: {},
  gearLibrary: {},
  statusLibrary: {},
  cardInstances: {}, // Store unique card instances
  selectedCardId: null,
  currentPlayerId: '',
  turnIndex: 0,
  combatLog: [],
  isProcessingTurn: false,
  nextCardInstanceId: 1,
  stats: {
    cumulativeDamage: 0,
    maxDamage: 0,
  },
  combatResult: 'ongoing',
  pendingReward: null,
  waveNumber: 1,
  currentMap: pickRandomMap(undefined, 1),
};

/**
 * Get the current game state
 */
export function getGameState(): GameState {
  return gameState;
}

/**
 * Set the game state (use with caution)
 */
export function setGameState(state: GameState): void {
  gameState = state;
}

/**
 * Add message to combat log
 */
export function addToCombatLog(message: string): void {
  gameState.combatLog.push(message);
}

/**
 * Get combat log
 */
export function getCombatLog(): string[] {
  return gameState.combatLog;
}

/**
 * Update selected card ID
 */
export function setSelectedCardId(cardId: string | null): void {
  gameState.selectedCardId = cardId;
}

/**
 * Get selected card ID
 */
export function getSelectedCardId(): string | null {
  return gameState.selectedCardId;
}

