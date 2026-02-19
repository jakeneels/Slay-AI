// Block system management

import type { BlockLayer, Character, GameState } from './types.js';
import { addToCombatLog } from './gameState.js';

const MIN_DECAY_FLOOR_PERCENT = 10; // Global minimum decay floor

/**
 * Get total block amount from all layers
 */
export function getTotalBlock(character: Character): number {
  return character.blockLayers.reduce((total, layer) => total + layer.amount, 0);
}

/**
 * Apply damage, reducing block first
 * Returns the damage amount that actually hits HP
 */
export function applyDamageWithBlock(character: Character, damage: number): number {
  let remainingDamage = damage;
  const totalBlock = getTotalBlock(character);
  
  if (totalBlock > 0) {
    // Block absorbs damage
    // Process damage through block layers (oldest first, or can be FIFO)
    for (const layer of character.blockLayers) {
      if (remainingDamage <= 0) break;
      
      const absorbed = Math.min(layer.amount, remainingDamage);
      layer.amount -= absorbed;
      remainingDamage -= absorbed;
    }
    
    // Remove empty block layers
    character.blockLayers = character.blockLayers.filter(layer => layer.amount > 0);
    
    if (totalBlock > getTotalBlock(character)) {
      const blockUsed = totalBlock - getTotalBlock(character);
      addToCombatLog(`${character.name} blocks ${blockUsed} damage`);
    }
  }
  
  // Apply remaining damage to HP
  if (remainingDamage > 0) {
    character.hp = Math.max(0, character.hp - remainingDamage);
    return remainingDamage;
  }
  
  return 0;
}

/**
 * Grant a block layer to a character
 */
interface GrantBlockLayerOptions {
  decayOwnerId?: string;
  sourceLabel?: string;
  nextDecayOwnerTurnStart?: number;
}

export function grantBlockLayer(
  character: Character, 
  amount: number, 
  decayPercent: number = 50,
  source?: string,
  options: GrantBlockLayerOptions = {}
): void {
  const decayOwnerId = options.decayOwnerId ?? character.id;
  character.blockLayers.push({
    amount,
    baseAmount: amount, // Store original amount for decay calculation
    decay_percent: decayPercent,
    source,
    sourceLabel: options.sourceLabel,
    decayOwnerId,
    nextDecayOwnerTurnStart: options.nextDecayOwnerTurnStart,
  });
  addToCombatLog(`${character.name} gains ${amount} block`);
}

function getTurnStartsMap(gameState: GameState): Record<string, number> {
  if (!gameState.turnStartsByCharacterId) {
    gameState.turnStartsByCharacterId = {};
  }
  return gameState.turnStartsByCharacterId;
}

export function getCharacterTurnStartCount(gameState: GameState, characterId: string): number {
  return getTurnStartsMap(gameState)[characterId] ?? 0;
}

export function getNextDecayOwnerTurnStart(gameState: GameState, ownerId: string): number {
  return getCharacterTurnStartCount(gameState, ownerId) + 1;
}

function getTurnsUntilCharacterTurn(gameState: GameState, characterId: string): number | null {
  const queue = gameState.turnQueue ?? [];
  if (queue.length === 0) return null;
  const currentIndex = Math.max(-1, gameState.turnQueueIndex ?? -1);
  for (let offset = 1; offset <= queue.length; offset++) {
    const idx = (currentIndex + offset) % queue.length;
    if (queue[idx] === characterId) return offset;
  }
  return null;
}

function getOwnerTurnsUntilDecay(layer: BlockLayer, character: Character, gameState: GameState): number {
  const ownerId = layer.decayOwnerId ?? character.id;
  const ownerTurnStartCount = getCharacterTurnStartCount(gameState, ownerId);
  const nextDecayOwnerTurnStart = layer.nextDecayOwnerTurnStart ?? ownerTurnStartCount + 1;
  return Math.max(0, nextDecayOwnerTurnStart - ownerTurnStartCount);
}

export interface BlockDecayScheduleEntry {
  layerIndex: number;
  amount: number;
  baseAmount: number;
  decayPercent: number;
  sourceLabel: string;
  ownerId: string;
  ownerName: string;
  ownerTurnsUntilDecay: number;
  turnsUntilDecay: number | null;
}

export function getBlockDecaySchedule(character: Character, gameState: GameState): BlockDecayScheduleEntry[] {
  return character.blockLayers.map((layer, layerIndex) => {
    const ownerId = layer.decayOwnerId ?? character.id;
    const ownerName = gameState.characters.find(c => c.id === ownerId)?.name ?? ownerId;
    const ownerTurnsUntilDecay = getOwnerTurnsUntilDecay(layer, character, gameState);
    const turnsUntilOwnerTurn = getTurnsUntilCharacterTurn(gameState, ownerId);
    const queueLength = Math.max(1, gameState.turnQueue?.length ?? 0);
    const turnsUntilDecay = turnsUntilOwnerTurn === null
      ? null
      : turnsUntilOwnerTurn + Math.max(0, ownerTurnsUntilDecay - 1) * queueLength;

    return {
      layerIndex,
      amount: layer.amount,
      baseAmount: layer.baseAmount,
      decayPercent: layer.decay_percent,
      sourceLabel: layer.sourceLabel ?? layer.source ?? 'Block',
      ownerId,
      ownerName,
      ownerTurnsUntilDecay,
      turnsUntilDecay,
    };
  });
}

export function getNearestBlockDecayTurns(character: Character, gameState: GameState): number | null {
  const schedule = getBlockDecaySchedule(character, gameState)
    .map(entry => entry.turnsUntilDecay)
    .filter((turns): turns is number => turns !== null);
  if (schedule.length === 0) return null;
  return Math.min(...schedule);
}

/**
 * Get Fortify reduction percent for a character
 */
function getFortifyReduction(character: Character): number {
  const fortifyStatus = character.statuses.find(s => s.id === 'fortify');
  if (!fortifyStatus) return 0;
  
  // Fortify stacks additively reduce decay
  // Assuming each stack reduces by a fixed amount (e.g., 10% per stack)
  return fortifyStatus.stacks * 10; // Adjust this value as needed
}

interface DecayBlockLayerOptions {
  ownerTurnStart?: {
    ownerId: string;
    ownerTurnStartCount: number;
  };
}

/**
 * Decay block layers.
 * - Without options: decays all layers (legacy behavior, used by direct tests/tools).
 * - With ownerTurnStart: decays only layers due on that owner's turn start.
 */
export function decayBlockLayers(character: Character, options: DecayBlockLayerOptions = {}): number {
  if (character.blockLayers.length === 0) return 0;
  
  const fortifyReduction = getFortifyReduction(character);
  let totalDecayed = 0;
  const ownerTurnStart = options.ownerTurnStart;
  
  character.blockLayers = character.blockLayers.map(layer => {
    if (ownerTurnStart) {
      const layerOwnerId = layer.decayOwnerId ?? character.id;
      const nextOwnerTurn = layer.nextDecayOwnerTurnStart ?? 1;
      const isDueNow =
        layerOwnerId === ownerTurnStart.ownerId
        && nextOwnerTurn <= ownerTurnStart.ownerTurnStartCount;
      if (!isDueNow) {
        return layer;
      }
    }

    // Calculate effective decay percent (base decay - fortify reduction, floored by minimum)
    const effectiveDecay = Math.max(
      MIN_DECAY_FLOOR_PERCENT,
      layer.decay_percent - fortifyReduction
    );
    
    // Decay is percentage of BASE amount, not remaining amount
    // Use ceil (round up) as per spec
    const decayAmount = Math.ceil(layer.baseAmount * (effectiveDecay / 100));
    const previous = layer.amount;
    layer.amount = Math.max(0, layer.amount - decayAmount);
    totalDecayed += Math.max(0, previous - layer.amount);
    if (ownerTurnStart) {
      layer.nextDecayOwnerTurnStart = ownerTurnStart.ownerTurnStartCount + 1;
    }
    
    return layer;
  }).filter(layer => layer.amount > 0); // Remove empty layers

  return totalDecayed;
}

/**
 * Process owner-turn-start block decay for a character.
 */
export function processBlockDecayForTurnStart(character: Character, gameState: GameState): void {
  const turnStartsMap = getTurnStartsMap(gameState);
  const ownerTurnStartCount = (turnStartsMap[character.id] ?? 0) + 1;
  turnStartsMap[character.id] = ownerTurnStartCount;

  const decayedAmount = decayBlockLayers(character, {
    ownerTurnStart: {
      ownerId: character.id,
      ownerTurnStartCount,
    },
  });

  if (decayedAmount > 0) {
    addToCombatLog(`${character.name}'s block decays by ${decayedAmount} at turn start`);
  }
}

