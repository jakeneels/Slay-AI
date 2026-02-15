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
  let card = getCard(cardId);
  
  // If card is an instance, always use the template's targeting/targetSide/aoeSlots
  // (instances copy properties at creation time, but we modify templates after loading)
  if (card && 'templateId' in card && card.templateId) {
    const template = gameState.cardLibrary[card.templateId];
    if (template) {
      // Merge: use instance-specific properties but override with template's targeting
      card = { 
        ...card, 
        targeting: template.targeting, 
        targetSide: template.targetSide,
        aoeSlots: template.aoeSlots
      };
    }
  }
  
  if (!currentPlayer || !card) {
    console.log('skipping player or card falsey', { currentPlayer: !!currentPlayer, card: !!card, cardName: card?.name });
    return;
  }
  
  if (currentPlayer.energy < card.cost.energy) {
    console.log('skipping player doesnt have enough energy')
    return;
  }
  if (!currentPlayer.hand.includes(cardId)) return;
  
  // Determine targets based on targeting mode
  let targets: Character[] = [];
  
  if (card.targeting === 'allEnemies') {
    targets = gameState.characters.filter(c => !c.isPlayer && c.hp > 0);
  } else if (card.targeting === 'allAllies') {
    targets = gameState.characters.filter(c => c.isPlayer && c.hp > 0);
  } else if (card.targeting === 'aoe') {
    // AOE targeting - requires primary target, calculates adjacent targets (hardcoded 3 slots for MVP)
    if (!targetId) {
      console.log('targetId required for AOE targeting');
      return;
    }
    const primaryTarget = gameState.characters.find(c => c.id === targetId);
    if (!primaryTarget) {
      console.log('primary target not found');
      return;
    }
    
    // Determine target side based on card and caster perspective
    // If card says 'enemy', that means target the caster's enemies
    // If card says 'ally', that means target the caster's allies
    let targetSide: 'enemy' | 'ally';
    if (card.targetSide === 'ally') {
      targetSide = 'ally';
    } else {
      // targetSide is 'enemy' - means "target my enemies"
      // For player casters: enemies = !isPlayer
      // For enemy casters: enemies = isPlayer (players are enemies to enemies)
      targetSide = currentPlayer.isPlayer ? 'enemy' : 'ally';
    }
    
    // Validate that primary target matches expected side
    // targetSide interpretation:
    // - 'ally' = getCharactersByPosition('ally') which returns isPlayer=true characters
    // - 'enemy' = getCharactersByPosition('enemy') which returns isPlayer=false characters
    // So regardless of caster, if targetSide='ally', target must be isPlayer=true
    // And if targetSide='enemy', target must be isPlayer=false
    const expectedIsPlayer = targetSide === 'ally';
    if (primaryTarget.isPlayer !== expectedIsPlayer) {
      console.log(`AOE targeting mismatch: caster is ${currentPlayer.isPlayer ? 'player' : 'enemy'}, targetSide is ${targetSide}, expected target isPlayer=${expectedIsPlayer}, but got isPlayer=${primaryTarget.isPlayer}, target name: ${primaryTarget.name}`);
      return;
    }
    
    // Calculate AOE targets based on card's aoeSlots (defaults to 3)
    const aoeSlots = card.aoeSlots ?? 3;
    targets = calculateAoeTargets(targetId, targetSide, aoeSlots);
  } else if (card.targeting === 'self') {
    targets = [currentPlayer];
  } else if (card.targeting === 'ally') {
    // Ally targeting - can target any player character (including self if targetId is self)
    if (!targetId) {
      console.log('targetId required for ally targeting');
      return;
    }
    const target = gameState.characters.find(c => c.id === targetId);
    if (!target) {
      console.log('target not found');
      return;
    }
    // Validate that target is a player character
    if (!target.isPlayer) {
      console.log('ally targeting can only target player characters');
      return;
    }
    targets = [target];
  } else if (card.targeting === 'enemy') {
    // Enemy targeting - can target any enemy character
    if (!targetId) {
      console.log('targetId required for enemy targeting');
      return;
    }
    const target = gameState.characters.find(c => c.id === targetId);
    if (!target) {
      console.log('target not found');
      return;
    }
    // Validate that target is an enemy
    if (target.isPlayer) {
      console.log('enemy targeting can only target enemy characters');
      return;
    }
    targets = [target];
  } else {
    // Default single target mode (backwards compatibility)
    if (!targetId) {
      console.log('targetId required for single target cards');
      return;
    }
    const target = gameState.characters.find(c => c.id === targetId);
    if (!target) {
      console.log('target not found');
      return;
    }
    targets = [target];
  }
  
  if (targets.length === 0) {
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
        ? gameState.characters.filter(c => c.isPlayer && c.hp > 0)
        : gameState.characters.filter(c => !c.isPlayer && c.hp > 0);
      
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
  
  // Find valid targets (living player characters)
  const playerTargets = gameState.characters.filter(c => c.isPlayer && c.hp > 0);

  if (playerTargets.length === 0) {
    logAllAlliesDead();
    addToCombatLog(`${enemy.name} has no targets!`);
    gameState.isProcessingTurn = false;
    endTurn(renderCallback);
    return;
  }
  
  // Find playable cards
  const playableCards = enemy.hand.filter(cardId => {
    const card = getCard(cardId);
    return card && enemy.energy >= card.cost.energy;
  });
  
  if (playableCards.length === 0) {
    addToCombatLog(`${enemy.name} has no playable cards`);
    gameState.isProcessingTurn = false;
    setTimeout(() => endTurn(renderCallback), 1500);
    return;
  }
  
  // Simple AI: pick a random playable card and random valid target (respecting range)
  // Shuffle playable cards to try different ones if range blocks the first pick
  const shuffledCards = [...playableCards].sort(() => Math.random() - 0.5);
  let chosenCardId: string | null = null;
  let chosenTarget: Character | null = null;
  
  for (const candidateCardId of shuffledCards) {
    const candidateCard = getCard(candidateCardId);
    if (!candidateCard) continue;
    
    // Filter targets by range
    let validTargets = playerTargets;
    if (candidateCard.maxRange && candidateCard.targeting !== 'self') {
      validTargets = playerTargets.filter(t => 
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
    addToCombatLog(`${enemy.name} has no targets in range`);
    gameState.isProcessingTurn = false;
    setTimeout(() => endTurn(renderCallback), 1500);
    return;
  }
  
  let chosenCard = getCard(chosenCardId);
  
  // If card is an instance, use template values for targeting (same fix as in playCard)
  if (chosenCard && 'templateId' in chosenCard && chosenCard.templateId) {
    const template = gameState.cardLibrary[chosenCard.templateId];
    if (template) {
      chosenCard = { 
        ...chosenCard, 
        targeting: template.targeting, 
        targetSide: template.targetSide,
        aoeSlots: template.aoeSlots
      };
    }
  }
  
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

