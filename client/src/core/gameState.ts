// Game state management

import type { GameState, RollbackSnapshotReason } from './types.js';
import { pickRandomMap } from '../rendering/renderBackground.js';

// Game state singleton
let gameState: GameState = {
  characters: [],
  cardLibrary: {},
  characterLibrary: {},
  gearLibrary: {},
  statusLibrary: {},
  cardInstances: {},
  selectedCardId: null,
  currentPlayerId: '',
  turnIndex: 0,
  turnQueue: [],
  turnQueueIndex: -1,
  roundNumber: 0,
  combatLog: [],
  isProcessingTurn: false,
  nextCardInstanceId: 1,
  stats: {
    cumulativeDamage: 0,
    maxDamage: 0,
  },
  combatResult: 'ongoing',
  pendingReward: null,
  pendingRewardChoices: [],
  waveNumber: 1,
  currentMap: pickRandomMap(undefined, 1),
  playedCardsStack: [],
  laneHazards: [],
  laneBuffs: [],
  enemyAiDebug: {
    spawns: [],
    preRound: [],
    turn: [],
  },
  preFight: {
    active: false,
    page: 'lineup',
    useDefaultCards: true,
    candidateAllyIds: [],
    selectedAllyIds: [],
    requiredLineupSize: 0,
    source: 'run_start',
    pendingThreatScore: null,
    activeCardEditorAllyId: null,
    activeCardSlotIndex: null,
    cardCatalogScroll: 0,
    cardPoolIds: [],
    cardsByAlly: {},
    threatBudget: 0,
  },
};

const MAX_ROLLBACK_SNAPSHOTS = 40;
type HistorySnapshot = {
  reason: RollbackSnapshotReason;
  state: GameState;
};
let rollbackHistory: HistorySnapshot[] = [];
let rollbackEpoch = 0;

function cloneState(state: GameState): GameState {
  if (typeof structuredClone === 'function') {
    return structuredClone(state);
  }
  return JSON.parse(JSON.stringify(state)) as GameState;
}

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
  rollbackHistory = [];
  rollbackEpoch++;
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

export function pushHistorySnapshot(reason: RollbackSnapshotReason): void {
  rollbackHistory.push({
    reason,
    state: cloneState(gameState),
  });
  if (rollbackHistory.length > MAX_ROLLBACK_SNAPSHOTS) {
    rollbackHistory = rollbackHistory.slice(-MAX_ROLLBACK_SNAPSHOTS);
  }
}

export function canRollbackTurn(): boolean {
  return !gameState.isProcessingTurn && rollbackHistory.length > 0;
}

export function rollbackTurn(renderCallback?: () => void): boolean {
  if (!canRollbackTurn()) return false;
  const previous = rollbackHistory.pop();
  if (!previous) return false;
  gameState = cloneState(previous.state);
  rollbackEpoch++;
  if (renderCallback) {
    renderCallback();
  }
  return true;
}

export function getRollbackHistorySize(): number {
  return rollbackHistory.length;
}

export function getRollbackEpoch(): number {
  return rollbackEpoch;
}

