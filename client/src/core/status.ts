// Status effect management

import type { Character, Status } from './types.js';
import { addToCombatLog } from './gameState.js';

/**
 * Apply a status to a character
 */
export function applyStatus(
  character: Character,
  statusId: string,
  stacks: number = 1,
  duration?: number,
  metadata?: Record<string, any>
): void {
  const existingStatus = character.statuses.find(s => s.id === statusId);
  
  if (existingStatus) {
    // Stack additively
    existingStatus.stacks += stacks;
    // Refresh duration if provided
    if (duration !== undefined) {
      existingStatus.duration = duration;
    }
    if (metadata) {
      existingStatus.metadata = { ...existingStatus.metadata, ...metadata };
    }
    addToCombatLog(`${character.name} gains ${stacks} ${statusId} (total: ${existingStatus.stacks})`);
  } else {
    // New status
    character.statuses.push({
      id: statusId,
      stacks,
      duration,
      metadata
    });
    addToCombatLog(`${character.name} gains ${stacks} ${statusId}`);
  }
}

/**
 * Remove status stacks (or remove status if stacks reach 0)
 */
export function removeStatusStacks(character: Character, statusId: string, stacks: number): void {
  const status = character.statuses.find(s => s.id === statusId);
  if (!status) return;
  
  status.stacks = Math.max(0, status.stacks - stacks);
  
  if (status.stacks <= 0) {
    character.statuses = character.statuses.filter(s => s.id !== statusId);
    addToCombatLog(`${character.name} loses ${statusId}`);
  }
}

/**
 * Check if character has a status
 */
export function hasStatus(character: Character, statusId: string): boolean {
  return character.statuses.some(s => s.id === statusId);
}

/**
 * Get status stacks
 */
export function getStatusStacks(character: Character, statusId: string): number {
  const status = character.statuses.find(s => s.id === statusId);
  return status ? status.stacks : 0;
}

/**
 * Process DoT effects at end of turn
 */
export function processDoTs(character: Character): void {
  const totalBlock = character.blockLayers.reduce((sum, layer) => sum + layer.amount, 0);
  
  // Bleed - reduced by block
  const bleedStacks = getStatusStacks(character, 'bleed');
  if (bleedStacks > 0) {
    const bleedDamage = bleedStacks;
    const blockReduction = Math.min(bleedDamage, totalBlock);
    const actualDamage = bleedDamage - blockReduction;
    
    if (actualDamage > 0) {
      character.hp = Math.max(0, character.hp - actualDamage);
      addToCombatLog(`${character.name} takes ${actualDamage} bleed damage`);
    }
    if (blockReduction > 0) {
      // Reduce block
      let remainingBlockReduction = blockReduction;
      for (const layer of character.blockLayers) {
        if (remainingBlockReduction <= 0) break;
        const reduction = Math.min(layer.amount, remainingBlockReduction);
        layer.amount -= reduction;
        remainingBlockReduction -= reduction;
      }
      character.blockLayers = character.blockLayers.filter(l => l.amount > 0);
    }
  }
  
  // Shock - reduced by block
  const shockStacks = getStatusStacks(character, 'shock');
  if (shockStacks > 0) {
    const shockDamage = shockStacks;
    const blockReduction = Math.min(shockDamage, totalBlock);
    const actualDamage = shockDamage - blockReduction;
    
    if (actualDamage > 0) {
      character.hp = Math.max(0, character.hp - actualDamage);
      addToCombatLog(`${character.name} takes ${actualDamage} shock damage`);
    }
    if (blockReduction > 0) {
      // Reduce block
      let remainingBlockReduction = blockReduction;
      for (const layer of character.blockLayers) {
        if (remainingBlockReduction <= 0) break;
        const reduction = Math.min(layer.amount, remainingBlockReduction);
        layer.amount -= reduction;
        remainingBlockReduction -= reduction;
      }
      character.blockLayers = character.blockLayers.filter(l => l.amount > 0);
    }
  }
  
  // Radiation - bypasses block
  const radiationStacks = getStatusStacks(character, 'radiation');
  if (radiationStacks > 0) {
    character.hp = Math.max(0, character.hp - radiationStacks);
    addToCombatLog(`${character.name} takes ${radiationStacks} radiation damage (ignores block)`);
  }
}

/**
 * Decay status durations at end of turn
 */
export function decayStatusDurations(character: Character): void {
  character.statuses = character.statuses.map(status => {
    if (status.duration !== undefined && status.duration > 0) {
      status.duration--;
      if (status.duration <= 0) {
        // Status expires
        return null;
      }
    }
    return status;
  }).filter((status): status is Status => status !== null);
}


