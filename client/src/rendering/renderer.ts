// Main renderer - coordinates all rendering

import type { Application } from 'pixi.js';
import { getGameState } from '../core/gameState.js';
import { renderBackground } from './renderBackground.js';
import { cleanupLaneAnimations, renderLanes } from './renderLanes.js';
import { renderCharacters } from './renderCharacters.js';
import { renderHand } from './renderHand.js';
import { renderTurnInfo } from './renderUI.js';
import { renderCardTooltip } from './renderCardTooltip.js';
import { renderStatusTooltip } from './renderStatusTooltip.js';
import { renderCharacterTooltip } from './renderCharacterTooltip.js';
import { renderDevPanel } from './devPanel.js';
import { renderVictoryModal } from './renderVictoryModal.js';
import { renderPlayedCardsStack } from './renderPlayedCards.js';
import { renderActiveCardShowcases } from '../../animations.js';
import { renderPreFightModal } from './renderPreFightModal.js';

let app: Application | null = null;

/**
 * Set the PIXI application
 */
export function setApp(application: Application): void {
  app = application;
}

/**
 * Get the PIXI application
 */
export function getApp(): Application | null {
  return app;
}

/**
 * Main render function - renders the entire scene
 */
export function render(): void {
  if (!app) return;
  
  const gameState = getGameState();
  cleanupLaneAnimations();
  app.stage.removeChildren();
  app.stage.sortableChildren = true;

  // Check if current player is dead — fallback to next living character in the queue
  const currentPlayer = gameState.characters.find(c => c.id === gameState.currentPlayerId);
  if (!currentPlayer || currentPlayer.hp <= 0) {
    const nextInQueue = gameState.turnQueue
      .slice(gameState.turnQueueIndex)
      .map(id => gameState.characters.find(c => c.id === id))
      .find(c => c && c.hp > 0);
    if (nextInQueue) {
      gameState.currentPlayerId = nextInQueue.id;
    } else {
      const anyLiving = gameState.characters.find(c => c.hp > 0);
      if (anyLiving) {
        gameState.currentPlayerId = anyLiving.id;
      }
    }
  }
  
  renderBackground(app);
  renderLanes(app, gameState);
  renderCharacters(app, gameState);

  if (gameState.preFight.active) {
    renderPreFightModal(app, gameState);
    renderDevPanel(gameState);
    return;
  }

  renderHand(app, gameState);
  renderPlayedCardsStack(app, gameState);
  renderTurnInfo(app, gameState);
  renderActiveCardShowcases(app);
  renderCardTooltip(app);
  renderCharacterTooltip(app);
  renderStatusTooltip(app);

  // Victory modal overlay (renders on top of everything)
  // Phase 1: gear reward (pendingReward set), Phase 2: wave complete (pendingReward null)
  if (gameState.combatResult === 'victory') {
    renderVictoryModal(app, gameState);
  }

  // Update HTML dev panel
  renderDevPanel(gameState);
}

