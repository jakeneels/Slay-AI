// Block system management

import type { Character } from './types.js';
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
    let blockRemaining = totalBlock;
    
    // Process damage through block layers (oldest first, or can be FIFO)
    for (const layer of character.blockLayers) {
      if (remainingDamage <= 0) break;
      
      const absorbed = Math.min(layer.amount, remainingDamage);
      layer.amount -= absorbed;
      remainingDamage -= absorbed;
      blockRemaining -= absorbed;
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
export function grantBlockLayer(
  character: Character, 
  amount: number, 
  decayPercent: number = 50,
  source?: string
): void {
  character.blockLayers.push({
    amount,
    baseAmount: amount, // Store original amount for decay calculation
    decay_percent: decayPercent,
    source
  });
  addToCombatLog(`${character.name} gains ${amount} block`);
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

/**
 * Decay block layers at end of turn
 */
export function decayBlockLayers(character: Character): void {
  if (character.blockLayers.length === 0) return;
  
  const fortifyReduction = getFortifyReduction(character);
  
  character.blockLayers = character.blockLayers.map(layer => {
    // Calculate effective decay percent (base decay - fortify reduction, floored by minimum)
    const effectiveDecay = Math.max(
      MIN_DECAY_FLOOR_PERCENT,
      layer.decay_percent - fortifyReduction
    );
    
    // Decay is percentage of BASE amount, not remaining amount
    // Use ceil (round up) as per spec
    const decayAmount = Math.ceil(layer.baseAmount * (effectiveDecay / 100));
    layer.amount = Math.max(0, layer.amount - decayAmount);
    
    return layer;
  }).filter(layer => layer.amount > 0); // Remove empty layers
}

