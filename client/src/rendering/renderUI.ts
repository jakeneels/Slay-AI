// UI rendering (turn info, combat log, buttons)

import type { Application } from 'pixi.js';
import { Graphics, Text, Rectangle } from 'pixi.js';
import type { GameState } from '../core/types.js';
import { WIDTH } from '../core/constants.js';
import { getCard } from '../core/card.js';
import { getSelectedCardId } from '../core/gameState.js';
import { endTurn, moveCharacterForward, moveCharacterBack } from '../core/combat.js';
import { render as renderCallback } from './renderer.js';
import type { Card, Character } from '../core/types.js';

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
  turnText.zIndex = 2000;
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
      selectedText.zIndex = 2000;
      app.stage.addChild(selectedText);

      // Check if there are actually valid targets; if not, show a centered warning
      const warning = getTargetingWarning(card, currentPlayer!, gameState);
      if (warning) {
        const warningPadX = 16;
        const warningPadY = 8;
        const warningText = new Text({
          text: warning,
          style: { fill: 0xfbbf24, fontSize: 14, fontWeight: 'bold' }
        });
        const pillW = warningText.width + warningPadX * 2;
        const pillH = warningText.height + warningPadY * 2;
        const pillX = (WIDTH - pillW) / 2;
        const pillY = 360; // centred vertically in the battlefield area

        const warningBg = new Graphics();
        warningBg.roundRect(0, 0, pillW, pillH, 8)
          .fill({ color: 0x1c1917, alpha: 0.92 })
          .stroke({ width: 2, color: 0xb45309, alpha: 0.8 });
        warningBg.x = pillX;
        warningBg.y = pillY;
        warningBg.zIndex = 2000;
        warningBg.eventMode = 'none';
        app.stage.addChild(warningBg);

        warningText.x = pillX + warningPadX;
        warningText.y = pillY + warningPadY;
        warningText.eventMode = 'none';
        warningText.zIndex = 2001;
        app.stage.addChild(warningText);
      }
    }
  }
  
  // Movement buttons - only for ally turns (current player is ally)
  const btnH = 40;
  const moveBtnW = 100;
  const endTurnBtnW = 120;
  const isAllyTurn = currentPlayer?.isPlayer === true;
  const isCurrentPlayerAlive = currentPlayer && currentPlayer.hp > 0;
  const moveCost = currentPlayer ? (gameState.characterLibrary[currentPlayer.id]?.stats?.moveEnergyCost ?? 1) : 1;
  const canMove = isAllyTurn && isCurrentPlayerAlive && currentPlayer && currentPlayer.energy >= moveCost;

  if (isAllyTurn && currentPlayer) {
    // Move Forward
    const moveFwdBtn = new Graphics();
    moveFwdBtn.roundRect(0, 0, moveBtnW, btnH, 8).fill(canMove ? 0x22c55e : 0x4b5563);
    moveFwdBtn.x = WIDTH - endTurnBtnW - moveBtnW * 2 - 60;
    moveFwdBtn.y = 20;
    moveFwdBtn.zIndex = 1500;
    moveFwdBtn.eventMode = 'static';
    moveFwdBtn.cursor = 'pointer';
    moveFwdBtn.hitArea = new Rectangle(0, 0, moveBtnW, btnH);
    moveFwdBtn.on('pointerdown', () => {
      if (canMove && currentPlayer && moveCharacterForward(currentPlayer.id, renderCallback)) {
        renderCallback();
      }
    });
    app.stage.addChild(moveFwdBtn);
    const moveFwdText = new Text({
      text: `▶ Fwd (${moveCost})`,
      style: { fill: 0xffffff, fontSize: 12, fontWeight: 'bold' }
    });
    moveFwdText.x = moveFwdBtn.x + (moveBtnW - moveFwdText.width) / 2;
    moveFwdText.y = 20 + (btnH - moveFwdText.height) / 2;
    moveFwdText.eventMode = 'none';
    moveFwdText.zIndex = 1501;
    app.stage.addChild(moveFwdText);

    // Move Back
    const moveBackBtn = new Graphics();
    moveBackBtn.roundRect(0, 0, moveBtnW, btnH, 8).fill(canMove ? 0x22c55e : 0x4b5563);
    moveBackBtn.x = WIDTH - endTurnBtnW - moveBtnW - 40;
    moveBackBtn.y = 20;
    moveBackBtn.zIndex = 1500;
    moveBackBtn.eventMode = 'static';
    moveBackBtn.cursor = 'pointer';
    moveBackBtn.hitArea = new Rectangle(0, 0, moveBtnW, btnH);
    moveBackBtn.on('pointerdown', () => {
      if (canMove && currentPlayer && moveCharacterBack(currentPlayer.id, renderCallback)) {
        renderCallback();
      }
    });
    app.stage.addChild(moveBackBtn);
    const moveBackText = new Text({
      text: `◀ Back (${moveCost})`,
      style: { fill: 0xffffff, fontSize: 12, fontWeight: 'bold' }
    });
    moveBackText.x = moveBackBtn.x + (moveBtnW - moveBackText.width) / 2;
    moveBackText.y = 20 + (btnH - moveBackText.height) / 2;
    moveBackText.eventMode = 'none';
    moveBackText.zIndex = 1501;
    app.stage.addChild(moveBackText);
  }

  // End turn button
  const btnW = 120;
  const btn = new Graphics();
  btn.roundRect(0, 0, btnW, btnH, 8).fill(0x3b82f6);
  btn.x = WIDTH - btnW - 20;
  btn.y = 20;
  btn.zIndex = 1500;
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
  btnText.zIndex = 1501;
  app.stage.addChild(btnText);
}

// ---------------------------------------------------------------------------
// Targeting diagnostics – figure out *why* there are no valid targets
// ---------------------------------------------------------------------------

function getTargetingWarning(card: Card, caster: Character, gameState: GameState): string | null {
  // Self-targeting cards always have a target (the caster)
  if (card.targeting === 'self') return null;

  const living = gameState.characters.filter(c => c.hp > 0);

  // Determine the candidate pool based on targeting type
  let candidates: Character[];
  let sideLabel: string;

  if (card.targeting === 'ally' || card.targeting === 'allAllies') {
    candidates = living.filter(c => c.isPlayer);
    sideLabel = 'allies';
  } else {
    // enemy, single, aoe, allEnemies
    candidates = living.filter(c => !c.isPlayer);
    sideLabel = 'enemies';
  }

  // No living characters on the target side at all
  if (candidates.length === 0) {
    return `No ${sideLabel} remaining!`;
  }

  // Not enough energy
  if (caster.energy < card.cost.energy) {
    return `Not enough energy! (need ${card.cost.energy}, have ${caster.energy})`;
  }

  // Range check – only matters if the card has a maxRange
  // (self-targeting already returned null above, so no overlap issue)
  if (card.maxRange) {
    const inRange = candidates.filter(c =>
      Math.abs(caster.slotIndex - c.slotIndex) <= card.maxRange!
    );

    if (inRange.length === 0) {
      // Find the closest candidate to give a helpful distance hint
      const distances = candidates.map(c => Math.abs(caster.slotIndex - c.slotIndex));
      const closest = Math.min(...distances);
      return `Out of range! Closest ${sideLabel === 'enemies' ? 'enemy' : 'ally'}: ${closest} slots (max range: ${card.maxRange}) — move closer`;
    }
  }

  // All good – there are valid, reachable targets
  return null;
}

/**
 * Render combat log
 */
export function renderCombatLog(app: Application, gameState: GameState): void {
  const logX = 20;
  const logY = 80;
  const maxEntries = 8;
  
  const logTitle = new Text({
    text: 'Combat Log:',
    style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' }
  });
  logTitle.x = logX;
  logTitle.y = logY;
  logTitle.eventMode = 'none';
  logTitle.zIndex = 2000;
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
    logEntry.zIndex = 2000;
    if (app) {
      app.stage.addChild(logEntry);
    }
  });
}

