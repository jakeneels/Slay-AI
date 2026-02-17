// Hand rendering (player and enemy hands)

import type { Application } from 'pixi.js';
import { Graphics, Text, Rectangle } from 'pixi.js';
import type { GameState, Character, Card, CardEffect, BaseCardEffect, StatusEffect, StatusModifyEffect, StatusSpreadEffect } from '../core/types.js';
import { WIDTH } from '../core/constants.js';

/** Max slots shown on card position indicators (largest AOE in the game). */
const MAX_INDICATOR_SLOTS = 4;
import { getCard } from '../core/card.js';
import { getSelectedCardId, setSelectedCardId } from '../core/gameState.js';
import { render as renderCallback } from './renderer.js';
import { playCard, getSuppressionCostPenalty } from '../core/combat.js';
import { createEnergyIcon } from './icons/energyIcon.js';
import { createDamageIcon } from './icons/damageIcon.js';
import { createSpeedIcon } from './icons/speedIcon.js';
import { createKnockbackIcon } from './icons/knockbackIcon.js';
import { createHealIcon } from './icons/healIcon.js';
import { createRarityIcon } from './icons/rarityIcon.js';
import { createExhaustIcon } from './icons/exhaustIcon.js';
import { createShieldIcon } from './icons/shieldIcon.js';
import { createRangeIcon } from './icons/rangeIcon.js';
import { calculateRangeModifier } from '../core/constants.js';
import { setHoveredCard } from './tooltipState.js';
import { getStatusDisplay } from './statusConfig.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a display key for an effect, combining effectTarget + card targeting. */
function resolveDisplayKey(effect: CardEffect, card: Card): string {
  if (effect.kind === 'modifier' || effect.kind === 'deck_inject') return 'other';
  const et = (effect as BaseCardEffect).effectTarget;
  if (!et || et === 'target') {
    // Inherit from card-level targeting
    switch (card.targeting) {
      case 'self': return 'self';
      case 'ally': return 'ally';
      case 'aoe': return `aoe_${card.aoeSlots ?? 3}`;
      case 'allEnemies': return 'allEnemies';
      case 'allAllies': return 'allAllies';
      default: return 'enemy'; // 'enemy', 'single'
    }
  }
  if (et === 'aoe') {
    const slots = (effect as BaseCardEffect).aoeSlots ?? card.aoeSlots ?? 3;
    return `aoe_${slots}`;
  }
  return et; // 'self' | 'allAllies' | 'allEnemies'
}

type TargetType = 'enemy' | 'ally' | 'self';

/** Resolve display key to position indicator config. All targeting uses circles, no text labels. */
function labelForKey(key: string): { usePositionIndicator: boolean; targetType: TargetType; filledCount: number } {
  if (key === 'self') return { usePositionIndicator: true, targetType: 'self', filledCount: 1 };
  if (key === 'ally') return { usePositionIndicator: true, targetType: 'ally', filledCount: 1 };
  if (key === 'enemy') return { usePositionIndicator: true, targetType: 'enemy', filledCount: 1 };
  if (key === 'allEnemies') return { usePositionIndicator: true, targetType: 'enemy', filledCount: MAX_INDICATOR_SLOTS };
  if (key === 'allAllies') return { usePositionIndicator: true, targetType: 'ally', filledCount: MAX_INDICATOR_SLOTS };
  if (key.startsWith('aoe_')) {
    const slots = Math.min(MAX_INDICATOR_SLOTS, Math.max(1, parseInt(key.split('_')[1], 10) || 3));
    return { usePositionIndicator: true, targetType: 'enemy', filledCount: slots };
  }
  return { usePositionIndicator: false, targetType: 'enemy', filledCount: 0 };
}

/** Darkest Dungeon-style position indicator. Self and AOE: only filled circles. Enemy/Ally single: side slots with empties.
 *  When reachableSlots is provided, out-of-range positions are rendered very dim to show range limits.
 */
function renderPositionIndicator(
  app: Application,
  x: number,
  y: number,
  filledCount: number,
  targetType: TargetType,
  circleSize: number,
  /** For AOE, targetSide overrides targetType (enemy vs ally); ignored for self. */
  aoeTargetSide?: 'enemy' | 'ally',
  /** When true, only draw filled circles (no empties). Use for self and AOE/adjacent. */
  noEmptySlots?: boolean,
  /** How many slots from frontline are in range (1-MAX_INDICATOR_SLOTS). Undefined = all in range. */
  reachableSlots?: number
): number {
  const effectiveType: TargetType = aoeTargetSide ?? targetType;
  const fillColor = effectiveType === 'enemy' ? 0xff6b6b : effectiveType === 'ally' ? 0x4ade80 : 0x60a5fa;
  const strokeColor = effectiveType === 'enemy' ? 0xb91c1c : effectiveType === 'ally' ? 0x166534 : 0x1d4ed8;
  const gap = 2;

  // If range is limited, always show all indicator slots so the range restriction is visible
  const hasRangeLimit = reachableSlots !== undefined && reachableSlots < MAX_INDICATOR_SLOTS;
  const totalSlots = (noEmptySlots && !hasRangeLimit) ? filledCount : MAX_INDICATOR_SLOTS;
  const maxReachable = Math.min(reachableSlots ?? totalSlots, MAX_INDICATOR_SLOTS);

  const totalW = totalSlots * circleSize + Math.max(0, totalSlots - 1) * gap;
  const g = new Graphics();
  for (let i = 0; i < totalSlots; i++) {
    const cx = i * (circleSize + gap) + circleSize / 2;
    const cy = circleSize / 2;
    const filled = i < filledCount;
    const inRange = i < maxReachable;

    g.circle(cx, cy, circleSize / 2);

    if (!inRange) {
      // Out of range: very dim with dark red tint
      g.fill(0x1a1a1a);
      g.stroke({ width: 1, color: 0x3a1a1a });
    } else if (filled) {
      // In range and targeted: bright color
      g.fill(fillColor);
      g.stroke({ width: 1, color: strokeColor });
    } else {
      // In range but not targeted: grey
      g.fill(0x374151);
      g.stroke({ width: 1, color: 0x4b5563 });
    }
  }
  g.x = x;
  g.y = y;
  g.eventMode = 'none';
  app.stage.addChild(g);
  return totalW;
}

/** Group card effects by display key (preserves insertion order). */
function groupEffects(card: Card): Map<string, CardEffect[]> {
  const groups = new Map<string, CardEffect[]>();
  for (const effect of card.effects) {
    const key = resolveDisplayKey(effect, card);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(effect);
  }
  return groups;
}

/** Create the correct icon for an effect kind. */
function createEffectIcon(kind: string, size: number): Graphics | null {
  switch (kind) {
    case 'damage': case 'aoe_damage': return createDamageIcon(size);
    case 'heal': return createHealIcon(size);
    case 'speed': return createSpeedIcon(size);
    case 'energy': return createEnergyIcon(size);
    case 'grant_block_layer': return createShieldIcon(size);
    case 'knockback': return createKnockbackIcon(size);
    default: return null;
  }
}

/** Map effect kind to a color matching its icon for color-coded numbers. */
function effectColor(kind: string): number {
  switch (kind) {
    case 'damage': case 'aoe_damage': return 0xef4444;   // red
    case 'heal':                      return 0x4ade80;   // green
    case 'speed':                     return 0x2dd4bf;   // teal
    case 'energy':                    return 0x38bdf8;   // blue
    case 'grant_block_layer':         return 0x60a5fa;   // blue
    case 'knockback':                 return 0xef4444;   // red-orange
    default:                          return 0xd1d5db;   // gray fallback
  }
}

/** Render a single effect: [icon]N with color-coded number. Returns x-advance. */
function renderSingleEffect(
  app: Application,
  effect: CardEffect,
  startX: number,
  rowY: number,
  iconSize: number,
  fontSize: number,
): number {
  if (effect.kind === 'modifier' || effect.kind === 'deck_inject') return startX;

  // Status effects use their own icon + stacks display
  if (effect.kind === 'status') {
    const se = effect as StatusEffect;
    const stacks = se.stacks ?? 1;
    const statusDisplay = getStatusDisplay(se.status);
    let ex = startX;

    // Draw the status icon from statusConfig if available
    if (statusDisplay && statusDisplay.drawIcons.length > 0) {
      const iconG = new Graphics();
      statusDisplay.drawIcons[0](iconG, iconSize);
      iconG.x = ex; iconG.y = rowY;
      iconG.eventMode = 'none';
      app.stage.addChild(iconG);
      ex += iconSize + 2;
    }

    // Stacks number in the status color
    const color = statusDisplay?.iconColor ?? 0x9ca3af;
    const stackText = new Text({
      text: `${stacks}`,
      style: { fill: color, fontSize, fontWeight: 'bold' }
    });
    stackText.x = ex; stackText.y = rowY; stackText.eventMode = 'none';
    app.stage.addChild(stackText);
    ex += stackText.width;

    return ex;
  }

  // Status modify effects: show op symbol + status icon
  if (effect.kind === 'status_modify') {
    const sm = effect as StatusModifyEffect;
    const statusDisplay = getStatusDisplay(sm.status);
    let ex = startX;

    // Draw the status icon from statusConfig if available
    if (statusDisplay && statusDisplay.drawIcons.length > 0) {
      const iconG = new Graphics();
      statusDisplay.drawIcons[0](iconG, iconSize);
      iconG.x = ex; iconG.y = rowY;
      iconG.eventMode = 'none';
      app.stage.addChild(iconG);
      ex += iconSize + 2;
    }

    // Op label (e.g. "×3")
    const color = statusDisplay?.iconColor ?? 0x9ca3af;
    let opLabel: string;
    switch (sm.op) {
      case 'multiply': opLabel = `×${sm.amount}`; break;
      case 'add': opLabel = sm.amount >= 0 ? `+${sm.amount}` : `${sm.amount}`; break;
      case 'set': opLabel = `=${sm.amount}`; break;
    }
    const opText = new Text({
      text: opLabel,
      style: { fill: color, fontSize, fontWeight: 'bold' }
    });
    opText.x = ex; opText.y = rowY; opText.eventMode = 'none';
    app.stage.addChild(opText);
    ex += opText.width;

    return ex;
  }

  // Status spread: show status icon + fraction label
  if (effect.kind === 'status_spread') {
    const ss = effect as StatusSpreadEffect;
    const statusDisplay = getStatusDisplay(ss.status);
    let ex = startX;

    if (statusDisplay && statusDisplay.drawIcons.length > 0) {
      const iconG = new Graphics();
      statusDisplay.drawIcons[0](iconG, iconSize);
      iconG.x = ex; iconG.y = rowY;
      iconG.eventMode = 'none';
      app.stage.addChild(iconG);
      ex += iconSize + 2;
    }

    const color = statusDisplay?.iconColor ?? 0x9ca3af;
    const pct = Math.round(ss.fraction * 100);
    const spreadRange = Math.max(0, Math.floor(ss.spreadRange ?? 1));
    const spreadSide = ss.spreadSide ?? 'same';
    const sideTag = spreadSide === 'same' ? 'S' : spreadSide === 'opposing' ? 'O' : 'B';
    const spreadText = new Text({
      text: `${pct}%→r${spreadRange}${sideTag}`,
      style: { fill: color, fontSize: fontSize - 1, fontWeight: 'bold' }
    });
    spreadText.x = ex; spreadText.y = rowY; spreadText.eventMode = 'none';
    app.stage.addChild(spreadText);
    ex += spreadText.width;

    return ex;
  }

  const amt = (effect as BaseCardEffect).amount;
  const icon = createEffectIcon(effect.kind, iconSize);
  let ex = startX;
  if (!icon) {
    const style = { fill: 0x9ca3af, fontSize };
    const t = new Text({ text: `${effect.kind}: ${amt}`, style });
    t.x = ex; t.y = rowY; t.eventMode = 'none';
    app.stage.addChild(t);
    ex += t.width;
  } else {
    icon.x = ex; icon.y = rowY;
    app.stage.addChild(icon);
    ex += iconSize + 1;
    const numText = new Text({
      text: `${amt}`,
      style: { fill: effectColor(effect.kind), fontSize, fontWeight: 'bold' }
    });
    numText.x = ex; numText.y = rowY; numText.eventMode = 'none';
    app.stage.addChild(numText);
    ex += numText.width;
  }
  return ex;
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

/**
 * Render the current player's hand
 */
export function renderHand(app: Application, gameState: GameState): void {
  const currentPlayer = gameState.characters.find(c => c.id === gameState.currentPlayerId);
  if (!currentPlayer) return;

  if (currentPlayer.isPlayer) {
    renderPlayerHand(app, gameState, currentPlayer);
  } else {
    renderEnemyHand(app, gameState, currentPlayer);
  }
}

// ---------------------------------------------------------------------------
// Player hand
// ---------------------------------------------------------------------------

function renderPlayerHand(app: Application, _gameState: GameState, currentPlayer: Character): void {
  const cards = currentPlayer.hand;
  const cardW = 125;
  const cardH = 155;
  const spacing = 8;
  const totalW = cards.length * cardW + Math.max(0, cards.length - 1) * spacing;
  const startX = (WIDTH - totalW) / 2;
  const y = 10;

  /** Draw a thin semi-transparent divider across the card. */
  const drawDivider = (x: number, dy: number) => {
    const line = new Graphics();
    line.moveTo(0, 0).lineTo(cardW - 20, 0);
    line.stroke({ width: 1, color: 0x374151 });
    line.alpha = 0.5;
    line.x = x + 10; line.y = dy;
    line.eventMode = 'none';
    app.stage.addChild(line);
  };

  cards.forEach((cardId, i) => {
    const card = getCard(cardId);
    if (!card) return;

    const x = startX + i * (cardW + spacing);
    const selectedCardId = getSelectedCardId();
    const isSelected = selectedCardId === cardId;
    const suppressionPenalty = getSuppressionCostPenalty(currentPlayer, card);
    const totalCost = card.cost.energy + suppressionPenalty;
    const canAfford = currentPlayer.energy >= totalCost;

    // Card background
    const bg = new Graphics();
    bg.roundRect(0, 0, cardW, cardH, 8);
    bg.fill(0x1f2937);
    bg.stroke({
      width: isSelected ? 3 : 1,
      color: isSelected ? 0x22c55e : 0x374151
    });
    if (!canAfford) bg.alpha = 0.5;
    bg.x = x; bg.y = y;
    bg.eventMode = 'static'; bg.cursor = 'pointer';
    bg.hitArea = new Rectangle(0, 0, cardW, cardH);
    bg.on('pointerdown', async () => {
      if (isSelected && card.targeting === 'self') {
        await playCard(cardId, undefined, renderCallback);
        setSelectedCardId(null);
      } else {
        setSelectedCardId(isSelected ? null : cardId);
        renderCallback();
      }
    });
    app.stage.addChild(bg);

    // ── Header zone (y+8) ──
    const name = new Text({
      text: card.name,
      style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' }
    });
    name.x = x + 10; name.y = y + 8; name.eventMode = 'none';
    app.stage.addChild(name);

    // Rarity indicator (top-right) — interactive for tooltip
    if (card.rarity) {
      const ri = createRarityIcon(card.rarity, 8);
      const riX = x + cardW - 15;
      const riY = y + 8;
      ri.x = riX; ri.y = riY;
      ri.eventMode = 'static';
      ri.cursor = 'help';
      ri.hitArea = new Rectangle(-8, -8, 24, 24);
      const templateId = card.id;
      ri.on('pointerenter', () => {
        if (setHoveredCard(templateId, riX, riY + 16)) renderCallback();
      });
      ri.on('pointerleave', () => {
        if (setHoveredCard(null)) renderCallback();
      });
      app.stage.addChild(ri);
    }

    // ── Divider (y+26) ──
    drawDivider(x, y + 26);

    // ── Cost zone (y+30): [energy icon] N ──
    const energyCost = card.cost.energy;
    const energyIconSize = 12;
    let costX = x + 10;
    {
      const ei = createEnergyIcon(energyIconSize);
      ei.x = costX; ei.y = y + 30;
      app.stage.addChild(ei);
      costX += energyIconSize + 2;

      if (suppressionPenalty > 0) {
        const ct = new Text({
          text: `${totalCost}`,
          style: { fill: 0xfb923c, fontSize: 12, fontWeight: 'bold' }
        });
        ct.x = costX; ct.y = y + 30; ct.eventMode = 'none';
        app.stage.addChild(ct);
        costX += ct.width + 3;
        const origCt = new Text({
          text: `(${energyCost})`,
          style: { fill: 0x6b7280, fontSize: 9 }
        });
        origCt.x = costX; origCt.y = y + 32; origCt.eventMode = 'none';
        app.stage.addChild(origCt);
      } else {
        const ct = new Text({
          text: `${energyCost}`,
          style: { fill: 0x38bdf8, fontSize: 12, fontWeight: 'bold' }
        });
        ct.x = costX; ct.y = y + 30; ct.eventMode = 'none';
        app.stage.addChild(ct);
      }
    }

    // ── Divider (y+46) ──
    drawDivider(x, y + 46);

    // ── Effects zone (y+50): one effect per line, grouped by target ──
    const groups = groupEffects(card);
    const effectIconSize = 12;
    const rowHeight = 17;
    const groupGap = 6; // extra vertical space between target groups
    let curY = y + 50;
    let groupIdx = 0;

    const reachableSlots = card.maxRange ? Math.min(card.maxRange, MAX_INDICATOR_SLOTS) : undefined;

    for (const [key, effects] of groups) {
      const lbl = labelForKey(key);
      let indicatorWidth = 0;
      const renderableEffects = effects.filter(e => e.kind !== 'modifier' && e.kind !== 'deck_inject');
      if (renderableEffects.length === 0) continue;

      // Divider between target groups (not before the first)
      if (groupIdx > 0) {
        const divG = new Graphics();
        divG.moveTo(0, 0).lineTo(cardW - 20, 0);
        divG.stroke({ width: 1, color: 0x4b5563 });
        divG.alpha = 0.35;
        divG.x = x + 10; divG.y = curY + 1;
        divG.eventMode = 'none';
        app.stage.addChild(divG);
        curY += groupGap;
      }

      for (let ei = 0; ei < renderableEffects.length; ei++) {
        let ex = x + 10;

        if (ei === 0 && lbl.usePositionIndicator) {
          const aoeTargetSide = key.startsWith('aoe_') ? (card.targetSide === 'ally' ? 'ally' : 'enemy') : undefined;
          const noEmptySlots = key === 'self' || key.startsWith('aoe_');
          const rangeForIndicator = key !== 'self' ? reachableSlots : undefined;
          indicatorWidth = renderPositionIndicator(app, ex, curY, lbl.filledCount, lbl.targetType, effectIconSize, aoeTargetSide, noEmptySlots, rangeForIndicator);
          ex += indicatorWidth + 3;
        } else if (lbl.usePositionIndicator) {
          ex += indicatorWidth + 3;
        }

        renderSingleEffect(app, renderableEffects[ei], ex, curY, effectIconSize, 11);
        curY += rowHeight;
      }
      groupIdx++;
    }

    // ── Divider before footer (y+cardH-22) ──
    drawDivider(x, y + cardH - 22);

    // ── Footer zone (y+cardH-18) ──

    // Exhaust flame (bottom-left)
    if (card.exhaust) {
      const flame = createExhaustIcon(12);
      flame.x = x + 8; flame.y = y + cardH - 17;
      app.stage.addChild(flame);
    }

    // Range indicator (bottom-right) - crosshair icon + range text
    if (card.maxRange || card.minRange || card.optimalRange !== undefined) {
      const rangeIconSize = 11;
      const rIcon = createRangeIcon(rangeIconSize);
      rIcon.x = x + cardW - 50; rIcon.y = y + cardH - 17;
      app.stage.addChild(rIcon);

      let rangeLabel: string;
      if (card.minRange && card.maxRange) {
        rangeLabel = `${card.minRange}-${card.maxRange}`;
      } else if (card.optimalRange !== undefined && card.maxRange) {
        rangeLabel = `${card.optimalRange}/${card.maxRange}`;
      } else if (card.maxRange) {
        rangeLabel = `≤${card.maxRange}`;
      } else if (card.minRange) {
        rangeLabel = `≥${card.minRange}`;
      } else {
        rangeLabel = `★${card.optimalRange}`;
      }

      const rangeTxt = new Text({
        text: rangeLabel,
        style: { fill: 0x06b6d4, fontSize: 10, fontWeight: 'bold' }
      });
      rangeTxt.x = x + cardW - 50 + rangeIconSize + 3;
      rangeTxt.y = y + cardH - 16;
      rangeTxt.eventMode = 'none';
      app.stage.addChild(rangeTxt);
    }
  });
}

// ---------------------------------------------------------------------------
// Enemy hand
// ---------------------------------------------------------------------------

function renderEnemyHand(app: Application, _gameState: GameState, currentPlayer: Character): void {
  const cards = currentPlayer.hand;
  const cardW = 105;
  const cardH = 120;
  const spacing = 6;
  const totalW = cards.length * cardW + Math.max(0, cards.length - 1) * spacing;
  const startX = (WIDTH - totalW) / 2;
  const y = 10;

  // Enemy hand label
  const label = new Text({
    text: `${currentPlayer.name}'s Hand:`,
    style: { fill: 0xff6b6b, fontSize: 14, fontWeight: 'bold' }
  });
  label.x = startX; label.y = y - 20; label.eventMode = 'none';
  app.stage.addChild(label);

  /** Draw a thin semi-transparent divider across the enemy card. */
  const drawDivider = (x: number, dy: number) => {
    const line = new Graphics();
    line.moveTo(0, 0).lineTo(cardW - 16, 0);
    line.stroke({ width: 1, color: 0x374151 });
    line.alpha = 0.5;
    line.x = x + 8; line.y = dy;
    line.eventMode = 'none';
    app.stage.addChild(line);
  };

  cards.forEach((cardId, i) => {
    const card = getCard(cardId);
    if (!card) return;

    const x = startX + i * (cardW + spacing);
    const enemySuppPenalty = getSuppressionCostPenalty(currentPlayer, card);
    const enemyTotalCost = card.cost.energy + enemySuppPenalty;
    const canAfford = currentPlayer.energy >= enemyTotalCost;

    // Card background
    const bg = new Graphics();
    bg.roundRect(0, 0, cardW, cardH, 6);
    bg.fill(0x1f2937);
    bg.stroke({ width: 1, color: 0x991b1b });
    if (!canAfford) bg.alpha = 0.5;
    bg.x = x; bg.y = y;
    app.stage.addChild(bg);

    // ── Header zone (y+6) ──
    const name = new Text({
      text: card.name,
      style: { fill: 0xffffff, fontSize: 11, fontWeight: 'bold' }
    });
    name.x = x + 8; name.y = y + 6; name.eventMode = 'none';
    app.stage.addChild(name);

    // Rarity indicator (top-right)
    if (card.rarity) {
      const ri = createRarityIcon(card.rarity, 6);
      const riX = x + cardW - 12;
      const riY = y + 6;
      ri.x = riX; ri.y = riY;
      ri.eventMode = 'static';
      ri.cursor = 'help';
      ri.hitArea = new Rectangle(-6, -6, 20, 20);
      const templateId = card.id;
      ri.on('pointerenter', () => {
        if (setHoveredCard(templateId, riX, riY + 14)) renderCallback();
      });
      ri.on('pointerleave', () => {
        if (setHoveredCard(null)) renderCallback();
      });
      app.stage.addChild(ri);
    }

    // ── Divider (y+20) ──
    drawDivider(x, y + 20);

    // ── Cost zone (y+24): [energy icon] N ──
    const energyCost = card.cost.energy;
    const energyIconSize = 9;
    let costX = x + 8;
    {
      const ei = createEnergyIcon(energyIconSize);
      ei.x = costX; ei.y = y + 24;
      app.stage.addChild(ei);
      costX += energyIconSize + 2;

      if (enemySuppPenalty > 0) {
        const ct = new Text({
          text: `${enemyTotalCost}`,
          style: { fill: 0xfb923c, fontSize: 10, fontWeight: 'bold' }
        });
        ct.x = costX; ct.y = y + 24; ct.eventMode = 'none';
        app.stage.addChild(ct);
      } else {
        const ct = new Text({
          text: `${energyCost}`,
          style: { fill: 0x38bdf8, fontSize: 10, fontWeight: 'bold' }
        });
        ct.x = costX; ct.y = y + 24; ct.eventMode = 'none';
        app.stage.addChild(ct);
      }
    }

    // ── Divider (y+37) ──
    drawDivider(x, y + 37);

    // ── Effects zone (y+40): one effect per line, grouped by target ──
    const groups = groupEffects(card);
    const effectIconSize = 9;
    const rowHeight = 14;
    const groupGap = 5;
    let curY = y + 40;
    let groupIdx = 0;

    const reachableSlots = card.maxRange ? Math.min(card.maxRange, MAX_INDICATOR_SLOTS) : undefined;

    for (const [key, effects] of groups) {
      const lbl = labelForKey(key);
      let indicatorWidth = 0;
      const renderableEffects = effects.filter(e => e.kind !== 'modifier' && e.kind !== 'deck_inject');
      if (renderableEffects.length === 0) continue;

      // Divider between target groups (not before the first)
      if (groupIdx > 0) {
        const divG = new Graphics();
        divG.moveTo(0, 0).lineTo(cardW - 16, 0);
        divG.stroke({ width: 1, color: 0x4b5563 });
        divG.alpha = 0.35;
        divG.x = x + 8; divG.y = curY + 1;
        divG.eventMode = 'none';
        app.stage.addChild(divG);
        curY += groupGap;
      }

      for (let ei = 0; ei < renderableEffects.length; ei++) {
        let ex = x + 8;

        if (ei === 0 && lbl.usePositionIndicator) {
          const aoeTargetSide = key.startsWith('aoe_') ? (card.targetSide === 'ally' ? 'ally' : 'enemy') : undefined;
          const noEmptySlots = key === 'self' || key.startsWith('aoe_');
          const rangeForIndicator = key !== 'self' ? reachableSlots : undefined;
          indicatorWidth = renderPositionIndicator(app, ex, curY, lbl.filledCount, lbl.targetType, effectIconSize, aoeTargetSide, noEmptySlots, rangeForIndicator);
          ex += indicatorWidth + 2;
        } else if (lbl.usePositionIndicator) {
          ex += indicatorWidth + 2;
        }

        renderSingleEffect(app, renderableEffects[ei], ex, curY, effectIconSize, 9);
        curY += rowHeight;
      }
      groupIdx++;
    }

    // ── Divider before footer (y+cardH-18) ──
    drawDivider(x, y + cardH - 18);

    // ── Footer zone ──

    // Exhaust flame (bottom-left)
    if (card.exhaust) {
      const flame = createExhaustIcon(9);
      flame.x = x + 6; flame.y = y + cardH - 14;
      app.stage.addChild(flame);
    }

    // Range indicator (bottom-right) - crosshair icon + range
    if (card.maxRange || card.minRange || card.optimalRange !== undefined) {
      const rangeIconSize = 8;
      const rIcon = createRangeIcon(rangeIconSize);
      rIcon.x = x + cardW - 40; rIcon.y = y + cardH - 14;
      app.stage.addChild(rIcon);

      let rangeLabel: string;
      if (card.minRange && card.maxRange) {
        rangeLabel = `${card.minRange}-${card.maxRange}`;
      } else if (card.optimalRange !== undefined && card.maxRange) {
        rangeLabel = `${card.optimalRange}/${card.maxRange}`;
      } else if (card.maxRange) {
        rangeLabel = `≤${card.maxRange}`;
      } else if (card.minRange) {
        rangeLabel = `≥${card.minRange}`;
      } else {
        rangeLabel = `★${card.optimalRange}`;
      }

      const rangeTxt = new Text({
        text: rangeLabel,
        style: { fill: 0x06b6d4, fontSize: 8, fontWeight: 'bold' }
      });
      rangeTxt.x = x + cardW - 40 + rangeIconSize + 2;
      rangeTxt.y = y + cardH - 13;
      rangeTxt.eventMode = 'none';
      app.stage.addChild(rangeTxt);
    }
  });
}
