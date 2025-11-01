// Card management functions

import type { Card, CardInstance } from './types.js';
import { getGameState } from './gameState.js';

/**
 * Create a unique card instance from a template
 */
export function createCardInstance(templateId: string): string | null {
  const gameState = getGameState();
  const template = gameState.cardLibrary[templateId];
  if (!template) {
    console.error('Card template not found:', templateId);
    return null;
  }
  
  const instanceId = `card_${gameState.nextCardInstanceId++}`;
  const instance: CardInstance = {
    instanceId: instanceId,
    templateId: templateId,
    ...template, // Copy all properties from template
    // Set expiration tracking if card expires
    turnsUntilExpiry: template.expires_after_turns && template.expires_after_turns > 0 
      ? template.expires_after_turns 
      : undefined
  };
  
  gameState.cardInstances[instanceId] = instance;
  return instanceId;
}

/**
 * Get card instance (falls back to template for backwards compatibility)
 */
export function getCard(cardId: string): Card | CardInstance | null {
  const gameState = getGameState();
  return gameState.cardInstances[cardId] || gameState.cardLibrary[cardId] || null;
}

