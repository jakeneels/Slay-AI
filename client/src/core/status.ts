// Status effect management — data-driven via StatusDefinition from YAML

import type { Character, Status, StatusCadence, StatusDefinition } from './types.js';
import { addToCombatLog, getGameState } from './gameState.js';
import { getTotalBlock } from './block.js';

// ── Helpers ──────────────────────────────────────────────────────────

/** Look up a StatusDefinition from the game state's statusLibrary. */
function getStatusDef(statusId: string): StatusDefinition | undefined {
  return getGameState().statusLibrary[statusId];
}

// ── Application ──────────────────────────────────────────────────────

/**
 * Apply a status to a character.
 * Checks data-driven application conditions (e.g. requires_zero_block).
 */
export function applyStatus(
  character: Character,
  statusId: string,
  stacks: number = 1,
  duration?: number,
  metadata?: Record<string, any>
): void {
  // Check data-driven application conditions
  const def = getStatusDef(statusId);
  if (def?.apply?.requires_zero_block) {
    const totalBlock = getTotalBlock(character);
    if (totalBlock > 0) {
      addToCombatLog(`${character.name} resists ${def.name} (${totalBlock} block remaining)`);
      return;
    }
  }

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

// ── Stack manipulation ───────────────────────────────────────────────

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
 * Modify existing status stacks with an operation (multiply, add, set).
 * Does nothing if the character doesn't have the status.
 * Returns the new stack count (0 if status was removed or didn't exist).
 */
export function modifyStatusStacks(
  character: Character,
  statusId: string,
  op: 'multiply' | 'add' | 'set',
  value: number
): number {
  const status = character.statuses.find(s => s.id === statusId);
  if (!status) return 0;

  const oldStacks = status.stacks;
  let newStacks: number;

  switch (op) {
    case 'multiply':
      newStacks = Math.floor(status.stacks * value);
      break;
    case 'add':
      newStacks = status.stacks + value;
      break;
    case 'set':
      newStacks = value;
      break;
  }

  if (newStacks <= 0) {
    character.statuses = character.statuses.filter(s => s.id !== statusId);
    addToCombatLog(`${character.name} loses ${statusId}`);
    return 0;
  }

  status.stacks = newStacks;
  const def = getStatusDef(statusId);
  const label = def?.name ?? statusId;
  addToCombatLog(`${character.name}'s ${label}: ${oldStacks} → ${newStacks} stacks`);
  return newStacks;
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

// ── DoT / Decay engine (data-driven) ────────────────────────────────

/**
 * Apply DoT damage for a single status based on its definition.
 * Returns the actual HP damage dealt (after block interaction).
 */
function applyDot(character: Character, statusId: string, stacks: number, def: StatusDefinition): number {
  if (!def.dot) return 0;

  const totalDamage = stacks * def.dot.damage_per_stack;
  if (totalDamage <= 0) return 0;

  if (def.dot.ignores_block) {
    // Bypass block entirely
    character.hp = Math.max(0, character.hp - totalDamage);
    addToCombatLog(`${character.name} takes ${totalDamage} ${def.name} damage (ignores block)`);
    return totalDamage;
  }

  // Reduced by block
  const totalBlock = character.blockLayers.reduce((sum, layer) => sum + layer.amount, 0);
  const blockReduction = Math.min(totalDamage, totalBlock);
  const actualDamage = totalDamage - blockReduction;

  if (actualDamage > 0) {
    character.hp = Math.max(0, character.hp - actualDamage);
    addToCombatLog(`${character.name} takes ${actualDamage} ${statusId} damage`);
  }
  if (blockReduction > 0) {
    let remaining = blockReduction;
    for (const layer of character.blockLayers) {
      if (remaining <= 0) break;
      const reduction = Math.min(layer.amount, remaining);
      layer.amount -= reduction;
      remaining -= reduction;
    }
    character.blockLayers = character.blockLayers.filter(l => l.amount > 0);
  }

  return actualDamage;
}

/**
 * Apply stack decay for a single status based on its definition.
 * Mutates the character's statuses array (may remove the status).
 */
function applyDecay(character: Character, statusId: string, currentStacks: number, def: StatusDefinition): void {
  const decay = def.decay;
  if (decay.mode === 'none') return;

  const minRemove = decay.min_remove ?? 1;
  let newStacks: number;

  switch (decay.mode) {
    case 'linear':
      newStacks = currentStacks - 1;
      break;

    case 'half_life': {
      if (currentStacks <= minRemove) {
        newStacks = 0;
      } else {
        const roundFn = decay.round === 'floor' ? Math.floor : Math.ceil;
        newStacks = roundFn(currentStacks / 2);
      }
      break;
    }

    default:
      return;
  }

  if (newStacks <= 0) {
    character.statuses = character.statuses.filter(s => s.id !== statusId);
    addToCombatLog(`${character.name}'s ${def.name} has decayed`);
  } else {
    const status = character.statuses.find(s => s.id === statusId);
    if (status) status.stacks = newStacks;
  }
}

/**
 * Process all status effects on a character for a given cadence.
 * Only ticks statuses whose definition matches the cadence.
 * Statuses without a definition default to 'turn_end' cadence with no DoT.
 */
export function processStatusEffects(character: Character, cadence: StatusCadence): void {
  // Snapshot status ids to avoid mutation issues during iteration
  const statusSnapshot = [...character.statuses];

  for (const status of statusSnapshot) {
    // Skip already-removed statuses (from previous iteration)
    if (!character.statuses.some(s => s.id === status.id)) continue;

    const def = getStatusDef(status.id);

    // Default cadence is 'turn_end' for unknown statuses
    const statusCadence = def?.cadence ?? 'turn_end';
    if (statusCadence !== cadence) continue;

    // Apply DoT damage if defined
    if (def?.dot) {
      applyDot(character, status.id, status.stacks, def);
    }

    // Apply decay if defined
    if (def) {
      applyDecay(character, status.id, status.stacks, def);
    }
  }
}

/**
 * Legacy wrapper — processes all turn_end DoTs.
 * @deprecated Use processStatusEffects(character, cadence) instead.
 */
export function processDoTs(character: Character): void {
  processStatusEffects(character, 'turn_end');
}

// ── Duration decay ───────────────────────────────────────────────────

/**
 * Decay status durations at end of turn
 */
export function decayStatusDurations(character: Character): void {
  character.statuses = character.statuses.map(status => {
    if (status.duration !== undefined && status.duration > 0) {
      status.duration--;
      if (status.duration <= 0) {
        return null;
      }
    }
    return status;
  }).filter((status): status is Status => status !== null);
}
