// Combat logic - card playing, turn management, enemy AI

import type { Application } from 'pixi.js';
import type { Character, CardEffect } from './types.js';
import { getGameState } from './gameState.js';
import { getCard } from './card.js';
import { drawCards } from './deck.js';
import { addToCombatLog } from './gameState.js';
import { 
  animateCharachterSpark, 
  playDamageAnimation, 
  playHealAnimation, 
  animateDamageFlash,
  animateEnhancedScreenShake,
  animateCameraZoom,
  animateParticles,
  type AnimationConfig 
} from '../../animations.js';
import { applyDamageWithBlock, grantBlockLayer, decayBlockLayers } from './block.js';
import { applyStatus, processDoTs, decayStatusDurations } from './status.js';

let app: Application | null = null;

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
  const card = getCard(cardId);
  
  if (!currentPlayer || !card) {
    console.log('skipping player or card falsey')
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
  
  // Consume energy BEFORE processing effects (so failed effects still cost energy)
  currentPlayer.energy -= card.cost.energy;
  
  const exhaustText = card.exhaust ? ' (Exhaust)' : '';
  addToCombatLog(`${currentPlayer.name} plays ${card.name}${exhaustText}`);
  
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
    
    // Apply effects to all targets
    // For AOE effects, animate on all targets in parallel
    const animationPromises: Promise<void>[] = [];
    
    for (const target of targets) {
      let sparkType: 'damage' | 'heal' | 'buff' | 'energy' = 'damage';
      let animationPromise: Promise<void> | null = null;
      
      switch (effect.kind) {
        case 'damage':
          const adjustedDamage = effect.amount; // add other modifiers
          gameState.stats.cumulativeDamage += adjustedDamage;
          const actualDamage = applyDamageWithBlock(target, adjustedDamage);
          if (actualDamage > 0) {
            addToCombatLog(`${target.name} takes ${actualDamage} damage`);
            // Render immediately to show updated HP
            if (renderCallback) {
              renderCallback();
            }
            // Play enhanced damage animation sequence
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
              animateEnhancedScreenShake(app, actualDamage),
              // Camera zoom for big hits
              actualDamage >= 15 ? animateCameraZoom(app, 1.08, 200, 100) : Promise.resolve()
            ]).then(() => undefined);
          }
          if (target.hp <= 0) {
            addToCombatLog(`${target.name} is defeated!`);
            // Camera focus on defeated enemy
            animateCameraZoom(app, 1.15, 300, 400).catch(() => {});
          }
          break;
          
        case 'aoe_damage':
          // AOE damage is similar to regular damage but might have different modifiers
          const aoeDamage = effect.amount;
          gameState.stats.cumulativeDamage += aoeDamage;
          const actualAoEDamage = applyDamageWithBlock(target, aoeDamage);
          if (actualAoEDamage > 0) {
            addToCombatLog(`${target.name} takes ${actualAoEDamage} AOE damage`);
            // Render immediately to show updated HP
            if (renderCallback) {
              renderCallback();
            }
            // Play enhanced AOE damage animation
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
            addToCombatLog(`${target.name} is defeated!`);
            animateCameraZoom(app, 1.15, 300, 400).catch(() => {});
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
    
    // Wait for all animations to complete (parallel for AOE, sequential for single target)
    if (animationPromises.length > 0) {
      if (card.targeting === 'allEnemies' || card.targeting === 'allAllies' || card.targeting === 'aoe') {
        // For AOE, run animations in parallel
        await Promise.all(animationPromises);
      } else {
        // For single target, run sequentially for better visual clarity
        for (const promise of animationPromises) {
          await promise;
        }
      }
    }
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
  
  console.log(`Turn passed to: ${nextPlayer.name}`);
  
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
  
  // Simple AI: pick a random playable card and random player target
  const chosenCardId = playableCards[Math.floor(Math.random() * playableCards.length)];
  const chosenTarget = playerTargets[Math.floor(Math.random() * playerTargets.length)];
  
  const chosenCard = getCard(chosenCardId);
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

