// UI rendering (turn info, combat log, buttons)

import type { Application } from 'pixi.js';
import { Graphics, Text, Rectangle } from 'pixi.js';
import type { GameState } from '../core/types.js';
import { WIDTH } from '../core/constants.js';
import { getCard } from '../core/card.js';
import { getSelectedCardId } from '../core/gameState.js';
import { endTurn } from '../core/combat.js';
import { render as renderCallback } from './renderer.js';

/**
 * Render turn information and controls
 */
export function renderTurnInfo(app: Application, gameState: GameState): void {
  const currentPlayer = gameState.characters.find(c => c.id === gameState.currentPlayerId);
  const turnText = new Text({
    text: `Turn ${gameState.turnIndex + 1} - ${currentPlayer?.name}'s turn`,
    style: { fill: 0xffffff, fontSize: 18, fontWeight: 'bold' }
  });
  turnText.x = 20;
  turnText.y = 20;
  turnText.eventMode = 'none';
  app.stage.addChild(turnText);
  
  const selectedCardId = getSelectedCardId();
  if (selectedCardId) {
    const card = getCard(selectedCardId);
    if (card) {
      let instructionText = 'Click enemy to attack!';
      if (card.targeting === 'aoe') {
        const aoeSlots = card.aoeSlots ?? 3;
        if (aoeSlots === 4) {
          instructionText = 'Click target - hits all enemies!';
        } else {
          instructionText = `Click target - hits ${aoeSlots} slots!`;
        }
      } else if (card.targeting === 'ally' || card.targeting === 'allAllies') {
        instructionText = 'Click ally to target!';
      } else if (card.targeting === 'self') {
        instructionText = 'Click card again to use!';
      } else if (card.targeting === 'enemy') {
        instructionText = 'Click enemy to target!';
      }
      
      const selectedText = new Text({
        text: `Selected: ${card.name} - ${instructionText}`,
        style: { fill: 0x22c55e, fontSize: 14 }
      });
      selectedText.x = 20;
      selectedText.y = 50;
      selectedText.eventMode = 'none';
      app.stage.addChild(selectedText);
    }
  }
  
  // End turn button
  const btnW = 120;
  const btnH = 40;
  const btn = new Graphics();
  btn.roundRect(0, 0, btnW, btnH, 8).fill(0x3b82f6);
  btn.x = WIDTH - btnW - 20;
  btn.y = 20;
  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.hitArea = new Rectangle(0, 0, btnW, btnH);
  btn.on('pointerdown', () => {
    endTurn(renderCallback);
  });
  app.stage.addChild(btn);
  
  const btnText = new Text({
    text: 'End Turn',
    style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' }
  });
  btnText.x = WIDTH - btnW - 20 + (btnW - btnText.width) / 2;
  btnText.y = 20 + (btnH - btnText.height) / 2;
  btnText.eventMode = 'none';
  app.stage.addChild(btnText);
}

/**
 * Render combat log
 */
export function renderCombatLog(app: Application, gameState: GameState): void {
  const logX = WIDTH - 300;
  const logY = 80;
  const maxEntries = 8;
  
  const logTitle = new Text({
    text: 'Combat Log:',
    style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' }
  });
  logTitle.x = logX;
  logTitle.y = logY;
  logTitle.eventMode = 'none';
  app.stage.addChild(logTitle);
  
  // Show recent log entries
  const recentEntries = gameState.combatLog.slice(-maxEntries);
  recentEntries.forEach((entry, i) => {
    const logEntry = new Text({
      text: entry,
      style: { fill: 0x9ca3af, fontSize: 11 }
    });
    logEntry.x = logX;
    logEntry.y = logY + 20 + i * 15;
    logEntry.eventMode = 'none';
    if (app) {
      app.stage.addChild(logEntry);
    }
  });
}

