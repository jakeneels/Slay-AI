// Main renderer - coordinates all rendering

import type { Application } from 'pixi.js';
import { getGameState } from '../core/gameState.js';
import { renderBackground } from './renderBackground.js';
import { renderLanes } from './renderLanes.js';
import { renderCharacters } from './renderCharacters.js';
import { renderHand } from './renderHand.js';
import { renderTurnInfo } from './renderUI.js';
import { renderCardTooltip } from './renderCardTooltip.js';
import { renderStatusTooltip } from './renderStatusTooltip.js';
import { renderDevPanel } from './devPanel.js';
import { renderVictoryModal } from './renderVictoryModal.js';

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
  app.stage.removeChildren();
  app.stage.sortableChildren = true;

  // Check if current player is dead and advance turn if needed
  const currentPlayer = gameState.characters.find(c => c.id === gameState.currentPlayerId);
  if (!currentPlayer || currentPlayer.hp <= 0) {
    const livingCharacters = gameState.characters.filter(c => c.hp > 0);
    if (livingCharacters.length > 0) {
      gameState.currentPlayerId = livingCharacters[0].id;
    }
  }
  
  renderBackground(app);
  renderLanes(app);
  renderCharacters(app, gameState);
  renderHand(app, gameState);
  renderTurnInfo(app, gameState);
  renderCardTooltip(app);
  renderStatusTooltip(app);

  // Victory modal overlay (renders on top of everything)
  // Phase 1: gear reward (pendingReward set), Phase 2: wave complete (pendingReward null)
  if (gameState.combatResult === 'victory') {
    renderVictoryModal(app, gameState);
  }

  // Update HTML dev panel
  renderDevPanel(gameState);
}

