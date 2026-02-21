// UI rendering (turn info, combat log, buttons)

import type { Application } from 'pixi.js';
import { Graphics, Text, Rectangle } from 'pixi.js';
import type { GameState } from '../core/types.js';
import { WIDTH, SLOTS_PER_SIDE } from '../core/constants.js';
import { getCard } from '../core/card.js';
import { canRollbackTurn, getSelectedCardId, rollbackTurn } from '../core/gameState.js';
import { endTurn, moveCharacterForward, moveCharacterBack, getMoveCost, getSuppressionCostPenalty, getJumpTotalEnergyCostForSlot, getValidJumpSlots } from '../core/combat.js';
import { render as renderCallback } from './renderer.js';
import type { Card, Character } from '../core/types.js';
import { createEnergyIcon } from './icons/energyIcon.js';
import { getShowRollbackButtonSetting } from './preFightDisplaySettings.js';

export function getRollbackButtonUiState(): { visible: boolean; enabled: boolean } {
  const visible = getShowRollbackButtonSetting();
  return {
    visible,
    enabled: visible && canRollbackTurn(),
  };
}

/**
 * Render turn information and controls
 */
export function renderTurnInfo(app: Application, gameState: GameState): void {
  const currentPlayer = gameState.characters.find(c => c.id === gameState.currentPlayerId);

  // Reserve right side for End Turn column (End Turn + Rollback stacked)
  const endBtnReserve = 160;
  const rightBound = WIDTH - endBtnReserve;

  // Row 1: Stage + round badges + turn text (compact)
  const headerY = 12;
  const stageBadgeW = 80;
  const badgeH = 26;
  const stageBg = new Graphics();
  stageBg.roundRect(0, 0, stageBadgeW, badgeH, 6)
    .fill(0x3a2f0f)
    .stroke({ width: 1, color: 0xf59e0b });
  stageBg.x = 20;
  stageBg.y = headerY;
  stageBg.zIndex = 2000;
  stageBg.eventMode = 'none';
  app.stage.addChild(stageBg);

  const stageText = new Text({
    text: `Stage ${gameState.waveNumber}`,
    style: { fill: 0xfde68a, fontSize: 13, fontWeight: 'bold' }
  });
  stageText.x = 20 + (stageBadgeW - stageText.width) / 2;
  stageText.y = headerY + (badgeH - stageText.height) / 2;
  stageText.zIndex = 2001;
  stageText.eventMode = 'none';
  app.stage.addChild(stageText);

  const roundBadgeW = 68;
  const roundBg = new Graphics();
  roundBg.roundRect(0, 0, roundBadgeW, badgeH, 6)
    .fill(0x1e3a5f)
    .stroke({ width: 1, color: 0x3b82f6 });
  roundBg.x = 20 + stageBadgeW + 8;
  roundBg.y = headerY;
  roundBg.zIndex = 2000;
  roundBg.eventMode = 'none';
  app.stage.addChild(roundBg);

  const roundText = new Text({
    text: `Rd ${gameState.roundNumber}`,
    style: { fill: 0x93c5fd, fontSize: 14, fontWeight: 'bold' }
  });
  roundText.x = roundBg.x + (roundBadgeW - roundText.width) / 2;
  roundText.y = headerY + (badgeH - roundText.height) / 2;
  roundText.zIndex = 2001;
  roundText.eventMode = 'none';
  app.stage.addChild(roundText);

  const turnText = new Text({
    text: `${currentPlayer?.name ?? '—'}'s turn`,
    style: { fill: 0xffffff, fontSize: 16, fontWeight: 'bold' }
  });
  const turnTextGap = 4;
  turnText.x = 20;
  turnText.y = headerY + badgeH + turnTextGap;
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
        const sideLabel = card.targetSide === 'ally' ? 'allies' : 'enemies';
        if (aoeSlots >= SLOTS_PER_SIDE) {
          instructionText = `Click target - hits all ${sideLabel}!`;
        } else {
          instructionText = `Click target - hits ${aoeSlots} ${sideLabel} slots!`;
        }
      } else if (card.targeting === 'ally' || card.targeting === 'allAllies') {
        instructionText = 'Click ally to target!';
      } else if (card.targeting === 'self') {
        instructionText = 'Click card again to use!';
      } else if (card.targeting === 'enemy') {
        instructionText = card.allowEmptySlotTarget ? 'Click enemy or empty lane to target!' : 'Click enemy to target!';
      } else if (card.targeting === 'slot') {
        instructionText = 'Click an empty slot to jump!';
      }
      
      const selectedText = new Text({
        text: `Selected: ${card.name} - ${instructionText}`,
        style: {
          fill: 0x4ade80,
          fontSize: 14,
          fontWeight: 'bold',
          stroke: { color: 0x052e16, width: 3 }
        }
      });
      const selectedPadX = 14;
      const selectedPadY = 6;
      const selectedPillW = selectedText.width + selectedPadX * 2;
      const selectedPillH = selectedText.height + selectedPadY * 2;
      const selectedPillX = (WIDTH - selectedPillW) / 2;
      const selectedPillY = 297;

      const selectedBg = new Graphics();
      selectedBg.roundRect(0, 0, selectedPillW, selectedPillH, 8)
        .fill({ color: 0x0b1220, alpha: 0.86 })
        .stroke({ width: 2, color: 0x16a34a, alpha: 0.95 });
      selectedBg.x = selectedPillX;
      selectedBg.y = selectedPillY;
      selectedBg.eventMode = 'none';
      selectedBg.zIndex = 1999;
      app.stage.addChild(selectedBg);

      selectedText.x = selectedPillX + selectedPadX;
      selectedText.y = selectedPillY + selectedPadY;
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
  
  // Movement buttons - compact, placed just below the card hand
  const moveBtnH = 28;
  const moveBtnW = 80;
  const moveBtnGap = 8;
  const moveBtnY = 166; // just below the player cards (y=60 + cardH=100 + 6px gap)
  const isAllyTurn = currentPlayer?.isPlayer === true;
  const isCurrentPlayerAlive = currentPlayer && currentPlayer.hp > 0;
  const moveInfo = currentPlayer ? getMoveCost(currentPlayer) : { energyCost: 1, usesCharge: false };
  const moveCost = moveInfo.energyCost;
  const isFreeMove = moveInfo.usesCharge;
  const canMove = isAllyTurn && isCurrentPlayerAlive && currentPlayer && (isFreeMove || currentPlayer.energy >= moveCost);

  if (isAllyTurn && currentPlayer) {
    // Centre the pair of buttons horizontally
    const totalMoveBtnW = moveBtnW * 2 + moveBtnGap;
    const moveBtnStartX = (WIDTH - totalMoveBtnW) / 2;

    // ◀ Back (left button – moves away from enemies)
    const moveBackBtn = new Graphics();
    moveBackBtn.roundRect(0, 0, moveBtnW, moveBtnH, 6).fill(0x1f2937).stroke({ width: 1, color: canMove ? 0x22c55e : 0x4b5563 });
    moveBackBtn.x = moveBtnStartX;
    moveBackBtn.y = moveBtnY;
    moveBackBtn.zIndex = 1500;
    moveBackBtn.eventMode = 'static';
    moveBackBtn.cursor = 'pointer';
    moveBackBtn.hitArea = new Rectangle(0, 0, moveBtnW, moveBtnH);
    moveBackBtn.on('pointerdown', () => {
      if (canMove && currentPlayer && moveCharacterBack(currentPlayer.id, renderCallback)) {
        renderCallback();
      }
    });
    app.stage.addChild(moveBackBtn);
    const moveBackText = new Text({
      text: '◀ Back',
      style: { fill: 0xffffff, fontSize: 11, fontWeight: 'bold' }
    });
    const backIconSize = 11;
    const backIconGap = 2;
    if (isFreeMove) {
      // Show "◀ Back FREE" with charges count
      const backFreeLabel = new Text({
        text: `◀ Back FREE (${currentPlayer!.moveCharges})`,
        style: { fill: 0x22c55e, fontSize: 11, fontWeight: 'bold' }
      });
      backFreeLabel.x = moveBackBtn.x + (moveBtnW - backFreeLabel.width) / 2;
      backFreeLabel.y = moveBtnY + (moveBtnH - backFreeLabel.height) / 2;
      backFreeLabel.eventMode = 'none';
      backFreeLabel.zIndex = 1501;
      app.stage.addChild(backFreeLabel);
    } else {
      const backTotalCostW = moveCost * backIconSize + Math.max(0, moveCost - 1) * backIconGap;
      const backContentW = moveBackText.width + 4 + backTotalCostW;
      const backContentX = moveBackBtn.x + (moveBtnW - backContentW) / 2;
      moveBackText.x = backContentX;
      moveBackText.y = moveBtnY + (moveBtnH - moveBackText.height) / 2;
      moveBackText.eventMode = 'none';
      moveBackText.zIndex = 1501;
      app.stage.addChild(moveBackText);
      for (let ei = 0; ei < moveCost; ei++) {
        const icon = createEnergyIcon(backIconSize);
        icon.x = backContentX + moveBackText.width + 4 + ei * (backIconSize + backIconGap);
        icon.y = moveBtnY + (moveBtnH - backIconSize) / 2;
        icon.zIndex = 1501;
        app.stage.addChild(icon);
      }
    }

    // ▶ Fwd (right button – moves toward enemies)
    const moveFwdBtn = new Graphics();
    moveFwdBtn.roundRect(0, 0, moveBtnW, moveBtnH, 6).fill(0x1f2937).stroke({ width: 1, color: canMove ? 0x22c55e : 0x4b5563 });
    moveFwdBtn.x = moveBtnStartX + moveBtnW + moveBtnGap;
    moveFwdBtn.y = moveBtnY;
    moveFwdBtn.zIndex = 1500;
    moveFwdBtn.eventMode = 'static';
    moveFwdBtn.cursor = 'pointer';
    moveFwdBtn.hitArea = new Rectangle(0, 0, moveBtnW, moveBtnH);
    moveFwdBtn.on('pointerdown', () => {
      if (canMove && currentPlayer && moveCharacterForward(currentPlayer.id, renderCallback)) {
        renderCallback();
      }
    });
    app.stage.addChild(moveFwdBtn);
    const fwdIconSize = 11;
    const fwdIconGap = 2;
    if (isFreeMove) {
      // Show "Fwd ▶ FREE" with charges count
      const fwdFreeLabel = new Text({
        text: `FREE (${currentPlayer!.moveCharges}) Fwd ▶`,
        style: { fill: 0x22c55e, fontSize: 11, fontWeight: 'bold' }
      });
      fwdFreeLabel.x = moveFwdBtn.x + (moveBtnW - fwdFreeLabel.width) / 2;
      fwdFreeLabel.y = moveBtnY + (moveBtnH - fwdFreeLabel.height) / 2;
      fwdFreeLabel.eventMode = 'none';
      fwdFreeLabel.zIndex = 1501;
      app.stage.addChild(fwdFreeLabel);
    } else {
      const moveFwdText = new Text({
        text: 'Fwd ▶',
        style: { fill: 0xffffff, fontSize: 11, fontWeight: 'bold' }
      });
      const fwdTotalCostW = moveCost * fwdIconSize + Math.max(0, moveCost - 1) * fwdIconGap;
      const fwdContentW = moveFwdText.width + 4 + fwdTotalCostW;
      const fwdContentX = moveFwdBtn.x + (moveBtnW - fwdContentW) / 2;
      moveFwdText.x = fwdContentX;
      moveFwdText.y = moveBtnY + (moveBtnH - moveFwdText.height) / 2;
      moveFwdText.eventMode = 'none';
      moveFwdText.zIndex = 1501;
      app.stage.addChild(moveFwdText);
      for (let ei = 0; ei < moveCost; ei++) {
        const icon = createEnergyIcon(fwdIconSize);
        icon.x = fwdContentX + moveFwdText.width + 4 + ei * (fwdIconSize + fwdIconGap);
        icon.y = moveBtnY + (moveBtnH - fwdIconSize) / 2;
        icon.zIndex = 1501;
        app.stage.addChild(icon);
      }
    }
  }

  // End turn button
  const endBtnW = 120;
  const endBtnH = 36;
  const rollbackBtnGap = 10;
  const rollbackBtnW = 120;
  const rollbackState = getRollbackButtonUiState();
  const endBtnX = WIDTH - endBtnW - 20;
  const rollbackBtnX = endBtnX;
  const endBtnY = 20;
  const rollbackBtnY = endBtnY + endBtnH + rollbackBtnGap;

  if (rollbackState.visible) {
    const rollbackBtn = new Graphics();
    const rollbackFill = rollbackState.enabled ? 0x334155 : 0x1f2937;
    const rollbackStroke = rollbackState.enabled ? 0x94a3b8 : 0x4b5563;
    rollbackBtn.roundRect(0, 0, rollbackBtnW, endBtnH, 8).fill(rollbackFill).stroke({ width: 1, color: rollbackStroke });
    rollbackBtn.x = rollbackBtnX;
    rollbackBtn.y = rollbackBtnY;
    rollbackBtn.zIndex = 2500;
    rollbackBtn.eventMode = 'static';
    rollbackBtn.cursor = rollbackState.enabled ? 'pointer' : 'default';
    rollbackBtn.hitArea = new Rectangle(0, 0, rollbackBtnW, endBtnH);
    rollbackBtn.on('pointerdown', () => {
      if (rollbackState.enabled) {
        rollbackTurn(renderCallback);
      }
    });
    app.stage.addChild(rollbackBtn);

    const rollbackText = new Text({
      text: 'Rollback',
      style: { fill: rollbackState.enabled ? 0xffffff : 0x9ca3af, fontSize: 14, fontWeight: 'bold' }
    });
    rollbackText.x = rollbackBtnX + (rollbackBtnW - rollbackText.width) / 2;
    rollbackText.y = rollbackBtnY + (endBtnH - rollbackText.height) / 2;
    rollbackText.eventMode = 'none';
    rollbackText.zIndex = 2501;
    app.stage.addChild(rollbackText);
  }

  const btn = new Graphics();
  btn.roundRect(0, 0, endBtnW, endBtnH, 8).fill(0x3b82f6);
  btn.x = endBtnX;
  btn.y = endBtnY;
  btn.zIndex = 2500;
  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.hitArea = new Rectangle(0, 0, endBtnW, endBtnH);
  btn.on('pointerdown', () => {
    endTurn(renderCallback);
  });
  app.stage.addChild(btn);
  
  const btnText = new Text({
    text: 'End Turn',
    style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' }
  });
  btnText.x = endBtnX + (endBtnW - btnText.width) / 2;
  btnText.y = endBtnY + (endBtnH - btnText.height) / 2;
  btnText.eventMode = 'none';
  btnText.zIndex = 2501;
  app.stage.addChild(btnText);
}

// ---------------------------------------------------------------------------
// Targeting diagnostics – figure out *why* there are no valid targets
// ---------------------------------------------------------------------------

export function getTargetingWarning(card: Card, caster: Character, gameState: GameState): string | null {
  // Self-targeting cards always have a target (the caster)
  if (card.targeting === 'self') return null;

  if (card.targeting === 'slot') {
    const jumpEffect = card.effects.find(effect => effect.kind === 'jump');
    const validSlots = getValidJumpSlots(caster, jumpEffect?.rangeLimit);
    if (validSlots.length === 0) {
      return 'No legal jump destinations!';
    }
    const cheapestJump = Math.min(...validSlots.map(slot => getJumpTotalEnergyCostForSlot(caster, card, slot)));
    if (caster.energy < cheapestJump) {
      return `Not enough energy! Cheapest jump costs ${cheapestJump}, have ${caster.energy}`;
    }
    return null;
  }

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

  // Not enough energy (include suppression penalty for ranged cards)
  const suppressionPenalty = getSuppressionCostPenalty(caster, card);
  const totalCost = card.cost.energy + suppressionPenalty;
  if (caster.energy < totalCost) {
    return suppressionPenalty > 0
      ? `Not enough energy! (need ${totalCost} (${card.cost.energy} + ${suppressionPenalty} suppressed), have ${caster.energy})`
      : `Not enough energy! (need ${totalCost}, have ${caster.energy})`;
  }

  // Range check – only matters if the card has a maxRange or minRange
  // (self-targeting already returned null above, so no overlap issue)
  if (card.maxRange || card.minRange) {
    const inRange = candidates.filter(c => {
      const dist = Math.abs(caster.slotIndex - c.slotIndex);
      if (card.maxRange && dist > card.maxRange) return false;
      if (card.minRange && dist < card.minRange) return false;
      return true;
    });

    if (inRange.length === 0) {
      // Find the closest candidate to give a helpful distance hint
      const distances = candidates.map(c => Math.abs(caster.slotIndex - c.slotIndex));
      const closest = Math.min(...distances);
      const farthest = Math.max(...distances);
      const targetLabel = sideLabel === 'enemies' ? 'enemy' : 'ally';

      // Determine if targets are too far, too close, or both
      if (card.minRange && farthest < card.minRange) {
        return `Too close! Farthest ${targetLabel}: ${farthest} slot${farthest !== 1 ? 's' : ''} (min range: ${card.minRange}) — move away`;
      } else if (card.maxRange && closest > card.maxRange) {
        return `Out of range! Closest ${targetLabel}: ${closest} slots (max range: ${card.maxRange}) — move closer`;
      } else {
        return `No valid targets in range ${card.minRange ?? 0}–${card.maxRange ?? '∞'}`;
      }
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

