// Combat logic - card playing, turn management, enemy AI

import type { Application } from 'pixi.js';
import type { Character, CardEffect, Card, BaseCardEffect, SpeedEffect } from './types.js';
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
  type AnimationConfig 
} from '../../animations.js';
import { applyDamageWithBlock, grantBlockLayer, decayBlockLayers } from './block.js';
import { applyStatus, modifyStatusStacks, processStatusEffects, decayStatusDurations, getStatusStacks } from './status.js';
import { MAX_SLOTS, calculateRangeModifier, getSuppressionDistance, getSuppressionRangedThreshold, getSuppressionStackCost } from './constants.js';
import { getModifierRegistry } from './modifiers.js';

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

/**
 * Calculate AOE targets based on a center slot and aoeSlots configuration.
 * Returns array of characters that will be hit.
 * @param centerSlot - The slot index to center the AOE on (can be empty)
 * @param targetSide - Which side to target ('enemy', 'ally', or 'all' for friendly-fire AOE)
 * @param aoeSlots - Number of slots to hit (2, 3, or 4). Defaults to 3.
 *   2 = center + one adjacent (prefer right)
 *   3 = center ± 1
 *   4 = all characters on target side
 */
export function calculateAoeTargets(centerSlot: number, targetSide: 'enemy' | 'ally' | 'all', aoeSlots: number = 3): Character[] {
  const characters = targetSide === 'all'
    ? getGameState().characters.filter(c => c.hp > 0).sort((a, b) => a.slotIndex - b.slotIndex)
    : getCharactersByPosition(targetSide);

  if (characters.length === 0) {
    return [];
  }

  // 4 slots = all characters on that side
  if (aoeSlots === 4) {
    return characters;
  }

  if (aoeSlots === 2) {
    // 2 slots: center + 1 right; fallback to center + 1 left
    const inRange = characters.filter(c =>
      c.slotIndex === centerSlot || c.slotIndex === centerSlot + 1
    );
    if (inRange.length > 0) return inRange;
    return characters.filter(c =>
      c.slotIndex === centerSlot || c.slotIndex === centerSlot - 1
    );
  }

  // 3 slots (default): centerSlot ± 1 — only hits characters actually in adjacent slots
  return characters.filter(c =>
    Math.abs(c.slotIndex - centerSlot) <= 1
  );
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

/**
 * For an AOE card, find the best center slot that maximises damage to opponents
 * while minimising friendly-fire.  Evaluates every in-range slot and returns the
 * targetId string to pass to playCard, or null if no slot is worth casting on.
 *
 * Scoring per character caught in the blast:
 *   +2  opponent
 *  -1.5 allied character (not self)
 *  -10  self if the hit would be lethal, -3 otherwise
 *
 * The card is only worth casting when the best score is > 0.
 */
function pickBestAoeTarget(card: Card, caster: Character): string | null {
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

  const allLiving = gameState.characters.filter(c => c.hp > 0);

  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    // Range check from caster
    const dist = Math.abs(caster.slotIndex - slot);
    if (card.maxRange && dist > card.maxRange) continue;
    if (card.minRange && dist < card.minRange) continue;

    // Who would the blast hit?
    let targets = calculateAoeTargets(slot, 'all', aoeSlots);
    if (card.maxRange) {
      targets = targets.filter(t => Math.abs(caster.slotIndex - t.slotIndex) <= card.maxRange!);
    }
    if (targets.length === 0) continue;

    let score = 0;
    let hitsOpponent = false;

    for (const t of targets) {
      if (t.isPlayer !== caster.isPlayer) {
        // Hitting an opponent — good
        score += 2;
        hitsOpponent = true;
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
      // Use the character on that slot (if any) as the target, else a raw slot ref
      const charOnSlot = allLiving.find(c => c.slotIndex === slot);
      bestTargetId = charOnSlot ? charOnSlot.id : `slot:${slot}`;
    }
  }

  return bestScore > 0 ? bestTargetId : null;
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

  const allies = gameState.characters.filter(c => c.isPlayer && c.hp > 0);
  const enemies = gameState.characters.filter(c => !c.isPlayer && c.hp > 0);
  // Forward = toward opponent: ally goes +1, enemy goes -1
  const targetSlot = char.isPlayer ? char.slotIndex + 1 : char.slotIndex - 1;

  if (char.isPlayer) {
    const allyAtTarget = allies.find(c => c.slotIndex === targetSlot);
    const enemyAtTarget = enemies.find(c => c.slotIndex === targetSlot);
    if (allyAtTarget) {
      allyAtTarget.slotIndex = char.slotIndex;
      char.slotIndex = targetSlot;
    } else if (enemyAtTarget) {
      return false;
    } else {
      if (targetSlot >= MAX_SLOTS) return false;
      char.slotIndex = targetSlot;
    }
  } else {
    const enemyAtTarget = enemies.find(c => c.slotIndex === targetSlot);
    const allyAtTarget = allies.find(c => c.slotIndex === targetSlot);
    if (enemyAtTarget) {
      enemyAtTarget.slotIndex = char.slotIndex;
      char.slotIndex = targetSlot;
    } else if (allyAtTarget) {
      return false;
    } else {
      if (targetSlot < 0) return false;
      char.slotIndex = targetSlot;
    }
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
  if (targetSlot < 0 || targetSlot >= MAX_SLOTS) return false;

  const { energyCost, usesCharge } = getMoveCost(char);
  if (!usesCharge && char.energy < energyCost) return false;

  const allies = gameState.characters.filter(c => c.isPlayer && c.hp > 0);
  const enemies = gameState.characters.filter(c => !c.isPlayer && c.hp > 0);

  if (char.isPlayer) {
    const allyAtTarget = allies.find(c => c.slotIndex === targetSlot);
    if (allyAtTarget) {
      allyAtTarget.slotIndex = char.slotIndex;
      char.slotIndex = targetSlot;
    } else {
      char.slotIndex = targetSlot;
    }
  } else {
    const enemyAtTarget = enemies.find(c => c.slotIndex === targetSlot);
    if (enemyAtTarget) {
      enemyAtTarget.slotIndex = char.slotIndex;
      char.slotIndex = targetSlot;
    } else {
      char.slotIndex = targetSlot;
    }
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
export function applyKnockback(target: Character, amount: number): number {
  const gameState = getGameState();
  const allLiving = gameState.characters.filter(c => c.hp > 0 && c.id !== target.id);

  // Positive amount = push back (away from caster), negative = pull forward (toward caster)
  const backDirection = target.isPlayer ? -1 : 1;
  const direction = amount >= 0 ? backDirection : -backDirection;
  const steps = Math.abs(amount);
  let slotsMoved = 0;

  for (let step = 0; step < steps; step++) {
    const nextSlot = target.slotIndex + direction;

    // Boundary check
    if (nextSlot < 0 || nextSlot >= MAX_SLOTS) break;

    // Check if the slot is free (no living character occupies it)
    const occupied = allLiving.some(c => c.slotIndex === nextSlot);
    if (occupied) break;

    target.slotIndex = nextSlot;
    slotsMoved++;
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
  
  // Render immediately after state changes to show updated energy/card state
  if (renderCallback) {
    renderCallback();
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
            animationPromise = Promise.all([
              playDamageAnimation(
                currentPlayer.id,
                target.id,
                actualDamage,
                app,
                card.targeting,
                card.animationConfig as AnimationConfig | undefined,
                card.type
              ),
              animateDamageFlash(app, actualDamage),
              animateEnhancedScreenShake(app, actualDamage)
            ]).then(() => undefined);
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
            animationPromise = Promise.all([
              playDamageAnimation(
                currentPlayer.id,
                target.id,
                actualAoEDamage,
                app,
                'aoe',
                card.animationConfig as AnimationConfig | undefined,
                card.type
              ),
              animateParticles(target.id, 'fire', 20, app) // AOE uses fire particles
            ]).then(() => undefined);
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
            undefined, // duration from status definition if needed
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
          const spreadStatusId = effect.status;
          const sourceStacks = getStatusStacks(target, spreadStatusId);
          if (sourceStacks > 0) {
            const fraction = effect.fraction ?? 0.5;
            const roundFn = effect.round === 'ceil' ? Math.ceil : Math.floor;
            const spreadStacks = roundFn(sourceStacks * fraction);
            if (spreadStacks > 0) {
              // Find adjacent enemies (within 1 slot of primary target, same side, excluding the target itself)
              const adjacentTargets = getGameState().characters.filter(c =>
                c.hp > 0 &&
                c.id !== target.id &&
                c.isPlayer === target.isPlayer &&
                Math.abs(c.slotIndex - target.slotIndex) <= 1
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
          const slotsMoved = applyKnockback(knockbackTarget, effect.amount);
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

  // Energy was already consumed above, before effects were processed
  // Remove card instance from hand
  currentPlayer.hand = currentPlayer.hand.filter(id => id !== cardId);
  
  // Handle exhaust vs discard
  if (card.exhaust) {
    // Exhausted cards are permanently removed (not added to discard pile)
    addToCombatLog(`${card.name} is exhausted`);
  } else {
    // Move card template to discard pile (for reshuffle)
    const cardTemplateId = 'templateId' in card ? card.templateId : card.id;
    currentPlayer.discardPile.push(cardTemplateId);
  }
  
  // Clear selection
  gameState.selectedCardId = null;
  
  // Final render after card is removed from hand (this is redundant but ensures consistency)
  if (renderCallback) {
    renderCallback();
  }
}

/**
 * End turn and advance to next character
 */
export function endTurn(renderCallback?: () => void): void {
  const gameState = getGameState();
  // Block turn advancement after combat is over
  if (gameState.combatResult !== 'ongoing') return;

  gameState.turnIndex++;
  
  // Filter to only living characters
  const livingCharacters = gameState.characters.filter(c => c.hp > 0);
  
  if (livingCharacters.length === 0) return;
  
  // Find next living player
  const currentIndex = livingCharacters.findIndex(c => c.id === gameState.currentPlayerId);
  let nextIndex = (currentIndex + 1) % livingCharacters.length;
  
  // If current player is dead, start from beginning of living characters
  if (currentIndex === -1) {
    nextIndex = 0;
  }
  
  // Detect side change (ally->enemy or enemy->ally) before updating currentPlayerId.
  // Block decay is per-side, not per-character — only decay when the active side changes.
  // Also treat a full wrap-around (last char -> first char) as a side boundary.
  const previousPlayer = currentIndex !== -1 ? livingCharacters[currentIndex] : null;
  const nextPlayer = livingCharacters[nextIndex];
  const wrapped = currentIndex !== -1 && nextIndex <= currentIndex;
  const sideChanged = !previousPlayer || previousPlayer.isPlayer !== nextPlayer.isPlayer || wrapped;

  gameState.currentPlayerId = livingCharacters[nextIndex].id;

  // Restore energy (resolved through modifier pipeline for per-character overrides)
  const resolvedMaxEnergy = getModifierRegistry().resolve('maxEnergy', nextPlayer.maxEnergy, { character: nextPlayer });
  nextPlayer.energy = resolvedMaxEnergy;

  // Reset move charges for the new turn (speed-based charges are generated on first energy spend)
  nextPlayer.moveCharges = 0;

  logTurnAdvance(nextPlayer.name, nextPlayer.id, nextPlayer.isPlayer, gameState.turnIndex);
  
  // End of turn processing for all characters
  for (const character of gameState.characters) {
    // Block decays at the START of your side's round, not during the enemy phase.
    // Only decay block for characters on the side that is about to act.
    if (sideChanged && character.isPlayer === nextPlayer.isPlayer) {
      decayBlockLayers(character);
    }
    
    // Process turn_end statuses (e.g. bleed, shock) — tick every character turn
    processStatusEffects(character, 'turn_end');

    // Process side_end statuses (e.g. radiation) — tick when a side finishes
    if (sideChanged && character.isPlayer !== nextPlayer.isPlayer) {
      // The finishing side is the PREVIOUS side (opposite of nextPlayer)
      processStatusEffects(character, 'side_end');
    }

    // Process round_end statuses — tick once per full round (both sides acted)
    if (wrapped) {
      processStatusEffects(character, 'round_end');
    }
    
    // Decay status durations
    decayStatusDurations(character);
  }
  
  // Handle card expiration before drawing new cards
  // Check all characters for expired cards
  for (const character of gameState.characters) {
    const expiredCards: string[] = [];
    
    for (const cardInstanceId of character.hand) {
      const cardInstance = gameState.cardInstances[cardInstanceId];
      if (cardInstance && cardInstance.turnsUntilExpiry !== undefined) {
        // Decrement expiration counter
        cardInstance.turnsUntilExpiry--;
        
        // If expired (reached 0), mark for removal
        if (cardInstance.turnsUntilExpiry <= 0) {
          expiredCards.push(cardInstanceId);
          addToCombatLog(`${character.name}'s ${cardInstance.name} expires!`);
        }
      }
    }
    
    // Remove expired cards from hand (don't add to discard)
    if (expiredCards.length > 0) {
      character.hand = character.hand.filter(id => !expiredCards.includes(id));
      // Clean up expired card instances
      expiredCards.forEach(id => {
        delete gameState.cardInstances[id];
      });
    }
  }
  
  // Draw cards for new turn (resolved through modifier pipeline)
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
      processEnemyTurn(nextPlayer, renderCallback);
    }, 1000); // 1 second delay to show enemy hand
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

    for (const candidateCardId of shuffledCards) {
      const candidateCard = getResolvedCard(candidateCardId);
      if (!candidateCard) continue;

      // AOE cards: pick the center slot that maximises opponent damage
      // while avoiding friendly fire / self-harm
      if (candidateCard.targeting === 'aoe') {
        const bestTargetId = pickBestAoeTarget(candidateCard, enemy);
        if (bestTargetId) {
          chosenCardId = candidateCardId;
          chosenTargetId = bestTargetId;
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

