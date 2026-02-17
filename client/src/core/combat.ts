// Combat logic - card playing, turn management, enemy AI

import type { Application } from 'pixi.js';
import type { Character, CardEffect, Card, BaseCardEffect, SpeedEffect, StatusSpreadEffect, LaneHazardEffect } from './types.js';
import { getGameState } from './gameState.js';
import { getCard } from './card.js';
import { drawCards } from './deck.js';
import { addToCombatLog } from './gameState.js';
import {
  logCardHit,
  logAllEnemiesDead,
  logAllAlliesDead,
  logCharacterDefeated,
  logTurnAdvance,
} from '../utils/gameEvents.js';
import { 
  animateCharachterSpark, 
  playDamageAnimation, 
  playHealAnimation, 
  animateDamageFlash,
  animateEnhancedScreenShake,
  animateParticles,
  animateCardPlayShowcase,
  type AnimationConfig,
  type PlayDamageAnimationOptions 
} from '../../animations.js';
import { applyDamageWithBlock, grantBlockLayer, decayBlockLayers } from './block.js';
import { applyStatus, modifyStatusStacks, processStatusEffects, decayStatusDurations, getStatusStacks } from './status.js';
import { MAX_SLOTS, SLOTS_PER_SIDE, calculateRangeModifier, getSuppressionDistance, getSuppressionRangedThreshold, getSuppressionStackCost } from './constants.js';
import { getModifierRegistry } from './modifiers.js';
import { computeDifficulty } from './waveGenerator.js';

let app: Application | null = null;

// ── Suppression helpers ───────────────────────────────────────────────

/**
 * Get all living opponents within suppression distance of a character.
 */
function getNearbyOpponents(character: Character): Character[] {
  const gameState = getGameState();
  const ctx = { character };
  const distance = getSuppressionDistance(ctx);
  return gameState.characters.filter(
    c => c.isPlayer !== character.isPlayer
      && c.hp > 0
      && Math.abs(character.slotIndex - c.slotIndex) <= distance
  );
}

/**
 * Get the maximum suppression stat among nearby opponents.
 * Returns 0 if no opponents are nearby or none have suppression.
 */
export function getMaxNearbySuppression(character: Character): number {
  const nearby = getNearbyOpponents(character);
  if (nearby.length === 0) return 0;
  return Math.max(...nearby.map(opp => opp.suppression));
}

/**
 * Calculate the net suppression penalty for a character based on
 * nearby enemy suppression stats vs the character's resistance.
 * Returns 0 if no nearby enemy projects enough suppression.
 */
export function getNetSuppressionPenalty(character: Character): number {
  const maxSuppression = getMaxNearbySuppression(character);
  return Math.max(0, maxSuppression - character.suppressionResist);
}

/**
 * Check whether a character is suppressed by proximity to an enemy.
 * A character is suppressed when any living opposing character is within
 * suppression distance AND projects enough suppression to overcome the
 * character's resistance.
 */
export function isCharacterSuppressed(character: Character): boolean {
  return getNetSuppressionPenalty(character) > 0;
}

/**
 * Check whether a card is considered "ranged" for suppression purposes.
 * Uses the resolved suppression ranged threshold (default 4).
 */
export function isRangedCard(card: Card, character?: Character): boolean {
  const ctx = character ? { character, card } : { card };
  const threshold = getSuppressionRangedThreshold(ctx);
  return (card.maxRange ?? 0) >= threshold;
}

/**
 * Calculate the extra energy cost a character must pay for a ranged card
 * due to suppression. Returns 0 if the character is not suppressed or
 * the card is not ranged.
 *
 * Penalty = max(0, maxNearbySuppression - character.suppressionResist)
 *         + suppressedStatusStacks * SUPPRESSION_STACK_COST
 */
export function getSuppressionCostPenalty(character: Character, card: Card): number {
  if (!isRangedCard(card, character)) return 0;

  const netPenalty = getNetSuppressionPenalty(character);
  if (netPenalty <= 0) return 0;

  const ctx = { character, card };
  const stackCost = getSuppressionStackCost(ctx);
  const statusStacks = getStatusStacks(character, 'suppressed');
  return netPenalty + statusStacks * stackCost;
}

/**
 * Get all characters by position for a given side (sorted by slotIndex)
 */
export function getCharactersByPosition(side: 'enemy' | 'ally'): Character[] {
  const gameState = getGameState();
  const chars = side === 'enemy'
    ? gameState.characters.filter(c => !c.isPlayer && c.hp > 0)
    : gameState.characters.filter(c => c.isPlayer && c.hp > 0);
  return chars.sort((a, b) => a.slotIndex - b.slotIndex);
}

export function getCharacterSlotSize(character: Character): number {
  if (typeof character.slotSize !== 'number' || !Number.isFinite(character.slotSize)) return 1;
  return Math.max(1, Math.floor(character.slotSize));
}

export function getOccupiedSlots(character: Character): number[] {
  const slotSize = getCharacterSlotSize(character);
  return Array.from({ length: slotSize }, (_, i) => character.slotIndex + i);
}

function rangesOverlap(a: number[], b: number[]): boolean {
  return a.some(slot => b.includes(slot));
}

export function isSlotBlocked(
  slotIndex: number,
  isPlayer: boolean,
  characters: Character[] = getGameState().characters,
  excludingCharacterId?: string
): boolean {
  return characters.some(c =>
    c.hp > 0 &&
    c.isPlayer === isPlayer &&
    c.id !== excludingCharacterId &&
    getOccupiedSlots(c).includes(slotIndex)
  );
}

export function canOccupyRange(
  frontSlot: number,
  slotSize: number,
  isPlayer: boolean,
  characters: Character[] = getGameState().characters,
  excludingCharacterId?: string
): boolean {
  void isPlayer;
  const normalizedSize = Math.max(1, Math.floor(slotSize));
  const occupiedRange = Array.from({ length: normalizedSize }, (_, i) => frontSlot + i);
  if (occupiedRange.some(slot => slot < 0 || slot >= MAX_SLOTS)) {
    return false;
  }
  return !characters.some(c =>
    c.hp > 0 &&
    c.id !== excludingCharacterId &&
    rangesOverlap(getOccupiedSlots(c), occupiedRange)
  );
}

type HazardTrigger = 'movement' | 'turn_start' | 'round_end';

function getHazardTriggerLabel(trigger: HazardTrigger): string {
  switch (trigger) {
    case 'turn_start':
      return 'start of turn';
    case 'round_end':
      return 'round end';
    case 'movement':
    default:
      return 'moving through fire';
  }
}

function applyLaneHazardsToCharacter(
  character: Character,
  trigger: HazardTrigger,
  renderCallback?: () => void,
): number {
  const gameState = getGameState();
  if (character.hp <= 0) return 0;
  const occupied = getOccupiedSlots(character);
  const hazards = gameState.laneHazards.filter(h =>
    h.remainingTurns > 0 &&
    h.ownerIsPlayer !== character.isPlayer &&
    occupied.includes(h.slotIndex)
  );
  if (hazards.length === 0) return 0;

  let totalDamage = 0;
  const triggerLabel = getHazardTriggerLabel(trigger);
  for (const hazard of hazards) {
    if (character.hp <= 0) break;
    const baseDamage = Math.max(0, Math.floor(hazard.damage));
    if (baseDamage <= 0) continue;
    const actualDamage = applyDamageWithBlock(character, baseDamage);
    if (actualDamage > 0) {
      totalDamage += actualDamage;
      addToCombatLog(`${character.name} takes ${actualDamage} fire damage (${triggerLabel})`);
    }
  }

  if (totalDamage > 0 && renderCallback) {
    renderCallback();
  }
  if (character.hp <= 0) {
    logCharacterDefeated(character.name, character.id, character.isPlayer);
    addToCombatLog(`${character.name} is defeated!`);
  }
  return totalDamage;
}

function checkCombatResolutionAfterHazards(): void {
  const gameState = getGameState();
  const livingEnemies = gameState.characters.filter(c => !c.isPlayer && c.hp > 0);
  const livingAllies = gameState.characters.filter(c => c.isPlayer && c.hp > 0);

  if (livingEnemies.length === 0 && gameState.combatResult === 'ongoing') {
    logAllEnemiesDead();
    gameState.combatResult = 'victory';
    const gearIds = Object.keys(gameState.gearLibrary);
    if (gearIds.length > 0) {
      const randomId = gearIds[Math.floor(Math.random() * gearIds.length)];
      gameState.pendingReward = gameState.gearLibrary[randomId];
    }
    gameState.isProcessingTurn = true;
    addToCombatLog('Victory! All enemies defeated.');
  }

  if (livingAllies.length === 0 && gameState.combatResult === 'ongoing') {
    logAllAlliesDead();
    gameState.combatResult = 'defeat';
    addToCombatLog('Defeat! All allies have fallen.');
  }
}

/**
 * Calculate AOE targets based on a center slot and aoeSlots configuration.
 * Returns array of characters that will be hit.
 * @param centerSlot - The slot index to center the AOE on (can be empty)
 * @param targetSide - Which side to target ('enemy', 'ally', or 'all' for friendly-fire AOE)
 * @param aoeSlots - Number of slots to hit. Defaults to 3.
 *   2 = center + one adjacent (prefer right)
 *   3 = center ± 1
 *   >= SLOTS_PER_SIDE = all characters on target side
 */
export function calculateAoeTargets(centerSlot: number, targetSide: 'enemy' | 'ally' | 'all', aoeSlots: number = 3): Character[] {
  const characters = targetSide === 'all'
    ? getGameState().characters.filter(c => c.hp > 0).sort((a, b) => a.slotIndex - b.slotIndex)
    : getCharactersByPosition(targetSide);

  if (characters.length === 0) {
    return [];
  }

  // Side-wide AOE: hit everyone on the target side.
  if (aoeSlots >= SLOTS_PER_SIDE) {
    return characters;
  }

  const getTargetsForSlots = (slots: number[]): Character[] => {
    const slotSet = new Set(slots);
    return characters.filter(c =>
      getOccupiedSlots(c).some(occupiedSlot => slotSet.has(occupiedSlot))
    );
  };

  if (aoeSlots === 2) {
    // 2 slots: center + 1 right; fallback to center + 1 left
    const inRange = getTargetsForSlots([centerSlot, centerSlot + 1]);
    if (inRange.length > 0) return inRange;
    return getTargetsForSlots([centerSlot - 1, centerSlot]);
  }

  // 3 slots (default): centerSlot ± 1 — only hits characters actually in adjacent slots
  return getTargetsForSlots([centerSlot - 1, centerSlot, centerSlot + 1]);
}

/**
 * Parse a targetId that is either a character ID or "slot:N".
 * Returns the slot index, or null if invalid.
 */
export function resolveTargetSlot(targetId: string): number | null {
  if (targetId.startsWith('slot:')) {
    const parsed = parseInt(targetId.slice(5), 10);
    return isNaN(parsed) ? null : parsed;
  }
  const char = getGameState().characters.find(c => c.id === targetId);
  return char?.slotIndex ?? null;
}

/**
 * Resolve targets for a single effect based on its effectTarget field.
 * Falls back to the card-level targets when effectTarget is 'target' or omitted.
 */
export function resolveEffectTargets(
  effect: CardEffect,
  caster: Character,
  cardLevelTargets: Character[],
  primaryTargetId: string | undefined,
  card: Card
): Character[] {
  // modifier and deck_inject handle their own targeting
  if (effect.kind === 'modifier' || effect.kind === 'deck_inject') {
    return cardLevelTargets;
  }

  const et = (effect as BaseCardEffect).effectTarget;

  // Default: inherit card-level targets
  if (!et || et === 'target') {
    return cardLevelTargets;
  }

  const gameState = getGameState();

  switch (et) {
    case 'self':
      return [caster];

    case 'allAllies':
      return gameState.characters.filter(c => c.isPlayer === caster.isPlayer && c.hp > 0);

    case 'allEnemies':
      return gameState.characters.filter(c => c.isPlayer !== caster.isPlayer && c.hp > 0);

    case 'aoe': {
      // Use the effect's own aoeSlots, fall back to card-level, then default 3
      const slots = (effect as BaseCardEffect).aoeSlots ?? card.aoeSlots ?? 3;
      if (!primaryTargetId) return cardLevelTargets;
      const centerSlot = resolveTargetSlot(primaryTargetId);
      if (centerSlot === null) return cardLevelTargets;
      return calculateAoeTargets(centerSlot, 'all', slots);
    }

    default:
      return cardLevelTargets;
  }
}

/**
 * Get a card with template targeting overrides applied.
 * Card instances copy properties at creation, but templates may be modified after loading.
 */
function getResolvedCard(cardId: string): Card | null {
  const gameState = getGameState();
  let card = getCard(cardId);
  if (!card) return null;
  if ('templateId' in card && card.templateId) {
    const template = gameState.cardLibrary[card.templateId];
    if (template) {
      card = { 
        ...card, 
        targeting: template.targeting, 
        targetSide: template.targetSide,
        aoeSlots: template.aoeSlots
      };
    }
  }
  return card;
}

/**
 * Resolve card-level targets based on targeting mode, relative to the caster.
 * This is the single source of truth for target resolution — both player and enemy
 * card plays use this, so "ally" always means "same side as caster" and "enemy"
 * always means "opposite side from caster".
 * Returns the target array, or null if targeting is invalid.
 */
export function resolveCardTargets(
  card: Card,
  caster: Character,
  targetId: string | undefined
): Character[] | null {
  const gameState = getGameState();

  switch (card.targeting) {
    case 'allEnemies':
      return gameState.characters.filter(c => c.isPlayer !== caster.isPlayer && c.hp > 0);

    case 'allAllies':
      return gameState.characters.filter(c => c.isPlayer === caster.isPlayer && c.hp > 0);

    case 'self':
      return [caster];

    case 'aoe': {
      if (!targetId) return null;
      const centerSlot = resolveTargetSlot(targetId);
      if (centerSlot === null) return null;

      // AOE hits ALL characters in the blast radius — no side checks.
      // If an ally is caught in the splash, so be it (friendly fire).
      let aoeTargets = calculateAoeTargets(centerSlot, 'all', card.aoeSlots ?? 3);

      // Filter AOE splash targets by caster's maxRange (splash shouldn't exceed card range)
      if (card.maxRange) {
        aoeTargets = aoeTargets.filter(t => Math.abs(caster.slotIndex - t.slotIndex) <= card.maxRange!);
      }
      return aoeTargets;
    }

    case 'ally': {
      if (!targetId) return null;
      const target = gameState.characters.find(c => c.id === targetId);
      if (!target) return null;
      if (target.isPlayer !== caster.isPlayer) return null;
      return [target];
    }

    case 'enemy': {
      if (!targetId) return null;
      const target = gameState.characters.find(c => c.id === targetId);
      if (!target) return null;
      if (target.isPlayer === caster.isPlayer) return null;
      return [target];
    }

    default: {
      if (!targetId) return null;
      const target = gameState.characters.find(c => c.id === targetId);
      if (!target) return null;
      return [target];
    }
  }
}

/**
 * Determine which characters an AI-controlled caster should consider as targets
 * for a given card, based on the card's targeting mode (relative to caster).
 */
function getAITargetCandidates(card: Card, caster: Character): Character[] {
  const gameState = getGameState();

  switch (card.targeting) {
    case 'self':
    case 'allAllies':
    case 'allEnemies':
      return [caster]; // these modes don't need a specific targetId
    case 'ally':
      return gameState.characters.filter(c => c.isPlayer === caster.isPlayer && c.hp > 0);
    case 'aoe':
      if (card.targetSide === 'ally') {
        return gameState.characters.filter(c => c.isPlayer === caster.isPlayer && c.hp > 0);
      }
      return gameState.characters.filter(c => c.isPlayer !== caster.isPlayer && c.hp > 0);
    case 'enemy':
    default:
      return gameState.characters.filter(c => c.isPlayer !== caster.isPlayer && c.hp > 0);
  }
}

type AoePlan = {
  targetId: string | null;
  score: number;
  opponentHits: number;
};

/**
 * For an AOE card, find the best center slot that maximises damage to opponents
 * while minimising friendly-fire. Evaluates every in-range slot from the provided
 * casterSlot and returns score metadata for AI planning.
 */
function evaluateBestAoePlan(card: Card, caster: Character, casterSlot: number): AoePlan {
  const gameState = getGameState();
  const aoeSlots = card.aoeSlots ?? 3;

  // Estimate raw damage from the card (sum of all damage / aoe_damage effects)
  let estimatedDamage = 0;
  for (const eff of card.effects) {
    if (eff.kind === 'damage' || eff.kind === 'aoe_damage') {
      estimatedDamage += eff.amount;
    }
  }

  let bestScore = -Infinity;
  let bestTargetId: string | null = null;
  let bestOpponentHits = 0;

  const allLiving = gameState.characters.filter(c => c.hp > 0);

  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    // Range check from caster
    const dist = Math.abs(casterSlot - slot);
    if (card.maxRange && dist > card.maxRange) continue;
    if (card.minRange && dist < card.minRange) continue;

    // Who would the blast hit?
    let targets = calculateAoeTargets(slot, 'all', aoeSlots);
    if (card.maxRange) {
      targets = targets.filter(t => Math.abs(casterSlot - t.slotIndex) <= card.maxRange!);
    }
    if (targets.length === 0) continue;

    let score = 0;
    let hitsOpponent = false;
    let opponentHits = 0;

    for (const t of targets) {
      if (t.isPlayer !== caster.isPlayer) {
        // Hitting an opponent — good
        score += 2;
        hitsOpponent = true;
        opponentHits++;
      } else if (t.id === caster.id) {
        // Hitting self — very bad, especially if lethal
        score -= (caster.hp <= estimatedDamage) ? 10 : 3;
      } else {
        // Hitting an ally — bad
        score -= 1.5;
      }
    }

    // Must actually hit at least one opponent
    if (!hitsOpponent) continue;

    if (score > bestScore) {
      bestScore = score;
      bestOpponentHits = opponentHits;
      // Use the character on that slot (if any) as the target, else a raw slot ref
      const charOnSlot = allLiving.find(c => getOccupiedSlots(c).includes(slot));
      bestTargetId = charOnSlot ? charOnSlot.id : `slot:${slot}`;
    }
  }

  if (bestScore <= 0 || !bestTargetId) {
    return { targetId: null, score: -Infinity, opponentHits: 0 };
  }
  return { targetId: bestTargetId, score: bestScore, opponentHits: bestOpponentHits };
}

function canMoveForwardForPlanning(char: Character): boolean {
  const allLiving = getGameState().characters.filter(c => c.hp > 0);
  const enemies = allLiving.filter(c => c.isPlayer !== char.isPlayer);
  const friendlies = allLiving.filter(c => c.isPlayer === char.isPlayer && c.id !== char.id);
  const slotSize = getCharacterSlotSize(char);
  const targetSlot = char.isPlayer ? char.slotIndex + 1 : char.slotIndex - 1;
  const targetRange = Array.from({ length: slotSize }, (_, i) => targetSlot + i);

  if (targetRange.some(slot => slot < 0 || slot >= MAX_SLOTS)) return false;

  const blockedByEnemy = enemies.some(enemy =>
    rangesOverlap(getOccupiedSlots(enemy), targetRange),
  );
  if (blockedByEnemy) return false;

  const friendlyBlockers = friendlies.filter(friendly =>
    rangesOverlap(getOccupiedSlots(friendly), targetRange),
  );
  if (friendlyBlockers.length === 0) {
    return canOccupyRange(targetSlot, slotSize, char.isPlayer, allLiving, char.id);
  }

  const singleBlocker = friendlyBlockers.length === 1 ? friendlyBlockers[0] : null;
  return !!(
    slotSize === 1 &&
    singleBlocker &&
    getCharacterSlotSize(singleBlocker) === 1 &&
    singleBlocker.slotIndex === targetSlot &&
    canOccupyRange(char.slotIndex, 1, char.isPlayer, allLiving.filter(c => c.id !== char.id), singleBlocker.id)
  );
}

/**
 * Determine the cost to move 1 slot for a character, based on speed and moveCharges.
 *
 * Speed >= 0: charges system. Spend 1 energy, get `speed` bonus charges.
 *   speed 0 (baseline): 1 energy = 1 slot. speed 1: 1 energy = 2 slots. etc.
 * Speed < 0: penalised. Each slot costs 1 + abs(speed) energy, no charges.
 */
export function getMoveCost(char: Character): { energyCost: number; usesCharge: boolean } {
  if (char.speed < 0) return { energyCost: 1 + Math.abs(char.speed), usesCharge: false };
  if (char.moveCharges > 0) return { energyCost: 0, usesCharge: true };
  return { energyCost: 1, usesCharge: false };
}

/**
 * Move a character forward (toward center/opponent) one slot.
 * Unified slot model: allies on left (low indices), enemies on right (high indices).
 * - If target slot has a friendly: swap (they move back).
 * - If target slot has an opposing unit: movement is blocked.
 */
export function moveCharacterForward(characterId: string, renderCallback?: () => void): boolean {
  const gameState = getGameState();
  const char = gameState.characters.find(c => c.id === characterId);
  if (!char || char.hp <= 0) return false;

  const { energyCost, usesCharge } = getMoveCost(char);
  if (!usesCharge && char.energy < energyCost) return false;

  const allLiving = gameState.characters.filter(c => c.hp > 0);
  const friendlies = allLiving.filter(c => c.isPlayer === char.isPlayer && c.id !== char.id);
  const enemies = allLiving.filter(c => c.isPlayer !== char.isPlayer);
  const slotSize = getCharacterSlotSize(char);
  // Forward = toward opponent: ally goes +1, enemy goes -1
  const targetSlot = char.isPlayer ? char.slotIndex + 1 : char.slotIndex - 1;
  const targetRange = Array.from({ length: slotSize }, (_, i) => targetSlot + i);

  const blockedByEnemy = enemies.some(enemy =>
    rangesOverlap(getOccupiedSlots(enemy), targetRange)
  );
  if (blockedByEnemy) return false;

  // Preserve legacy swap behavior for 1-slot friendlies only.
  const friendlyBlockers = friendlies.filter(friendly =>
    rangesOverlap(getOccupiedSlots(friendly), targetRange)
  );
  if (friendlyBlockers.length > 0) {
    const singleBlocker = friendlyBlockers.length === 1 ? friendlyBlockers[0] : null;
    if (
      slotSize === 1 &&
      singleBlocker &&
      getCharacterSlotSize(singleBlocker) === 1 &&
      singleBlocker.slotIndex === targetSlot &&
      canOccupyRange(char.slotIndex, 1, char.isPlayer, allLiving.filter(c => c.id !== char.id), singleBlocker.id)
    ) {
      singleBlocker.slotIndex = char.slotIndex;
      char.slotIndex = targetSlot;
    } else {
      return false;
    }
  } else {
    if (!canOccupyRange(targetSlot, slotSize, char.isPlayer, allLiving, char.id)) {
      return false;
    }
    char.slotIndex = targetSlot;
  }

  // Deduct cost: use charge if available, else spend energy and bank bonus charges
  if (usesCharge) {
    char.moveCharges--;
    addToCombatLog(`${char.name} moves forward (free move, ${char.moveCharges} charges left)`);
  } else {
    char.energy -= energyCost;
    // Bank bonus charges: speed = total slots per energy, minus the move we just made
    if (char.speed > 0) {
      char.moveCharges = char.speed - 1;
    }
    addToCombatLog(`${char.name} moves forward (${energyCost} energy)`);
  }
  const movementHazardDamage = applyLaneHazardsToCharacter(char, 'movement', renderCallback);
  if (movementHazardDamage > 0 || char.hp <= 0) {
    checkCombatResolutionAfterHazards();
  }
  if (renderCallback) renderCallback();
  return true;
}

/**
 * Move a character back (away from center/opponent) one slot.
 * - If target slot has a friendly: swap (they move forward).
 * - Ally at slot 0 or enemy at max slot cannot move back (would go negative / off-grid).
 */
export function moveCharacterBack(characterId: string, renderCallback?: () => void): boolean {
  const gameState = getGameState();
  const char = gameState.characters.find(c => c.id === characterId);
  if (!char || char.hp <= 0) return false;
  // Back = away from opponent: ally goes -1, enemy goes +1
  const targetSlot = char.isPlayer ? char.slotIndex - 1 : char.slotIndex + 1;

  const { energyCost, usesCharge } = getMoveCost(char);
  if (!usesCharge && char.energy < energyCost) return false;

  const allLiving = gameState.characters.filter(c => c.hp > 0);
  const friendlies = allLiving.filter(c => c.isPlayer === char.isPlayer && c.id !== char.id);
  const enemies = allLiving.filter(c => c.isPlayer !== char.isPlayer);
  const slotSize = getCharacterSlotSize(char);
  const targetRange = Array.from({ length: slotSize }, (_, i) => targetSlot + i);

  const blockedByEnemy = enemies.some(enemy =>
    rangesOverlap(getOccupiedSlots(enemy), targetRange)
  );
  if (blockedByEnemy) return false;

  // Preserve legacy swap behavior for 1-slot friendlies only.
  const friendlyBlockers = friendlies.filter(friendly =>
    rangesOverlap(getOccupiedSlots(friendly), targetRange)
  );
  if (friendlyBlockers.length > 0) {
    const singleBlocker = friendlyBlockers.length === 1 ? friendlyBlockers[0] : null;
    if (
      slotSize === 1 &&
      singleBlocker &&
      getCharacterSlotSize(singleBlocker) === 1 &&
      singleBlocker.slotIndex === targetSlot &&
      canOccupyRange(char.slotIndex, 1, char.isPlayer, allLiving.filter(c => c.id !== char.id), singleBlocker.id)
    ) {
      singleBlocker.slotIndex = char.slotIndex;
      char.slotIndex = targetSlot;
    } else {
      return false;
    }
  } else {
    if (!canOccupyRange(targetSlot, slotSize, char.isPlayer, allLiving, char.id)) {
      return false;
    }
    char.slotIndex = targetSlot;
  }

  // Deduct cost: use charge if available, else spend energy and bank bonus charges
  if (usesCharge) {
    char.moveCharges--;
    addToCombatLog(`${char.name} moves back (free move, ${char.moveCharges} charges left)`);
  } else {
    char.energy -= energyCost;
    // Bank bonus charges: speed = total slots per energy, minus the move we just made
    if (char.speed > 0) {
      char.moveCharges = char.speed - 1;
    }
    addToCombatLog(`${char.name} moves back (${energyCost} energy)`);
  }
  const movementHazardDamage = applyLaneHazardsToCharacter(char, 'movement', renderCallback);
  if (movementHazardDamage > 0 || char.hp <= 0) {
    checkCombatResolutionAfterHazards();
  }
  if (renderCallback) renderCallback();
  return true;
}

/**
 * Apply knockback to a target, pushing them back (away from caster) by up to `amount` slots.
 * Each step requires a free space — stops early if blocked or at grid edge.
 * Returns the number of slots actually moved.
 *
 * "Back" for an enemy (isPlayer=false) = +1 slotIndex (away from allies)
 * "Back" for an ally  (isPlayer=true)  = -1 slotIndex (away from enemies)
 */
export function applyKnockback(target: Character, amount: number, renderCallback?: () => void): number {
  const gameState = getGameState();
  const allLiving = gameState.characters.filter(c => c.hp > 0);
  const targetSize = getCharacterSlotSize(target);

  // Positive amount = push back (away from caster), negative = pull forward (toward caster)
  const backDirection = target.isPlayer ? -1 : 1;
  const direction = amount >= 0 ? backDirection : -backDirection;
  const steps = Math.abs(amount);
  let slotsMoved = 0;
  let hazardDamageTotal = 0;

  for (let step = 0; step < steps; step++) {
    const nextSlot = target.slotIndex + direction;
    if (!canOccupyRange(nextSlot, targetSize, target.isPlayer, allLiving, target.id)) break;
    target.slotIndex = nextSlot;
    slotsMoved++;
    hazardDamageTotal += applyLaneHazardsToCharacter(target, 'movement', renderCallback);
    if (target.hp <= 0) break;
  }

  if (hazardDamageTotal > 0 || target.hp <= 0) {
    checkCombatResolutionAfterHazards();
  }
  return slotsMoved;
}

/**
 * Set the PIXI application (needed for animations)
 */
export function setApp(application: Application): void {
  app = application;
}

/**
 * Play a card
 */
export async function playCard(cardId: string, targetId?: string, renderCallback?: () => void): Promise<void> {
  if (!app) return;
  
  const gameState = getGameState();
  // Block card plays after combat is over
  if (gameState.combatResult !== 'ongoing') return;

  const currentPlayer = gameState.characters.find(c => c.id === gameState.currentPlayerId);
  const card = getResolvedCard(cardId);
  
  if (!currentPlayer || !card) return;
  
  // Calculate suppression energy penalty for ranged cards
  const suppressionPenalty = getSuppressionCostPenalty(currentPlayer, card);
  const totalEnergyCost = card.cost.energy + suppressionPenalty;

  if (currentPlayer.energy < totalEnergyCost) return;
  if (!currentPlayer.hand.includes(cardId)) return;
  
  // Determine targets based on targeting mode (relative to caster)
  const targets = resolveCardTargets(card, currentPlayer, targetId);
  if (!targets || targets.length === 0) return;

  // Range validation: if card has maxRange/minRange, verify primary target is within range
  if ((card.maxRange || card.minRange) && targetId && card.targeting !== 'self') {
    const targetSlot = resolveTargetSlot(targetId);
    if (targetSlot !== null) {
      const distance = Math.abs(currentPlayer.slotIndex - targetSlot);
      if (card.maxRange && distance > card.maxRange) {
        addToCombatLog(`${card.name} failed - target out of range!`);
        return;
      }
      if (card.minRange && distance < card.minRange) {
        addToCombatLog(`${card.name} failed - target too close!`);
        return;
      }
    }
  }

  // Calculate range modifier for damage effects
  // Uses primary target distance; AOE uses the same modifier for all targets
  let rangeModifier = 1.0;
  if (card.optimalRange !== undefined && targetId && card.targeting !== 'self') {
    const targetSlot = resolveTargetSlot(targetId);
    if (targetSlot !== null) {
      const distance = Math.abs(currentPlayer.slotIndex - targetSlot);
      rangeModifier = calculateRangeModifier(distance, card.optimalRange, { character: currentPlayer, card });
    }
  }

  // Log card hit for observability (X card hit X enemies/allies)
  const targetSide: 'enemy' | 'ally' = targets[0]?.isPlayer ? 'ally' : 'enemy';
  logCardHit(
    card.name,
    currentPlayer.name,
    currentPlayer.isPlayer,
    targets.length,
    targets.map(t => t.name),
    targetSide
  );

  // Consume energy BEFORE processing effects (so failed effects still cost energy)
  currentPlayer.energy -= totalEnergyCost;
  if (suppressionPenalty > 0) {
    addToCombatLog(`${currentPlayer.name} pays +${suppressionPenalty} energy (suppressed!)`);
  }

  const exhaustText = card.exhaust ? ' (Exhaust)' : '';
  const rangeText = rangeModifier !== 1.0
    ? ` [${Math.round(rangeModifier * 100)}% range]`
    : '';
  addToCombatLog(`${currentPlayer.name} plays ${card.name}${exhaustText}${rangeText}`);

  // Remove card from hand immediately so it vanishes on the next render
  const cardTemplateId = 'templateId' in card ? (card as any).templateId : card.id;
  currentPlayer.hand = currentPlayer.hand.filter(id => id !== cardId);
  if (card.exhaust) {
    addToCombatLog(`${card.name} is exhausted`);
  } else {
    currentPlayer.discardPile.push(cardTemplateId);
  }
  gameState.selectedCardId = null;

  // Render immediately after state changes to show updated energy/card state.
  // Skip if card has damage effects and attacker/target has sprite sheet animation - that render
  // would clear the stage and remove sprites we're about to animate (see damage case below).
  const hasDamageEffect = card.effects.some((e: CardEffect) => e.kind === 'damage' || e.kind === 'aoe_damage');
  const attackerDefPre = gameState.characterLibrary[currentPlayer.id];
  const targetDefPre = targets[0] ? gameState.characterLibrary[targets[0].id] : null;
  const hasSpriteSheetAnim = hasDamageEffect && (
    (attackerDefPre?.spriteSheet && attackerDefPre?.spriteSheetLayout) ||
    (targetDefPre?.spriteSheet && targetDefPre?.spriteSheetLayout)
  );
  if (renderCallback && !hasSpriteSheetAnim) {
    renderCallback();
  }

  // Fire the card showcase animation AFTER render so it layers on top
  // (render clears the stage, so anything added before render gets destroyed).
  // Runs concurrently with effect animations and is awaited at the end.
  let cardShowcasePromise: Promise<void> | null = null;
  if (app) {
    cardShowcasePromise = animateCardPlayShowcase(
      app,
      card.name,
      card.cost.energy,
      currentPlayer.name,
      currentPlayer.isPlayer,
    );
  }
  
  // Animation will be handled per-effect in the effect processing loop below
  
  // Process all effects (including modifiers which may add more effects)
  const registry = getModifierRegistry();
  const effectsToProcess: CardEffect[] = [...card.effects];
  let effectIndex = 0;
  
  while (effectIndex < effectsToProcess.length) {
    const effect = effectsToProcess[effectIndex];
    effectIndex++;
    
    // Handle modifier effects (conditional effects)
    if (effect.kind === 'modifier') {
      // Check if condition is met
      let conditionMet = true;
      if (effect.when?.target_has_tag) {
        // Check if target has the tag
        const targetChar = targets.length > 0 ? targets[0] : currentPlayer;
        const cardData = gameState.cardLibrary[targetChar.id] || gameState.characterLibrary[targetChar.id];
        conditionMet = cardData?.tags?.includes(effect.when.target_has_tag) || false;
      }
      
      if (conditionMet && effect.apply) {
        // Add conditional effects to process
        effectsToProcess.push(...effect.apply);
      }
      continue;
    }
    
    // Handle deck injection
    if (effect.kind === 'deck_inject') {
      const injectTarget = effect.target === 'self' 
        ? [currentPlayer]
        : effect.target === 'allies'
        ? gameState.characters.filter(c => c.isPlayer === currentPlayer.isPlayer && c.hp > 0)
        : gameState.characters.filter(c => c.isPlayer !== currentPlayer.isPlayer && c.hp > 0);
      
      const copies = effect.copies || 1;
      injectTarget.forEach(target => {
        for (let i = 0; i < copies; i++) {
          target.deck.push(effect.card);
        }
        addToCombatLog(`${target.name} gains ${copies} ${effect.card} in deck`);
      });
      continue;
    }

    if (effect.kind === 'lane_hazard') {
      if (!targetId) continue;
      const laneHazard = effect as LaneHazardEffect;
      const slot = resolveTargetSlot(targetId);
      if (slot === null) continue;

      const damage = Math.max(0, Math.floor(laneHazard.damage));
      const durationTurns = Math.max(1, Math.floor(laneHazard.duration_turns));
      const existing = gameState.laneHazards.find(h =>
        h.slotIndex === slot && h.ownerIsPlayer === currentPlayer.isPlayer
      );

      if (existing) {
        existing.damage += damage;
        existing.remainingTurns += durationTurns;
        addToCombatLog(`${card.name} intensifies flames on lane ${slot} (+${damage} dmg, +${durationTurns} turns)`);
      } else {
        gameState.laneHazards.push({
          slotIndex: slot,
          damage,
          remainingTurns: durationTurns,
          ownerIsPlayer: currentPlayer.isPlayer,
          sourceCardId: card.id,
        });
        addToCombatLog(`${card.name} ignites lane ${slot} (${damage} fire, ${durationTurns} turns)`);
      }

      if (renderCallback) {
        renderCallback();
      }
      continue;
    }
    
    // Resolve per-effect targets (may differ from card-level targets)
    let effectTargets = resolveEffectTargets(effect, currentPlayer, targets, targetId, card);
    
    // Knockback AOE: process back-to-front so rearmost target moves first,
    // freeing space for the next one.  "Back" = +slotIndex for enemies, -slotIndex for allies.
    if (effect.kind === 'knockback' && effectTargets.length > 1) {
      const firstTarget = effectTargets[0];
      if (firstTarget) {
        effectTargets = [...effectTargets].sort((a, b) =>
          firstTarget.isPlayer ? a.slotIndex - b.slotIndex : b.slotIndex - a.slotIndex
        );
      }
    }
    
    // For AOE effects, animate on all targets in parallel
    const animationPromises: Promise<void>[] = [];
    
    for (const target of effectTargets) {
      let sparkType: 'damage' | 'heal' | 'buff' | 'energy' = 'damage';
      let animationPromise: Promise<void> | null = null;
      
      switch (effect.kind) {
        case 'damage':
          const rawDamage = Math.round(effect.amount * rangeModifier);
          const casterDmgMod = registry.resolve('damage_dealt', rawDamage, { character: currentPlayer, card });
          const adjustedDamage = Math.round(registry.resolve('damage_received', casterDmgMod, { character: target, card }));
          gameState.stats.cumulativeDamage += adjustedDamage;
          const actualDamage = applyDamageWithBlock(target, adjustedDamage);
          if (actualDamage > 0) {
            addToCombatLog(`${target.name} [slot ${target.slotIndex}] takes ${actualDamage} damage`);
            // Defer render for AOE until after animations - otherwise dead targets are removed
            // and characterSprites gets overwritten, causing animations to stack on surviving enemy
            const et = (effect as BaseCardEffect).effectTarget;
            const isAoeStyle = effectTargets.length > 1 || et === 'aoe' || et === 'allEnemies' || et === 'allAllies'
              || card.targeting === 'aoe' || card.targeting === 'allEnemies' || card.targeting === 'allAllies';
            if (renderCallback && !isAoeStyle) {
              renderCallback();
            }
            const gameStateForAnim = getGameState();
            const attackerDef = gameStateForAnim.characterLibrary[currentPlayer.id];
            const targetDef = gameStateForAnim.characterLibrary[target.id];
            const spriteSheets: PlayDamageAnimationOptions = {};
            if (attackerDef?.spriteSheet && attackerDef?.spriteSheetLayout) {
              spriteSheets.attackerSpriteSheet = { path: attackerDef.spriteSheet, layout: attackerDef.spriteSheetLayout };
            }
            if (targetDef?.spriteSheet && targetDef?.spriteSheetLayout) {
              spriteSheets.targetSpriteSheet = { path: targetDef.spriteSheet, layout: targetDef.spriteSheetLayout };
            }
            const hasSpriteSheetAnim = Object.keys(spriteSheets).length > 0;
            // Defer render when playing sprite sheet animation (same as AOE) - render clears the stage
            // and would remove the sprites we're animating before they're visible
            if (renderCallback && !isAoeStyle && !hasSpriteSheetAnim) {
              renderCallback();
            }
            animationPromise = Promise.all([
              playDamageAnimation(
                currentPlayer.id,
                target.id,
                actualDamage,
                app,
                card.targeting,
                card.animationConfig as AnimationConfig | undefined,
                card.type,
                Object.keys(spriteSheets).length > 0 ? spriteSheets : undefined
              ),
              animateDamageFlash(app, actualDamage),
              animateEnhancedScreenShake(app, actualDamage)
            ]).then(() => {
              if (renderCallback && hasSpriteSheetAnim) renderCallback();
              return undefined;
            });
          }
          if (target.hp <= 0) {
            logCharacterDefeated(target.name, target.id, target.isPlayer);
            addToCombatLog(`${target.name} is defeated!`);
          }
          break;

        case 'aoe_damage':
          // AOE damage is similar to regular damage but uses range modifier
          const rawAoeDamage = Math.round(effect.amount * rangeModifier);
          const casterAoeMod = registry.resolve('damage_dealt', rawAoeDamage, { character: currentPlayer, card });
          const aoeDamage = Math.round(registry.resolve('damage_received', casterAoeMod, { character: target, card }));
          gameState.stats.cumulativeDamage += aoeDamage;
          const actualAoEDamage = applyDamageWithBlock(target, aoeDamage);
          if (actualAoEDamage > 0) {
            addToCombatLog(`${target.name} [slot ${target.slotIndex}] takes ${actualAoEDamage} AOE damage`);
            // Defer render for AOE until after animations (see damage case)
            const aoeEt = (effect as BaseCardEffect).effectTarget;
            const isAoeStyle = effectTargets.length > 1 || aoeEt === 'aoe' || aoeEt === 'allEnemies' || aoeEt === 'allAllies'
              || card.targeting === 'aoe' || card.targeting === 'allEnemies' || card.targeting === 'allAllies';
            if (renderCallback && !isAoeStyle) {
              renderCallback();
            }
            const gameStateForAoeAnim = getGameState();
            const attackerDefAoe = gameStateForAoeAnim.characterLibrary[currentPlayer.id];
            const targetDefAoe = gameStateForAoeAnim.characterLibrary[target.id];
            const spriteSheetsAoe: PlayDamageAnimationOptions = {};
            if (attackerDefAoe?.spriteSheet && attackerDefAoe?.spriteSheetLayout) {
              spriteSheetsAoe.attackerSpriteSheet = { path: attackerDefAoe.spriteSheet, layout: attackerDefAoe.spriteSheetLayout };
            }
            if (targetDefAoe?.spriteSheet && targetDefAoe?.spriteSheetLayout) {
              spriteSheetsAoe.targetSpriteSheet = { path: targetDefAoe.spriteSheet, layout: targetDefAoe.spriteSheetLayout };
            }
            const hasSpriteSheetAnimAoe = Object.keys(spriteSheetsAoe).length > 0;
            if (renderCallback && !isAoeStyle && !hasSpriteSheetAnimAoe) {
              renderCallback();
            }
            animationPromise = Promise.all([
              playDamageAnimation(
                currentPlayer.id,
                target.id,
                actualAoEDamage,
                app,
                'aoe',
                card.animationConfig as AnimationConfig | undefined,
                card.type,
                Object.keys(spriteSheetsAoe).length > 0 ? spriteSheetsAoe : undefined
              ),
              animateParticles(target.id, 'fire', 20, app) // AOE uses fire particles
            ]).then(() => {
              if (renderCallback && hasSpriteSheetAnimAoe) renderCallback();
              return undefined;
            });
          }
          if (target.hp <= 0) {
            logCharacterDefeated(target.name, target.id, target.isPlayer);
            addToCombatLog(`${target.name} is defeated!`);
          }
          break;

        case 'heal':
          // Use the target from targeting logic (already determined correctly)
          const healTarget = target;
          const adjustedHeal = Math.round(registry.resolve('heal_amount', effect.amount, { character: healTarget, card }));
          healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + adjustedHeal);
          if (!gameState.stats.cumulativeHeal) {
            gameState.stats.cumulativeHeal = 0;
          }
          gameState.stats.cumulativeHeal += adjustedHeal;
          addToCombatLog(`${healTarget.name} heals ${adjustedHeal} HP`);
          sparkType = 'heal';
          // Render immediately to show updated HP
          if (renderCallback) {
            renderCallback();
          }
          // Play heal animation with particles
          animationPromise = Promise.all([
            playHealAnimation(
              healTarget.id,
              adjustedHeal,
              app,
              card.targeting,
              card.animationConfig as AnimationConfig | undefined
            ),
            animateParticles(healTarget.id, 'healing', 15, app)
          ]).then(() => undefined);
          break;
          
        case 'energy':
          const resolvedMaxE = registry.resolve('maxEnergy', currentPlayer.maxEnergy, { character: currentPlayer });
          currentPlayer.energy = Math.min(resolvedMaxE, currentPlayer.energy + effect.amount);
          addToCombatLog(`${currentPlayer.name} gains ${effect.amount} energy`);
          sparkType = 'energy';
          // Render immediately to show updated energy
          if (renderCallback) {
            renderCallback();
          }
          // Use legacy spark animation for energy
          animationPromise = animateCharachterSpark(currentPlayer.id, sparkType, app);
          break;
          
        case 'speed': {
          const speedTarget = (effect as SpeedEffect).effectTarget === 'self' ? currentPlayer : target;
          speedTarget.speed += effect.amount;
          const verb = effect.amount >= 0 ? 'gains' : 'loses';
          addToCombatLog(`${speedTarget.name} ${verb} ${Math.abs(effect.amount)} speed (now ${speedTarget.speed})`);
          sparkType = effect.amount >= 0 ? 'energy' : 'damage';
          // Render immediately (for visual consistency)
          if (renderCallback) {
            renderCallback();
          }
          animationPromise = animateCharachterSpark(speedTarget.id, sparkType, app);
          break;
        }
          
        case 'grant_block_layer':
          // Use the target from targeting logic (already determined correctly)
          const blockTarget = target;
          const adjustedBlock = Math.round(registry.resolve('block_amount', effect.amount, { character: blockTarget, card }));
          grantBlockLayer(
            blockTarget,
            adjustedBlock,
            effect.decay_percent || 50,
            card.id
          );
          sparkType = 'heal';
          // Render immediately to show updated block
          if (renderCallback) {
            renderCallback();
          }
          // Use legacy spark animation for block
          animationPromise = animateCharachterSpark(blockTarget.id, sparkType, app);
          break;
          
        case 'status':
          // Use the target from targeting logic (already determined correctly)
          const statusTarget = target;
          const statusId = effect.status;
          applyStatus(
            statusTarget,
            statusId,
            effect.stacks || 1,
            effect.duration,
            undefined // metadata if needed
          );
          sparkType = 'buff';
          // Render immediately to show updated status
          if (renderCallback) {
            renderCallback();
          }
          
          // Choose particle type based on status
          let particleType = 'healing'; // default
          if (statusId === 'bleed' || statusId === 'shock') {
            particleType = 'fire';
          } else if (statusId === 'radiation') {
            particleType = 'shadow';
          } else if (statusId === 'fortify') {
            particleType = 'ice';
          }
          
          // Animate status with particles
          animationPromise = Promise.all([
            animateCharachterSpark(statusTarget.id, sparkType, app),
            animateParticles(statusTarget.id, particleType, 10, app)
          ]).then(() => undefined);
          break;

        case 'status_modify':
          const modTarget = target;
          const modStatusId = effect.status;
          const modOp = effect.op;
          const modValue = effect.amount;
          modifyStatusStacks(modTarget, modStatusId, modOp, modValue);
          sparkType = 'buff';
          if (renderCallback) {
            renderCallback();
          }
          animationPromise = Promise.all([
            animateCharachterSpark(modTarget.id, sparkType, app),
            animateParticles(modTarget.id, 'shadow', 10, app)
          ]).then(() => undefined);
          break;

        case 'status_spread': {
          const spreadEffect = effect as StatusSpreadEffect;
          const spreadStatusId = spreadEffect.status;
          const sourceStacks = getStatusStacks(target, spreadStatusId);
          if (sourceStacks > 0) {
            const fraction = spreadEffect.fraction ?? 0.5;
            const roundFn = spreadEffect.round === 'ceil' ? Math.ceil : Math.floor;
            const spreadStacks = roundFn(sourceStacks * fraction);
            if (spreadStacks > 0) {
              const spreadRange = Math.max(0, Math.floor(spreadEffect.spreadRange ?? 1));
              const spreadSide = spreadEffect.spreadSide ?? 'same';
              // Find targets within spreadRange slots of primary target based on side mode.
              const adjacentTargets = getGameState().characters.filter(c =>
                c.hp > 0 &&
                c.id !== target.id &&
                Math.abs(c.slotIndex - target.slotIndex) <= spreadRange &&
                (
                  spreadSide === 'both'
                  || (spreadSide === 'same' && c.isPlayer === target.isPlayer)
                  || (spreadSide === 'opposing' && c.isPlayer !== target.isPlayer)
                )
              );
              for (const adj of adjacentTargets) {
                applyStatus(adj, spreadStatusId, spreadStacks);
              }
              if (adjacentTargets.length > 0) {
                addToCombatLog(`${spreadStatusId} spreads to ${adjacentTargets.length} adjacent target${adjacentTargets.length > 1 ? 's' : ''} (${spreadStacks} stacks each)`);
                sparkType = 'buff';
                // Animate all adjacent targets
                const spreadAnims = adjacentTargets.map(adj =>
                  Promise.all([
                    animateCharachterSpark(adj.id, 'buff', app),
                    animateParticles(adj.id, 'shadow', 8, app)
                  ])
                );
                animationPromise = Promise.all(spreadAnims).then(() => undefined);
              }
            }
          }
          if (renderCallback) {
            renderCallback();
          }
          break;
        }

        case 'knockback':
          const knockbackTarget = target;
          const slotBefore = knockbackTarget.slotIndex;
          const slotsMoved = applyKnockback(knockbackTarget, effect.amount, renderCallback);
          if (slotsMoved > 0) {
            const knockLabel = effect.amount < 0 ? 'pulled' : 'knocked back';
            addToCombatLog(`${knockbackTarget.name} is ${knockLabel} ${slotsMoved} slot${slotsMoved > 1 ? 's' : ''} (${slotBefore} → ${knockbackTarget.slotIndex})!`);
            sparkType = 'buff';
            // Render immediately to show updated position
            if (renderCallback) {
              renderCallback();
            }
            // Impact particles on the knocked-back target
            animationPromise = Promise.all([
              animateCharachterSpark(knockbackTarget.id, 'damage', app),
              animateParticles(knockbackTarget.id, 'ice', 12, app)
            ]).then(() => undefined);
          } else {
            const knockLabel = effect.amount < 0 ? 'pulled' : 'knocked back';
            addToCombatLog(`${knockbackTarget.name} can't be ${knockLabel} (no space)!`);
          }
          break;
      }
      
      // Add animation promise to array for parallel execution (for AOE)
      if (animationPromise) {
        animationPromises.push(animationPromise);
      } else if (effect.kind !== 'damage' && effect.kind !== 'aoe_damage' && effect.kind !== 'heal') {
        // Legacy spark animation for other effects
        animationPromises.push(animateCharachterSpark(target.id, sparkType, app));
      }
    }
    
    // Wait for all animations to complete (parallel for AOE/multi-target, sequential for single)
    if (animationPromises.length > 0) {
      if (effectTargets.length > 1) {
        // Multi-target: run animations in parallel
        await Promise.all(animationPromises);
      } else {
        // Single target: run sequentially for better visual clarity
        for (const promise of animationPromises) {
          await promise;
        }
      }
    }
  }

  // Check victory/defeat after effects resolve
  const livingEnemies = gameState.characters.filter(c => !c.isPlayer && c.hp > 0);
  const livingAllies = gameState.characters.filter(c => c.isPlayer && c.hp > 0);
  if (livingEnemies.length === 0 && gameState.combatResult === 'ongoing') {
    logAllEnemiesDead();
    gameState.combatResult = 'victory';
    // Pick a random gear reward
    const gearIds = Object.keys(gameState.gearLibrary);
    if (gearIds.length > 0) {
      const randomId = gearIds[Math.floor(Math.random() * gearIds.length)];
      gameState.pendingReward = gameState.gearLibrary[randomId];
    }
    gameState.isProcessingTurn = true; // Block further card plays
    addToCombatLog('Victory! All enemies defeated.');
  }
  if (livingAllies.length === 0 && gameState.combatResult === 'ongoing') {
    logAllAlliesDead();
    gameState.combatResult = 'defeat';
    addToCombatLog('Defeat! All allies have fallen.');
  }

  // Push to the played-cards stack
  gameState.playedCardsStack.push({
    templateId: cardTemplateId,
    playerName: currentPlayer.name,
    isPlayer: currentPlayer.isPlayer,
  });

  // Wait for the card showcase animation that was started before effects
  if (cardShowcasePromise) {
    await cardShowcasePromise;
  }

  // Final render to update the played-cards stack
  if (renderCallback) {
    renderCallback();
  }
}

// ── Speed-based turn queue ────────────────────────────────────────────

/**
 * Variance added to speed when building the turn queue.
 * With speeds 0-3 and variance 3:
 *   speed 3 → scores 3.0-6.0  (almost always first)
 *   speed 2 → scores 2.0-5.0
 *   speed 1 → scores 1.0-4.0
 *   speed 0 → scores 0.0-3.0  (almost always last)
 */
const SPEED_VARIANCE = 3;

/**
 * Build a randomised turn queue for the current round.
 * Characters are sorted by speed + random variance (descending).
 */
export function buildTurnQueue(): string[] {
  const gameState = getGameState();
  const living = gameState.characters.filter(c => c.hp > 0);
  const scored = living.map(c => ({
    id: c.id,
    score: c.speed + Math.random() * SPEED_VARIANCE,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.id);
}

/**
 * Process round-start effects for ALL living characters:
 *   1. Build a new turn queue
 *   2. Decay block layers
 *   3. Tick all statuses (replaces turn_end / side_end / round_end)
 *   4. Decay status durations
 *   5. Handle card expiration
 *   6. Check for deaths from DoTs
 */
export function processRoundStart(renderCallback?: () => void): void {
  const gameState = getGameState();
  let roundEndHazardDamage = 0;

  // Round-end environmental damage (fires tick before the new round starts).
  for (const character of gameState.characters.filter(c => c.hp > 0)) {
    roundEndHazardDamage += applyLaneHazardsToCharacter(character, 'round_end', renderCallback);
  }

  // Hazards lose one turn at each round transition.
  for (const hazard of gameState.laneHazards) {
    hazard.remainingTurns--;
    if (hazard.remainingTurns <= 0) {
      addToCombatLog(`Flames on lane ${hazard.slotIndex} burn out`);
    }
  }
  gameState.laneHazards = gameState.laneHazards.filter(h => h.remainingTurns > 0);
  if (roundEndHazardDamage > 0) {
    checkCombatResolutionAfterHazards();
  }
  if (roundEndHazardDamage > 0 && gameState.combatResult !== 'ongoing') {
    if (renderCallback) renderCallback();
    return;
  }

  gameState.roundNumber++;

  // Build new queue
  gameState.turnQueue = buildTurnQueue();
  gameState.turnQueueIndex = -1;

  const enemies = gameState.characters.filter(c => !c.isPlayer && c.hp > 0);
  const threatScore = enemies.reduce((sum, char) => {
    const def = gameState.characterLibrary[char.id];
    return def ? sum + computeDifficulty(def, gameState.cardLibrary) : sum;
  }, 0);
  addToCombatLog(
    `── Round ${gameState.roundNumber} ──${threatScore > 0 ? ` (Threat: ${Math.round(threatScore)})` : ''}`,
  );

  for (const character of gameState.characters.filter(c => c.hp > 0)) {
    // Block decay for all living characters
    decayBlockLayers(character);

    // Process all ticking statuses (single unified cadence)
    processStatusEffects(character, 'round_start');

    // Decay status durations
    decayStatusDurations(character);
  }

  // Handle card expiration for all characters
  for (const character of gameState.characters) {
    const expiredCards: string[] = [];

    for (const cardInstanceId of character.hand) {
      const cardInstance = gameState.cardInstances[cardInstanceId];
      if (cardInstance && cardInstance.turnsUntilExpiry !== undefined) {
        cardInstance.turnsUntilExpiry--;
        if (cardInstance.turnsUntilExpiry <= 0) {
          expiredCards.push(cardInstanceId);
          addToCombatLog(`${character.name}'s ${cardInstance.name} expires!`);
        }
      }
    }

    if (expiredCards.length > 0) {
      character.hand = character.hand.filter(id => !expiredCards.includes(id));
      expiredCards.forEach(id => {
        delete gameState.cardInstances[id];
      });
    }
  }

  // Check for deaths from round-start DoTs
  const livingEnemies = gameState.characters.filter(c => !c.isPlayer && c.hp > 0);
  const livingAllies = gameState.characters.filter(c => c.isPlayer && c.hp > 0);
  if (livingEnemies.length === 0 && gameState.combatResult === 'ongoing') {
    logAllEnemiesDead();
    gameState.combatResult = 'victory';
    const gearIds = Object.keys(gameState.gearLibrary);
    if (gearIds.length > 0) {
      const randomId = gearIds[Math.floor(Math.random() * gearIds.length)];
      gameState.pendingReward = gameState.gearLibrary[randomId];
    }
    gameState.isProcessingTurn = true;
    addToCombatLog('Victory! All enemies defeated.');
  }
  if (livingAllies.length === 0 && gameState.combatResult === 'ongoing') {
    logAllAlliesDead();
    gameState.combatResult = 'defeat';
    addToCombatLog('Defeat! All allies have fallen.');
  }

  // Rebuild queue after deaths (some characters may have died from DoTs)
  if (gameState.combatResult === 'ongoing') {
    gameState.turnQueue = buildTurnQueue();
  }

  if (renderCallback) {
    renderCallback();
  }
}

/**
 * End turn and advance to next character in the speed-based queue.
 * When the queue is exhausted, starts a new round (processRoundStart).
 */
export function endTurn(renderCallback?: () => void): void {
  const gameState = getGameState();
  if (gameState.combatResult !== 'ongoing') return;

  gameState.turnIndex++;
  gameState.turnQueueIndex++;

  // Queue exhausted or not yet built → start a new round
  if (gameState.turnQueueIndex >= gameState.turnQueue.length || gameState.turnQueue.length === 0) {
    processRoundStart(renderCallback);
    if (gameState.combatResult !== 'ongoing') return;
    gameState.turnQueueIndex = 0;
  }

  // Find next living character in the queue (skip dead ones killed by DoTs or mid-round)
  let nextPlayer: Character | undefined;
  while (gameState.turnQueueIndex < gameState.turnQueue.length) {
    const candidateId = gameState.turnQueue[gameState.turnQueueIndex];
    const candidate = gameState.characters.find(c => c.id === candidateId);
    if (candidate && candidate.hp > 0) {
      nextPlayer = candidate;
      break;
    }
    gameState.turnQueueIndex++;
  }

  // If we ran out of living characters in the queue, the round is over
  if (!nextPlayer) {
    // All remaining queue entries are dead — start fresh next call
    gameState.turnQueue = [];
    return;
  }

  gameState.currentPlayerId = nextPlayer.id;

  // Start-of-turn environmental damage (standing in hazards).
  const startHazardDamage = applyLaneHazardsToCharacter(nextPlayer, 'turn_start', renderCallback);
  if (startHazardDamage > 0 || nextPlayer.hp <= 0) {
    checkCombatResolutionAfterHazards();
    if (gameState.combatResult !== 'ongoing') {
      if (renderCallback) renderCallback();
      return;
    }
    if (nextPlayer.hp <= 0) {
      // Advance again if this character died before acting.
      endTurn(renderCallback);
      return;
    }
  }

  // Restore energy (resolved through modifier pipeline)
  const resolvedMaxEnergy = getModifierRegistry().resolve('maxEnergy', nextPlayer.maxEnergy, { character: nextPlayer });
  nextPlayer.energy = resolvedMaxEnergy;

  // Reset move charges for the new turn
  nextPlayer.moveCharges = 0;

  logTurnAdvance(nextPlayer.name, nextPlayer.id, nextPlayer.isPlayer, gameState.turnIndex);

  // Draw cards for new turn
  const resolvedDrawCount = getModifierRegistry().resolve('drawCount', nextPlayer.drawCount, { character: nextPlayer });
  drawCards(nextPlayer, resolvedDrawCount);

  // Clear selection
  gameState.selectedCardId = null;

  if (renderCallback) {
    renderCallback();
  }

  // If it's an enemy turn, trigger AI after a delay
  if (!nextPlayer.isPlayer) {
    setTimeout(() => {
      processEnemyTurn(nextPlayer!, renderCallback);
    }, 1000);
  }
}

/**
 * Helper: promisified setTimeout for readable async delays.
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate the maximum number of single-slot moves a character can make
 * with their current moveCharges + energy, respecting speed.
 */
function getMaxMoves(char: Character): number {
  let moves = char.moveCharges;
  let energy = char.energy;

  if (char.speed < 0) {
    // Each move costs (1 + |speed|) energy, no charges ever banked
    const costPerMove = 1 + Math.abs(char.speed);
    moves += Math.floor(energy / costPerMove);
  } else {
    // speed 0 or 1: 1 move per energy (no bonus charges)
    // speed N (N >= 2): each energy gives N moves (1 paid + N-1 charges)
    const movesPerEnergy = Math.max(1, char.speed);
    moves += energy * movesPerEnergy;
  }
  return moves;
}

/**
 * Score a candidate slot for an enemy, weighting four factors:
 *   1. Card Effectiveness (40) – average range modifier across the enemy's card pool
 *   2. Suppression Projection (25) – fraction of living players within suppression distance
 *   3. Frontline Bonus (20) – reward for being ahead of allied enemies
 *   4. Safety (15) – penalise overextension away from allies
 */
function scoreSlot(
  enemy: Character,
  candidateSlot: number,
  livingPlayers: Character[],
  livingEnemies: Character[],
): number {
  const gameState = getGameState();

  // ── 1. Card Effectiveness (weight 40) ──────────────────────────────
  const allTemplateIds = [...enemy.deck, ...enemy.discardPile, ...enemy.hand];
  let cardScore = 20; // neutral default if no cards
  if (allTemplateIds.length > 0) {
    let totalMod = 0;
    let counted = 0;
    for (const tid of allTemplateIds) {
      const tpl = gameState.cardLibrary[tid];
      if (!tpl) continue;
      // Find the best range modifier against any living player from this slot
      let bestMod = 0;
      for (const p of livingPlayers) {
        const dist = Math.abs(candidateSlot - p.slotIndex);
        const inRange =
          (!tpl.maxRange || dist <= tpl.maxRange) &&
          (!tpl.minRange || dist >= tpl.minRange);
        if (inRange) {
          bestMod = Math.max(bestMod, calculateRangeModifier(dist, tpl.optimalRange));
        }
      }
      // Out-of-range cards still contribute, but at a flat penalty
      totalMod += bestMod > 0 ? bestMod : 0.5;
      counted++;
    }
    // Normalise: range modifier is 0.7-1.2, so map to 0-40
    // Perfect (1.2) ➜ 40, worst in-range (0.7) ➜ ~23, out-of-range (0.5) ➜ ~17
    cardScore = counted > 0 ? (totalMod / counted) * (40 / 1.2) : 20;
  }

  // ── 2. Suppression Projection (weight 25) ──────────────────────────
  let suppressionScore = 0;
  if (enemy.suppression > 0) {
    const suppDist = getSuppressionDistance({ character: enemy });
    const suppressedCount = livingPlayers.filter(
      p => Math.abs(candidateSlot - p.slotIndex) <= suppDist,
    ).length;
    suppressionScore = (suppressedCount / Math.max(1, livingPlayers.length)) * 25;
  }

  // ── 3. Frontline Bonus (weight 20) ─────────────────────────────────
  // For enemies, "forward" = lower slotIndex (toward players).
  // Being ahead of other enemies protects the backline.
  const otherEnemies = livingEnemies.filter(e => e.id !== enemy.id);
  let frontlineScore = 10; // default neutral when solo
  if (otherEnemies.length > 0) {
    const avgAllySlot =
      otherEnemies.reduce((sum, e) => sum + e.slotIndex, 0) / otherEnemies.length;
    // Positive when candidate is ahead (lower slot) of average ally position
    const slotsAhead = avgAllySlot - candidateSlot;
    frontlineScore = Math.max(0, Math.min(20, 10 + slotsAhead * 5));
  }

  // ── 4. Safety (weight 15) ──────────────────────────────────────────
  let safetyScore = 15;
  if (otherEnemies.length > 0) {
    const nearestAllyDist = Math.min(
      ...otherEnemies.map(e => Math.abs(candidateSlot - e.slotIndex)),
    );
    // Lose 4 points per slot of isolation from nearest ally
    safetyScore = Math.max(0, 15 - nearestAllyDist * 4);
  }
  // Small penalty for standing adjacent to many players (risky)
  const adjacentPlayers = livingPlayers.filter(
    p => Math.abs(candidateSlot - p.slotIndex) <= 1,
  ).length;
  safetyScore = Math.max(0, safetyScore - adjacentPlayers * 2);

  return cardScore + suppressionScore + frontlineScore + safetyScore;
}

/**
 * After all cards are played, spend any leftover energy/charges moving
 * toward the highest-scoring slot within reach.
 *
 * Strategy (scoring-based):
 *  1. Calculate max moves the enemy can still make.
 *  2. Enumerate every reachable slot and score it.
 *  3. Pick the best slot (stay put if current slot already wins).
 *  4. Step toward it one slot at a time.
 */
function tryEnemyOptimalMove(enemy: Character, renderCallback?: () => void): boolean {
  const gameState = getGameState();
  const livingPlayers = gameState.characters.filter(c => c.isPlayer && c.hp > 0);
  if (livingPlayers.length === 0) return false;

  const livingEnemies = gameState.characters.filter(c => !c.isPlayer && c.hp > 0);
  const maxMoves = getMaxMoves(enemy);
  if (maxMoves <= 0) return false;

  // Enumerate reachable slots (enemy forward = lower index, back = higher)
  const minSlot = Math.max(0, enemy.slotIndex - maxMoves);
  const maxSlot = Math.min(MAX_SLOTS - 1, enemy.slotIndex + maxMoves);

  let bestSlot = enemy.slotIndex;
  let bestScore = scoreSlot(enemy, enemy.slotIndex, livingPlayers, livingEnemies);

  for (let slot = minSlot; slot <= maxSlot; slot++) {
    if (slot === enemy.slotIndex) continue;
    const score = scoreSlot(enemy, slot, livingPlayers, livingEnemies);
    if (score > bestScore) {
      bestScore = score;
      bestSlot = slot;
    }
  }

  // Already at best position – stay put
  if (bestSlot === enemy.slotIndex) return false;

  // Move toward the target slot one step at a time
  let moved = false;
  while (enemy.slotIndex !== bestSlot) {
    const needsForward = bestSlot < enemy.slotIndex; // enemy forward = lower index
    const step = needsForward
      ? moveCharacterForward(enemy.id, renderCallback)
      : moveCharacterBack(enemy.id, renderCallback);
    if (!step) break; // can't move further (blocked or out of resources)
    moved = true;
  }
  return moved;
}

/**
 * Process enemy turn with AI.
 *
 * The enemy will:
 *  1. Play every affordable card that has valid in-range targets.
 *  2. If cards exist but no target is in range, move forward to close the gap
 *     and retry (up to a safety cap to prevent infinite loops).
 *  3. Spend any remaining energy moving toward the optimal attack position
 *     for the next turn.
 *  4. End the turn.
 */
export async function processEnemyTurn(enemy: Character, renderCallback?: () => void): Promise<void> {
  const gameState = getGameState();
  if (gameState.isProcessingTurn) return;
  gameState.isProcessingTurn = true;

  addToCombatLog(`${enemy.name} is thinking...`);
  if (renderCallback) {
    renderCallback();
  }

  // Check if combat should end (all player characters dead)
  const livingPlayers = gameState.characters.filter(c => c.isPlayer && c.hp > 0);
  if (livingPlayers.length === 0) {
    logAllAlliesDead();
    addToCombatLog(`${enemy.name} has no targets!`);
    gameState.isProcessingTurn = false;
    endTurn(renderCallback);
    return;
  }

  // Initial thinking delay
  await delay(1000);

  let cardsPlayed = 0;
  let consecutiveMoveAttempts = 0;
  const MAX_MOVE_ATTEMPTS = 3; // safety cap so we never loop forever

  // ── Card-play loop ──────────────────────────────────────────────────
  while (true) {
    // Re-check living players (a previous card may have killed everyone)
    const alivePlayers = gameState.characters.filter(c => c.isPlayer && c.hp > 0);
    if (alivePlayers.length === 0) break;

    // Enemy might have died (e.g. thorns)
    if (enemy.hp <= 0) break;

    // Find cards the enemy can still afford (including suppression penalty)
    const playableCards = enemy.hand.filter(cardId => {
      const card = getResolvedCard(cardId);
      if (!card) return false;
      const penalty = getSuppressionCostPenalty(enemy, card);
      return enemy.energy >= card.cost.energy + penalty;
    });

    if (playableCards.length === 0) break;

    // Shuffle and find a card with valid in-range targets
    const shuffledCards = [...playableCards].sort(() => Math.random() - 0.5);
    let chosenCardId: string | null = null;
    let chosenTargetId: string | null = null;
    let movedForBetterAoe = false;

    for (const candidateCardId of shuffledCards) {
      const candidateCard = getResolvedCard(candidateCardId);
      if (!candidateCard) continue;

      // AOE cards: pick the center slot that maximises opponent damage
      // while avoiding friendly fire / self-harm.
      // If stepping forward first creates a materially better AOE, move then retry.
      if (candidateCard.targeting === 'aoe') {
        const currentPlan = evaluateBestAoePlan(candidateCard, enemy, enemy.slotIndex);
        if (currentPlan.targetId) {
          const aiMoveCost = getMoveCost(enemy);
          const canSpendMove = aiMoveCost.usesCharge || enemy.energy >= aiMoveCost.energyCost;
          if (
            consecutiveMoveAttempts < MAX_MOVE_ATTEMPTS &&
            canSpendMove &&
            canMoveForwardForPlanning(enemy)
          ) {
            const forwardSlot = enemy.isPlayer ? enemy.slotIndex + 1 : enemy.slotIndex - 1;
            const forwardPlan = evaluateBestAoePlan(candidateCard, enemy, forwardSlot);
            const gainsOpponentHit = forwardPlan.opponentHits > currentPlan.opponentHits;
            const gainsScore = forwardPlan.score > currentPlan.score + 0.75;
            if (forwardPlan.targetId && (gainsOpponentHit || gainsScore)) {
              const moved = moveCharacterForward(enemy.id, renderCallback);
              if (moved) {
                consecutiveMoveAttempts++;
                await delay(600);
                movedForBetterAoe = true;
                break; // Re-evaluate from the new slot in the outer loop
              }
            }
          }

          chosenCardId = candidateCardId;
          chosenTargetId = currentPlan.targetId;
          break;
        }
        continue; // no good AOE placement — try next card
      }

      // Non-AOE cards: existing random selection
      let validTargets = getAITargetCandidates(candidateCard, enemy);

      // Filter by range if applicable
      if ((candidateCard.maxRange || candidateCard.minRange) && !['self', 'allAllies', 'allEnemies'].includes(candidateCard.targeting)) {
        validTargets = validTargets.filter(t => {
          const dist = Math.abs(enemy.slotIndex - t.slotIndex);
          if (candidateCard.maxRange && dist > candidateCard.maxRange) return false;
          if (candidateCard.minRange && dist < candidateCard.minRange) return false;
          return true;
        });
      }

      if (validTargets.length > 0) {
        chosenCardId = candidateCardId;
        chosenTargetId = validTargets[Math.floor(Math.random() * validTargets.length)].id;
        break;
      }
    }

    if (movedForBetterAoe) {
      continue;
    }

    // No in-range target — try moving forward to close the gap
    if (!chosenCardId) {
      if (consecutiveMoveAttempts >= MAX_MOVE_ATTEMPTS) break;

      const aiMoveCost = getMoveCost(enemy);
      if (aiMoveCost.usesCharge || enemy.energy >= aiMoveCost.energyCost) {
        const moved = moveCharacterForward(enemy.id, renderCallback);
        if (moved) {
          consecutiveMoveAttempts++;
          await delay(600);
          continue; // retry card selection at new position
        }
      }
      // Can't move or still nothing in range — stop
      break;
    }

    // Reset move counter each time we successfully play a card
    consecutiveMoveAttempts = 0;

    const chosenCard = getResolvedCard(chosenCardId);
    if (chosenCard) {
      addToCombatLog(`${enemy.name} selects ${chosenCard.name}...`);
    }
    if (renderCallback) {
      renderCallback();
    }

    // Delay between successive card plays for readability
    if (cardsPlayed > 0) {
      await delay(1200);
    }

    try {
      await playCard(chosenCardId!, chosenTargetId!, renderCallback);
    } catch (err: any) {
      break;
    }
    if (renderCallback) {
      renderCallback();
    }

    cardsPlayed++;

    // Short pause after each card resolves
    await delay(800);
  }

  // ── Post-card positioning ───────────────────────────────────────────
  if (enemy.hp > 0 && (enemy.energy > 0 || enemy.moveCharges > 0)) {
    const moved = tryEnemyOptimalMove(enemy, renderCallback);
    if (moved) {
      await delay(600);
    }
  }

  // ── End turn ────────────────────────────────────────────────────────
  await delay(cardsPlayed > 0 ? 500 : 1500);
  gameState.isProcessingTurn = false;
  endTurn(renderCallback);
}

