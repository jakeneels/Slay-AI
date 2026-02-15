// Hand rendering (player and enemy hands)

import type { Application } from 'pixi.js';
import { Graphics, Text, Rectangle } from 'pixi.js';
import type { GameState, Character, Card, CardEffect, BaseCardEffect } from '../core/types.js';
import { WIDTH, SLOTS_PER_SIDE } from '../core/constants.js';
import { getCard } from '../core/card.js';
import { getSelectedCardId, setSelectedCardId } from '../core/gameState.js';
import { render as renderCallback } from './renderer.js';
import { playCard } from '../core/combat.js';
import { createEnergyIcon } from './icons/energyIcon.js';
import { createDamageIcon } from './icons/damageIcon.js';
import { createSpeedIcon } from './icons/speedIcon.js';
import { createHealIcon } from './icons/healIcon.js';
import { createRarityIcon } from './icons/rarityIcon.js';
import { createExhaustIcon } from './icons/exhaustIcon.js';
import { createShieldIcon } from './icons/shieldIcon.js';
import { createRangeIcon } from './icons/rangeIcon.js';
import { calculateRangeModifier } from '../core/constants.js';

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
  if (key === 'allEnemies') return { usePositionIndicator: true, targetType: 'enemy', filledCount: 4 };
  if (key === 'allAllies') return { usePositionIndicator: true, targetType: 'ally', filledCount: 4 };
  if (key.startsWith('aoe_')) {
    const slots = Math.min(4, Math.max(1, parseInt(key.split('_')[1], 10) || 3));
    return { usePositionIndicator: true, targetType: 'enemy', filledCount: slots };
  }
  return { usePositionIndicator: false, targetType: 'enemy', filledCount: 0 };
}

/** Darkest Dungeon-style position indicator. Self and AOE: only filled circles. Enemy/Ally single: 4 slots with empties.
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
  /** How many slots from frontline are in range (1-4). Undefined = all in range. */
  reachableSlots?: number
): number {
  const effectiveType: TargetType = aoeTargetSide ?? targetType;
  const fillColor = effectiveType === 'enemy' ? 0xff6b6b : effectiveType === 'ally' ? 0x4ade80 : 0x60a5fa;
  const strokeColor = effectiveType === 'enemy' ? 0xb91c1c : effectiveType === 'ally' ? 0x166534 : 0x1d4ed8;
  const gap = 2;

  // If range is limited, always show all 4 slots so the range restriction is visible
  const hasRangeLimit = reachableSlots !== undefined && reachableSlots < SLOTS_PER_SIDE;
  const totalSlots = (noEmptySlots && !hasRangeLimit) ? filledCount : 4;
  const maxReachable = reachableSlots ?? totalSlots;

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
    default: return null;
  }
}

/** Render a single row of effect icons (shared between player/enemy). Returns x-advance. */
function renderEffectRow(
  app: Application,
  effects: CardEffect[],
  startX: number,
  rowY: number,
  iconSize: number,
  iconGap: number,
  blockGap: number,
  fontSize: number,
): number {
  let ex = startX;
  for (const effect of effects) {
    if (effect.kind === 'modifier' || effect.kind === 'deck_inject') continue;
    const amt = (effect as BaseCardEffect).amount;
    const icon = createEffectIcon(effect.kind, iconSize);
    if (!icon) {
      // Fallback: text-only for unsupported kinds
      const style = { fill: 0x9ca3af, fontSize };
      const t = new Text({ text: `${effect.kind}: ${amt}`, style });
      t.x = ex; t.y = rowY; t.eventMode = 'none';
      app.stage.addChild(t);
      ex += t.width;
    } else if (amt <= 5) {
      for (let i = 0; i < amt; i++) {
        const ic = i === 0 ? icon : createEffectIcon(effect.kind, iconSize)!;
        ic.x = ex; ic.y = rowY;
        app.stage.addChild(ic);
        ex += iconSize + iconGap;
      }
    } else {
      const numText = new Text({
        text: `${amt} ×`,
        style: { fill: 0xd1d5db, fontSize, fontWeight: 'bold' }
      });
      numText.x = ex; numText.y = rowY; numText.eventMode = 'none';
      app.stage.addChild(numText);
      ex += numText.width + 4;
      icon.x = ex; icon.y = rowY;
      app.stage.addChild(icon);
      ex += iconSize;
    }
    ex += blockGap;
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
  const cardW = 140;
  const cardH = 100; // taller to fit grouped rows
  const spacing = 10;
  const totalW = cards.length * cardW + Math.max(0, cards.length - 1) * spacing;
  const startX = (WIDTH - totalW) / 2;
  const y = 60;

  cards.forEach((cardId, i) => {
    const card = getCard(cardId);
    if (!card) return;

    const x = startX + i * (cardW + spacing);
    const selectedCardId = getSelectedCardId();
    const isSelected = selectedCardId === cardId;
    const canAfford = currentPlayer.energy >= card.cost.energy;

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

    // Card name
    const name = new Text({
      text: card.name,
      style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' }
    });
    name.x = x + 10; name.y = y + 10; name.eventMode = 'none';
    app.stage.addChild(name);

    // Cost row (energy icons)
    const energyCost = card.cost.energy;
    const energyIconSize = 14;
    const energyIconGap = 3;
    let costX = x + 10;
    if (energyCost <= 5) {
      for (let j = 0; j < energyCost; j++) {
        const ei = createEnergyIcon(energyIconSize);
        ei.x = costX; ei.y = y + 27;
        app.stage.addChild(ei);
        costX += energyIconSize + energyIconGap;
      }
    } else {
      const ct = new Text({
        text: `${energyCost} ×`,
        style: { fill: 0x60a5fa, fontSize: 12, fontWeight: 'bold' }
      });
      ct.x = costX; ct.y = y + 28; ct.eventMode = 'none';
      app.stage.addChild(ct);
      costX += ct.width + 4;
      const ei = createEnergyIcon(energyIconSize);
      ei.x = costX; ei.y = y + 27;
      app.stage.addChild(ei);
    }

    // Grouped effect rows
    const groups = groupEffects(card);
    const effectIconSize = 12;
    const effectIconGap = 2;
    const effectBlockGap = 6;
    const rowHeight = 14;
    let rowIdx = 0;

    // Calculate reachable slots from card's maxRange (best-case from frontline)
    const reachableSlots = card.maxRange ? Math.min(card.maxRange, SLOTS_PER_SIDE) : undefined;

    for (const [key, effects] of groups) {
      const rowY = y + 46 + rowIdx * rowHeight;
      let ex = x + 10;

      const lbl = labelForKey(key);
      if (lbl.usePositionIndicator) {
        const aoeTargetSide = key.startsWith('aoe_') ? (card.targetSide === 'ally' ? 'ally' : 'enemy') : undefined;
        const noEmptySlots = key === 'self' || key.startsWith('aoe_');
        // Pass reachableSlots for enemy/ally targeting (not for self)
        const rangeForIndicator = key !== 'self' ? reachableSlots : undefined;
        ex += renderPositionIndicator(app, ex, rowY, lbl.filledCount, lbl.targetType, effectIconSize, aoeTargetSide, noEmptySlots, rangeForIndicator) + 4;
      }

      renderEffectRow(app, effects, ex, rowY, effectIconSize, effectIconGap, effectBlockGap, effectIconSize);
      rowIdx++;
    }

    // Rarity indicator (top-right)
    if (card.rarity) {
      const ri = createRarityIcon(card.rarity, 8);
      ri.x = x + cardW - 15; ri.y = y + 8;
      app.stage.addChild(ri);
    }

    // Exhaust flame (bottom-left)
    if (card.exhaust) {
      const flame = createExhaustIcon(12);
      flame.x = x + 6; flame.y = y + cardH - 16;
      app.stage.addChild(flame);
    }

    // Range indicator (bottom-right) - shows crosshair icon + range text
    if (card.maxRange || card.optimalRange !== undefined) {
      const rangeIconSize = 11;
      const rIcon = createRangeIcon(rangeIconSize);
      rIcon.x = x + cardW - 50; rIcon.y = y + cardH - 15;
      app.stage.addChild(rIcon);

      // Build range label: "opt / max" or just "max"
      let rangeLabel: string;
      if (card.optimalRange !== undefined && card.maxRange) {
        rangeLabel = `${card.optimalRange}/${card.maxRange}`;
      } else if (card.maxRange) {
        rangeLabel = `≤${card.maxRange}`;
      } else {
        rangeLabel = `★${card.optimalRange}`;
      }

      const rangeTxt = new Text({
        text: rangeLabel,
        style: { fill: 0x06b6d4, fontSize: 10, fontWeight: 'bold' }
      });
      rangeTxt.x = x + cardW - 50 + rangeIconSize + 3;
      rangeTxt.y = y + cardH - 14;
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
  const cardW = 120;
  const cardH = 75; // taller to fit grouped rows
  const spacing = 8;
  const totalW = cards.length * cardW + Math.max(0, cards.length - 1) * spacing;
  const startX = (WIDTH - totalW) / 2;
  const y = 60;

  // Enemy hand label
  const label = new Text({
    text: `${currentPlayer.name}'s Hand:`,
    style: { fill: 0xff6b6b, fontSize: 14, fontWeight: 'bold' }
  });
  label.x = startX; label.y = y - 20; label.eventMode = 'none';
  app.stage.addChild(label);

  cards.forEach((cardId, i) => {
    const card = getCard(cardId);
    if (!card) return;

    const x = startX + i * (cardW + spacing);
    const canAfford = currentPlayer.energy >= card.cost.energy;

    // Card background
    const bg = new Graphics();
    bg.roundRect(0, 0, cardW, cardH, 6);
    bg.fill(0x1f2937);
    bg.stroke({ width: 1, color: 0x991b1b });
    if (!canAfford) bg.alpha = 0.5;
    bg.x = x; bg.y = y;
    app.stage.addChild(bg);

    // Card name
    const name = new Text({
      text: card.name,
      style: { fill: 0xffffff, fontSize: 11, fontWeight: 'bold' }
    });
    name.x = x + 8; name.y = y + 8; name.eventMode = 'none';
    app.stage.addChild(name);

    // Cost row (energy icons)
    const energyCost = card.cost.energy;
    const energyIconSize = 10;
    const energyIconGap = 2;
    let costX = x + 8;
    if (energyCost <= 5) {
      for (let j = 0; j < energyCost; j++) {
        const ei = createEnergyIcon(energyIconSize);
        ei.x = costX; ei.y = y + 22;
        app.stage.addChild(ei);
        costX += energyIconSize + energyIconGap;
      }
    } else {
      const ct = new Text({
        text: `${energyCost} ×`,
        style: { fill: 0x60a5fa, fontSize: 10, fontWeight: 'bold' }
      });
      ct.x = costX; ct.y = y + 23; ct.eventMode = 'none';
      app.stage.addChild(ct);
      costX += ct.width + 3;
      const ei = createEnergyIcon(energyIconSize);
      ei.x = costX; ei.y = y + 22;
      app.stage.addChild(ei);
    }

    // Grouped effect rows
    const groups = groupEffects(card);
    const effectIconSize = 9;
    const effectIconGap = 1;
    const effectBlockGap = 4;
    const rowHeight = 12;
    let rowIdx = 0;

    // Calculate reachable slots from card's maxRange (best-case from frontline)
    const reachableSlots = card.maxRange ? Math.min(card.maxRange, SLOTS_PER_SIDE) : undefined;

    for (const [key, effects] of groups) {
      const rowY = y + 36 + rowIdx * rowHeight;
      let ex = x + 8;

      const lbl = labelForKey(key);
      if (lbl.usePositionIndicator) {
        const aoeTargetSide = key.startsWith('aoe_') ? (card.targetSide === 'ally' ? 'ally' : 'enemy') : undefined;
        const noEmptySlots = key === 'self' || key.startsWith('aoe_');
        const rangeForIndicator = key !== 'self' ? reachableSlots : undefined;
        ex += renderPositionIndicator(app, ex, rowY, lbl.filledCount, lbl.targetType, effectIconSize, aoeTargetSide, noEmptySlots, rangeForIndicator) + 3;
      }

      renderEffectRow(app, effects, ex, rowY, effectIconSize, effectIconGap, effectBlockGap, effectIconSize);
      rowIdx++;
    }

    // Rarity indicator (top-right)
    if (card.rarity) {
      const ri = createRarityIcon(card.rarity, 6);
      ri.x = x + cardW - 12; ri.y = y + 6;
      app.stage.addChild(ri);
    }

    // Exhaust flame (bottom-left)
    if (card.exhaust) {
      const flame = createExhaustIcon(9);
      flame.x = x + 5; flame.y = y + cardH - 13;
      app.stage.addChild(flame);
    }

    // Range indicator (bottom-right) - crosshair icon + range
    if (card.maxRange || card.optimalRange !== undefined) {
      const rangeIconSize = 8;
      const rIcon = createRangeIcon(rangeIconSize);
      rIcon.x = x + cardW - 40; rIcon.y = y + cardH - 12;
      app.stage.addChild(rIcon);

      let rangeLabel: string;
      if (card.optimalRange !== undefined && card.maxRange) {
        rangeLabel = `${card.optimalRange}/${card.maxRange}`;
      } else if (card.maxRange) {
        rangeLabel = `≤${card.maxRange}`;
      } else {
        rangeLabel = `★${card.optimalRange}`;
      }

      const rangeTxt = new Text({
        text: rangeLabel,
        style: { fill: 0x06b6d4, fontSize: 8, fontWeight: 'bold' }
      });
      rangeTxt.x = x + cardW - 40 + rangeIconSize + 2;
      rangeTxt.y = y + cardH - 11;
      rangeTxt.eventMode = 'none';
      app.stage.addChild(rangeTxt);
    }
  });
}
