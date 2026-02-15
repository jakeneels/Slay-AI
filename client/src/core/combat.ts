// Combat logic - card playing, turn management, enemy AI

import type { Application } from 'pixi.js';
import type { Character, CardEffect, Card, BaseCardEffect } from './types.js';
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
import { applyStatus, processDoTs, decayStatusDurations } from './status.js';
import { MAX_SLOTS, calculateRangeModifier } from './constants.js';

let app: Application | null = null;

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
 * Calculate AOE targets based on primary target and aoeSlots configuration
 * Returns array of characters that will be hit
 * @param primaryTargetId - ID of the primary target
 * @param targetSide - Which side to target ('enemy' or 'ally')
 * @param aoeSlots - Number of slots to hit (2, 3, or 4). Defaults to 3.
 *   2 = primary + one adjacent (prefer right)
 *   3 = primary + left + right
 *   4 = all characters on target side
 */
export function calculateAoeTargets(primaryTargetId: string, targetSide: 'enemy' | 'ally', aoeSlots: number = 3): Character[] {
  const characters = getCharactersByPosition(targetSide);
  
  if (characters.length === 0) {
    return [];
  }
  
  // 4 slots = all characters on that side
  if (aoeSlots === 4) {
    return characters;
  }
  
  // Find primary target position
  const primaryIndex = characters.findIndex(c => c.id === primaryTargetId);
  if (primaryIndex === -1) {
    // If primary target not found, just return all available (edge case)
    return characters;
  }
  
  const targets: Character[] = [characters[primaryIndex]];
  
  if (aoeSlots === 2) {
    // 2 slots: primary + one adjacent (prefer right, fallback to left)
    if (primaryIndex < characters.length - 1) {
      targets.push(characters[primaryIndex + 1]);
    } else if (primaryIndex > 0) {
      targets.push(characters[primaryIndex - 1]);
    }
  } else {
    // 3 slots (default): primary + left + right
    if (primaryIndex > 0) {
      targets.push(characters[primaryIndex - 1]);
    }
    if (primaryIndex < characters.length - 1) {
      targets.push(characters[primaryIndex + 1]);
    }
  }
  
  // Remove duplicates and return (shouldn't be any, but safe)
  return [...new Set(targets)];
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
      const targetSide: 'enemy' | 'ally' = caster.isPlayer ? 'enemy' : 'ally';
      return calculateAoeTargets(primaryTargetId, targetSide, slots);
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
      if (!targetId) { console.log('targetId required for AOE targeting'); return null; }
      const primaryTarget = gameState.characters.find(c => c.id === targetId);
      if (!primaryTarget) { console.log('primary target not found'); return null; }

      // Validate target is on the correct side relative to caster
      const cardTargetSide = card.targetSide || 'enemy';
      const targetIsAllied = primaryTarget.isPlayer === caster.isPlayer;
      if ((cardTargetSide === 'ally') !== targetIsAllied) {
        console.log(`AOE targeting: target on wrong side (expected ${cardTargetSide})`);
        return null;
      }

      // absoluteSide for calculateAoeTargets: 'ally' = isPlayer chars, 'enemy' = !isPlayer chars
      const absoluteSide: 'enemy' | 'ally' = primaryTarget.isPlayer ? 'ally' : 'enemy';
      return calculateAoeTargets(targetId, absoluteSide, card.aoeSlots ?? 3);
    }

    case 'ally': {
      if (!targetId) { console.log('targetId required for ally targeting'); return null; }
      const target = gameState.characters.find(c => c.id === targetId);
      if (!target) { console.log('target not found'); return null; }
      if (target.isPlayer !== caster.isPlayer) {
        console.log('ally targeting can only target allied characters');
        return null;
      }
      return [target];
    }

    case 'enemy': {
      if (!targetId) { console.log('targetId required for enemy targeting'); return null; }
      const target = gameState.characters.find(c => c.id === targetId);
      if (!target) { console.log('target not found'); return null; }
      if (target.isPlayer === caster.isPlayer) {
        console.log('enemy targeting can only target opposing characters');
        return null;
      }
      return [target];
    }

    default: {
      if (!targetId) { console.log('targetId required for single target cards'); return null; }
      const target = gameState.characters.find(c => c.id === targetId);
      if (!target) { console.log('target not found'); return null; }
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
    case 'enemy':
    case 'aoe':
    default:
      return gameState.characters.filter(c => c.isPlayer !== caster.isPlayer && c.hp > 0);
  }
}

/**
 * Get move energy cost for a character (from def, default 1)
 */
function getMoveEnergyCost(characterId: string): number {
  const gameState = getGameState();
  const def = gameState.characterLibrary[characterId];
  return def?.stats?.moveEnergyCost ?? 1;
}

/**
 * Move a character forward (toward center/opponent) one slot.
 * Unified slot model: allies on left (low indices), enemies on right (high indices).
 * - If target slot has a friendly: swap (they move back).
 * - If target has an enemy (ally advancing past boundary): shift all enemies forward (slotIndex += 1).
 * - Mirror logic for enemies moving forward (toward allies).
 */
export function moveCharacterForward(characterId: string, renderCallback?: () => void): boolean {
  const gameState = getGameState();
  const char = gameState.characters.find(c => c.id === characterId);
  if (!char || char.hp <= 0) return false;

  const cost = getMoveEnergyCost(characterId);
  if (char.energy < cost) return false;

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
      // No room on friendly side - shift enemies at/beyond target slot; fail if would exceed MAX_SLOTS
      const toShift = enemies.filter(e => e.slotIndex >= targetSlot).sort((a, b) => b.slotIndex - a.slotIndex);
      const maxAfterShift = toShift.length > 0 ? toShift[0].slotIndex + 1 : targetSlot;
      if (maxAfterShift >= MAX_SLOTS) return false;
      toShift.forEach(e => { e.slotIndex += 1; });
      char.slotIndex = targetSlot;
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
      // No room on enemy side - shift allies at/beyond target slot; fail if would exceed MAX_SLOTS
      const toShift = allies.filter(a => a.slotIndex >= targetSlot).sort((a, b) => b.slotIndex - a.slotIndex);
      const maxAfterShift = toShift.length > 0 ? toShift[0].slotIndex + 1 : targetSlot;
      if (maxAfterShift >= MAX_SLOTS) return false;
      toShift.forEach(a => { a.slotIndex += 1; });
      char.slotIndex = targetSlot;
    } else {
      if (targetSlot < 0) return false;
      char.slotIndex = targetSlot;
    }
  }

  char.energy -= cost;
  addToCombatLog(`${char.name} moves forward (${cost} energy)`);
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

  const cost = getMoveEnergyCost(characterId);
  if (char.energy < cost) return false;

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

  char.energy -= cost;
  addToCombatLog(`${char.name} moves back (${cost} energy)`);
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
  const direction = target.isPlayer ? -1 : 1; // back direction
  let slotsMoved = 0;

  for (let step = 0; step < amount; step++) {
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
  const currentPlayer = gameState.characters.find(c => c.id === gameState.currentPlayerId);
  const card = getResolvedCard(cardId);
  
  if (!currentPlayer || !card) {
    console.log('skipping player or card falsey', { currentPlayer: !!currentPlayer, card: !!card, cardName: card?.name });
    return;
  }
  
  if (currentPlayer.energy < card.cost.energy) {
    console.log('skipping player doesnt have enough energy')
    return;
  }
  if (!currentPlayer.hand.includes(cardId)) return;
  
  // Determine targets based on targeting mode (relative to caster)
  const targets = resolveCardTargets(card, currentPlayer, targetId);
  if (!targets || targets.length === 0) {
    console.log('no valid targets');
    return;
  }

  // Range validation: if card has maxRange, verify primary target is within range
  if (card.maxRange && targetId && card.targeting !== 'self') {
    const primaryTarget = gameState.characters.find(c => c.id === targetId);
    if (primaryTarget) {
      const distance = Math.abs(currentPlayer.slotIndex - primaryTarget.slotIndex);
      if (distance > card.maxRange) {
        console.log(`Target out of range: distance ${distance} > maxRange ${card.maxRange}`);
        addToCombatLog(`${card.name} failed - target out of range!`);
        return;
      }
    }
  }

  // Calculate range modifier for damage effects
  // Uses primary target distance; AOE uses the same modifier for all targets
  let rangeModifier = 1.0;
  if (card.optimalRange !== undefined && targetId && card.targeting !== 'self') {
    const primaryTarget = gameState.characters.find(c => c.id === targetId);
    if (primaryTarget) {
      const distance = Math.abs(currentPlayer.slotIndex - primaryTarget.slotIndex);
      rangeModifier = calculateRangeModifier(distance, card.optimalRange);
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
  currentPlayer.energy -= card.cost.energy;

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
    const effectTargets = resolveEffectTargets(effect, currentPlayer, targets, targetId, card);
    
    // For AOE effects, animate on all targets in parallel
    const animationPromises: Promise<void>[] = [];
    
    for (const target of effectTargets) {
      let sparkType: 'damage' | 'heal' | 'buff' | 'energy' = 'damage';
      let animationPromise: Promise<void> | null = null;
      
      switch (effect.kind) {
        case 'damage':
          const adjustedDamage = Math.round(effect.amount * rangeModifier);
          gameState.stats.cumulativeDamage += adjustedDamage;
          const actualDamage = applyDamageWithBlock(target, adjustedDamage);
          if (actualDamage > 0) {
            addToCombatLog(`${target.name} takes ${actualDamage} damage`);
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
          const aoeDamage = Math.round(effect.amount * rangeModifier);
          gameState.stats.cumulativeDamage += aoeDamage;
          const actualAoEDamage = applyDamageWithBlock(target, aoeDamage);
          if (actualAoEDamage > 0) {
            addToCombatLog(`${target.name} takes ${actualAoEDamage} AOE damage`);
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
          const adjustedHeal = effect.amount;
          healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + effect.amount);
          if (!gameState.stats.cumulativeHeal) {
            gameState.stats.cumulativeHeal = 0;
          }
          gameState.stats.cumulativeHeal += adjustedHeal;
          addToCombatLog(`${healTarget.name} heals ${effect.amount} HP`);
          sparkType = 'heal';
          // Render immediately to show updated HP
          if (renderCallback) {
            renderCallback();
          }
          // Play heal animation with particles
          animationPromise = Promise.all([
            playHealAnimation(
              healTarget.id,
              effect.amount,
              app,
              card.targeting,
              card.animationConfig as AnimationConfig | undefined
            ),
            animateParticles(healTarget.id, 'healing', 15, app)
          ]).then(() => undefined);
          break;
          
        case 'energy':
          currentPlayer.energy = Math.min(currentPlayer.maxEnergy, currentPlayer.energy + effect.amount);
          addToCombatLog(`${currentPlayer.name} gains ${effect.amount} energy`);
          sparkType = 'energy';
          // Render immediately to show updated energy
          if (renderCallback) {
            renderCallback();
          }
          // Use legacy spark animation for energy
          animationPromise = animateCharachterSpark(currentPlayer.id, sparkType, app);
          break;
          
        case 'speed':
          addToCombatLog(`${currentPlayer.name} gains ${effect.amount} speed`);
          sparkType = 'energy';
          // Render immediately (for visual consistency)
          if (renderCallback) {
            renderCallback();
          }
          // Use legacy spark animation for speed
          animationPromise = animateCharachterSpark(currentPlayer.id, sparkType, app);
          break;
          
        case 'grant_block_layer':
          // Use the target from targeting logic (already determined correctly)
          const blockTarget = target;
          grantBlockLayer(
            blockTarget,
            effect.amount,
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

        case 'knockback':
          const knockbackTarget = target;
          const slotsMoved = applyKnockback(knockbackTarget, effect.amount);
          if (slotsMoved > 0) {
            addToCombatLog(`${knockbackTarget.name} is knocked back ${slotsMoved} slot${slotsMoved > 1 ? 's' : ''}!`);
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
            addToCombatLog(`${knockbackTarget.name} can't be knocked back (no space)!`);
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
  if (livingEnemies.length === 0) {
    logAllEnemiesDead();
  }
  if (livingAllies.length === 0) {
    logAllAlliesDead();
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
  gameState.turnIndex++;
  
  // Filter to only living characters
  const livingCharacters = gameState.characters.filter(c => c.hp > 0);
  
  if (livingCharacters.length === 0) {
    console.log('No living characters left!');
    return;
  }
  
  // Find next living player
  const currentIndex = livingCharacters.findIndex(c => c.id === gameState.currentPlayerId);
  let nextIndex = (currentIndex + 1) % livingCharacters.length;
  
  // If current player is dead, start from beginning of living characters
  if (currentIndex === -1) {
    nextIndex = 0;
  }
  
  gameState.currentPlayerId = livingCharacters[nextIndex].id;

  // Restore energy
  const nextPlayer = livingCharacters[nextIndex];
  nextPlayer.energy = nextPlayer.maxEnergy;

  logTurnAdvance(nextPlayer.name, nextPlayer.id, nextPlayer.isPlayer, gameState.turnIndex);
  
  // End of turn processing for all characters
  for (const character of gameState.characters) {
    // Decay block layers
    decayBlockLayers(character);
    
    // Process DoT effects (bleed, shock, radiation)
    processDoTs(character);
    
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
  
  // Draw cards for new turn
  drawCards(nextPlayer, nextPlayer.drawCount);

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
 * Process enemy turn with AI
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
  
  // Find playable cards (resolve templates so targeting mode is correct)
  const playableCards = enemy.hand.filter(cardId => {
    const card = getResolvedCard(cardId);
    return card && enemy.energy >= card.cost.energy;
  });
  
  if (playableCards.length === 0) {
    addToCombatLog(`${enemy.name} has no playable cards`);
    gameState.isProcessingTurn = false;
    setTimeout(() => endTurn(renderCallback), 1500);
    return;
  }
  
  // Simple AI: pick a random playable card and random valid target (respecting range)
  const shuffledCards = [...playableCards].sort(() => Math.random() - 0.5);
  let chosenCardId: string | null = null;
  let chosenTarget: Character | null = null;
  
  for (const candidateCardId of shuffledCards) {
    const candidateCard = getResolvedCard(candidateCardId);
    if (!candidateCard) continue;
    
    // Use shared helper to determine target candidates (relative to caster)
    let validTargets = getAITargetCandidates(candidateCard, enemy);
    
    // Filter by range if applicable
    if (candidateCard.maxRange && !['self', 'allAllies', 'allEnemies'].includes(candidateCard.targeting)) {
      validTargets = validTargets.filter(t => 
        Math.abs(enemy.slotIndex - t.slotIndex) <= candidateCard.maxRange!
      );
    }
    
    if (validTargets.length > 0) {
      chosenCardId = candidateCardId;
      chosenTarget = validTargets[Math.floor(Math.random() * validTargets.length)];
      break;
    }
  }
  
  if (!chosenCardId || !chosenTarget) {
    addToCombatLog(`${enemy.name} has no valid targets`);
    gameState.isProcessingTurn = false;
    setTimeout(() => endTurn(renderCallback), 1500);
    return;
  }
  
  const chosenCard = getResolvedCard(chosenCardId);
  if (chosenCard) {
    addToCombatLog(`${enemy.name} selects ${chosenCard.name}...`);
  }
  if (renderCallback) {
    renderCallback();
  }
  
  // Wait a bit then play the card
  setTimeout(async () => {
    await playCard(chosenCardId, chosenTarget.id, renderCallback);
    if (renderCallback) {
      renderCallback();
    }
    
    // Wait a bit then end turn
    setTimeout(() => {
      gameState.isProcessingTurn = false;
      endTurn(renderCallback);
    }, 2000);
  }, 1500);
}

