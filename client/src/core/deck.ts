// Deck management functions

import type { Character, CharacterDefinition } from './types.js';
import { getGameState, addToCombatLog } from './gameState.js';
import { shuffleArray } from '../utils/shuffle.js';
import { createCardInstance } from './card.js';

/**
 * Build deck for a character from their startingDeck using copies field
 */
export function buildDeckForCharacter(charDef: CharacterDefinition): string[] {
  const gameState = getGameState();
  const deck: string[] = [];
  const startingDeck = charDef.startingDeck || [];
  
  for (const cardTemplateId of startingDeck) {
    const cardTemplate = gameState.cardLibrary[cardTemplateId];
    if (!cardTemplate) {
      console.warn(`Card template not found for deck building: ${cardTemplateId}`);
      continue;
    }
    
    // Add copies number of this card to the deck
    const copies = cardTemplate.copies || 1;
    for (let i = 0; i < copies; i++) {
      deck.push(cardTemplateId);
    }
  }
  
  // Shuffle the deck before returning
  return shuffleArray(deck);
}

/**
 * Reshuffle discard pile back into deck
 */
export function reshuffleDeck(character: Character): void {
  if (character.discardPile.length === 0 && character.deck.length === 0) {
    // No cards to reshuffle
    return;
  }
  
  // Move all cards from discard pile back to deck
  character.deck.push(...character.discardPile);
  character.discardPile = [];
  
  // Shuffle the deck
  character.deck = shuffleArray(character.deck);
  
  addToCombatLog(`${character.name} reshuffles deck`);
}

/**
 * Draw cards from deck to hand
 */
export function drawCards(character: Character, count: number): void {
  const initialHandSize = character.hand.length;
  
  for (let i = 0; i < count; i++) {
    // Check if hand is full
    if (character.hand.length >= character.maxHandSize) {
      break;
    }
    
    // Reshuffle if deck is empty
    if (character.deck.length === 0) {
      reshuffleDeck(character);
      // If still empty after reshuffle, can't draw
      if (character.deck.length === 0) {
        break;
      }
    }
    
    // Draw a card from deck
    const cardTemplateId = character.deck.pop();
    if (!cardTemplateId) {
      break;
    }
    
    // Create a card instance and add to hand
    const instanceId = createCardInstance(cardTemplateId);
    if (instanceId) {
      character.hand.push(instanceId);
    }
  }
  
  const cardsDrawn = character.hand.length - initialHandSize;
  if (cardsDrawn > 0) {
    addToCombatLog(`${character.name} draws ${cardsDrawn} card${cardsDrawn !== 1 ? 's' : ''}`);
  }
}

