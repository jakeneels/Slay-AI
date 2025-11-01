// Combat logic - card playing, turn management, enemy AI

import type { Application } from 'pixi.js';
import type { Character } from './types.js';
import { getGameState } from './gameState.js';
import { getCard } from './card.js';
import { drawCards } from './deck.js';
import { addToCombatLog } from './gameState.js';
import { playAttackAnimation, animateCharachterSpark } from '../../animations.js';

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
  } else {
    // Single target mode - need targetId
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
  
  const exhaustText = card.exhaust ? ' (Exhaust)' : '';
  addToCombatLog(`${currentPlayer.name} plays ${card.name}${exhaustText}`);
  
  // Play attack animation (use first target for single target, or current player for AOE)
  const animationTarget = targets.length === 1 ? targets[0].id : currentPlayer.id;
  await playAttackAnimation(currentPlayer.id, animationTarget, app);
  
  // Apply effects to all targets
  for (const target of targets) {
    let sparkType: 'damage' | 'heal' | 'buff' | 'energy' = 'damage';
    
    // Apply card effects
    card.effects.forEach(effect => {
      switch (effect.kind) {
        case 'damage':
          const adjustedDamage = effect.amount; // add other modifiers
          gameState.stats.cumulativeDamage += adjustedDamage;
          target.hp = Math.max(0, target.hp - adjustedDamage);
          addToCombatLog(`${target.name} takes ${adjustedDamage} damage`);
          if (target.hp <= 0) {
            addToCombatLog(`${target.name} is defeated!`);
          }
          break;
        case 'heal':
          const healTarget = card.targetSide === 'self' ? currentPlayer : target;
          const adjustedHeal = effect.amount;
          healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + effect.amount);
          if (!gameState.stats.cumulativeHeal) {
            gameState.stats.cumulativeHeal = 0;
          }
          gameState.stats.cumulativeHeal += adjustedHeal;
          addToCombatLog(`${healTarget.name} heals ${effect.amount} HP`);
          sparkType = 'heal';
          break;
        case 'energy':
          currentPlayer.energy = Math.min(currentPlayer.maxEnergy, currentPlayer.energy + effect.amount);
          addToCombatLog(`${currentPlayer.name} gains ${effect.amount} energy`);
          sparkType = 'energy';
          break;
        case 'speed':
          addToCombatLog(`${currentPlayer.name} gains ${effect.amount} speed`);
          sparkType = 'energy';
          break;
      }
    });
    
    // Animate spark on target
    await animateCharachterSpark(target.id, sparkType, app);
  }
  
  // Consume energy
  currentPlayer.energy -= card.cost.energy;
  
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

