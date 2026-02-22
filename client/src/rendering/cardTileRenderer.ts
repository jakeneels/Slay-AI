import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type {
  BaseCardEffect,
  Card,
  CardEffect,
  Character,
  StatusEffect,
  StatusModifyEffect,
  StatusSpreadEffect,
  LaneHazardEffect,
  ThornsEffect,
} from '../core/types.js';
import { resolveDisplayAmount } from '../utils/displayAmountResolver.js';
import { createEnergyIcon } from './icons/energyIcon.js';
import { createDamageIcon } from './icons/damageIcon.js';
import { createSpeedIcon } from './icons/speedIcon.js';
import { createKnockbackIcon } from './icons/knockbackIcon.js';
import { createHealIcon } from './icons/healIcon.js';
import { createRarityIcon } from './icons/rarityIcon.js';
import { createExhaustIcon } from './icons/exhaustIcon.js';
import { createShieldIcon } from './icons/shieldIcon.js';
import { createRangeIcon } from './icons/rangeIcon.js';
import { createLaneHazardIcon } from './icons/laneHazardIcon.js';
import { createThornsIcon } from './icons/thornsIcon.js';
import { getStatusDisplay } from './statusConfig.js';
import { registerCardHoverRegion } from './tooltipState.js';

/** Max slots shown on card position indicators (largest AOE in the game). */
const MAX_INDICATOR_SLOTS = 6;
const DEFAULT_TITLE_SIZE = 13;
const MIN_TITLE_SIZE = 11;

type TargetType = 'enemy' | 'ally' | 'self';

export interface RenderCardTileOptions {
  selected?: boolean;
  dimmed?: boolean;
  interactive?: boolean;
  suppressionPenalty?: number;
  caster?: Character;
  onClick?: () => void;
  onRarityHover?: (cardId: string | null, anchorX?: number, anchorY?: number) => void;
}

/** Resolve a display key for an effect, combining effectTarget + card targeting. */
function resolveDisplayKey(effect: CardEffect, card: Card): string {
  if (effect.kind === 'modifier' || effect.kind === 'deck_inject') return 'other';
  const et = (effect as BaseCardEffect).effectTarget;
  if (!et || et === 'target') {
    switch (card.targeting) {
      case 'self': return 'self';
      case 'ally': return 'ally';
      case 'aoe': return `aoe_${card.aoeSlots ?? 3}`;
      case 'allEnemies': return 'allEnemies';
      case 'allAllies': return 'allAllies';
      case 'slot': return 'slot';
      default: return 'enemy';
    }
  }
  if (et === 'aoe') {
    const slots = (effect as BaseCardEffect).aoeSlots ?? card.aoeSlots ?? 3;
    return `aoe_${slots}`;
  }
  return et;
}

/** Resolve display key to position indicator config. */
function labelForKey(key: string): { usePositionIndicator: boolean; targetType: TargetType; filledCount: number } {
  if (key === 'self') return { usePositionIndicator: true, targetType: 'self', filledCount: 1 };
  if (key === 'ally') return { usePositionIndicator: true, targetType: 'ally', filledCount: 1 };
  if (key === 'enemy') return { usePositionIndicator: true, targetType: 'enemy', filledCount: 1 };
  if (key === 'slot') return { usePositionIndicator: true, targetType: 'enemy', filledCount: MAX_INDICATOR_SLOTS };
  if (key === 'allEnemies') return { usePositionIndicator: true, targetType: 'enemy', filledCount: MAX_INDICATOR_SLOTS };
  if (key === 'allAllies') return { usePositionIndicator: true, targetType: 'ally', filledCount: MAX_INDICATOR_SLOTS };
  if (key.startsWith('aoe_')) {
    const slots = Math.min(MAX_INDICATOR_SLOTS, Math.max(1, parseInt(key.split('_')[1], 10) || 3));
    return { usePositionIndicator: true, targetType: 'enemy', filledCount: slots };
  }
  return { usePositionIndicator: false, targetType: 'enemy', filledCount: 0 };
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
    case 'damage':
    case 'aoe_damage':
      return createDamageIcon(size);
    case 'heal':
      return createHealIcon(size);
    case 'speed':
      return createSpeedIcon(size);
    case 'energy':
      return createEnergyIcon(size);
    case 'grant_block_layer':
      return createShieldIcon(size);
    case 'knockback':
      return createKnockbackIcon(size);
    case 'jump':
      return createSpeedIcon(size);
    case 'lane_hazard':
      return createLaneHazardIcon(size);
    case 'thorns':
      return createThornsIcon(size);
    default:
      return null;
  }
}

/** Map effect kind to a color matching its icon for color-coded numbers. */
function effectColor(kind: string): number {
  switch (kind) {
    case 'damage':
    case 'aoe_damage':
      return 0xef4444;
    case 'heal':
      return 0x4ade80;
    case 'speed':
      return 0x2dd4bf;
    case 'energy':
      return 0x38bdf8;
    case 'grant_block_layer':
      return 0x60a5fa;
    case 'knockback':
      return 0xef4444;
    case 'jump':
      return 0x8b5cf6;
    case 'lane_hazard':
      return 0xf97316;
    case 'thorns':
      return 0xf59e0b;
    default:
      return 0xd1d5db;
  }
}

function renderPositionIndicator(
  parent: Container,
  x: number,
  y: number,
  filledCount: number,
  targetType: TargetType,
  circleSize: number,
  aoeTargetSide?: 'enemy' | 'ally',
  noEmptySlots?: boolean,
  reachableSlots?: number,
): number {
  const effectiveType: TargetType = aoeTargetSide ?? targetType;
  const fillColor = effectiveType === 'enemy' ? 0xff6b6b : effectiveType === 'ally' ? 0x4ade80 : 0x60a5fa;
  const strokeColor = effectiveType === 'enemy' ? 0xb91c1c : effectiveType === 'ally' ? 0x166534 : 0x1d4ed8;
  const gap = 2;

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
      g.fill(0x1a1a1a);
      g.stroke({ width: 1, color: 0x3a1a1a });
    } else if (filled) {
      g.fill(fillColor);
      g.stroke({ width: 1, color: strokeColor });
    } else {
      g.fill(0x374151);
      g.stroke({ width: 1, color: 0x4b5563 });
    }
  }
  g.x = x;
  g.y = y;
  g.eventMode = 'none';
  parent.addChild(g);
  return totalW;
}

function renderSingleEffect(
  parent: Container,
  effect: CardEffect,
  startX: number,
  rowY: number,
  iconSize: number,
  fontSize: number,
  card: Card,
  caster: Character | undefined,
): number {
  if (effect.kind === 'modifier' || effect.kind === 'deck_inject') return startX;

  if (effect.kind === 'status') {
    const se = effect as StatusEffect;
    const stacks = se.stacks ?? 1;
    const statusDisplay = getStatusDisplay(se.status);
    let ex = startX;

    if (statusDisplay && statusDisplay.drawIcons.length > 0) {
      const iconG = new Graphics();
      statusDisplay.drawIcons[0](iconG, iconSize);
      iconG.x = ex;
      iconG.y = rowY;
      iconG.eventMode = 'none';
      parent.addChild(iconG);
      ex += iconSize + 2;
    }

    const color = statusDisplay?.iconColor ?? 0x9ca3af;
    const stackText = new Text({
      text: `${stacks}`,
      style: { fill: color, fontSize, fontWeight: 'bold' },
    });
    stackText.x = ex;
    stackText.y = rowY;
    stackText.eventMode = 'none';
    parent.addChild(stackText);
    ex += stackText.width;

    return ex;
  }

  if (effect.kind === 'status_modify') {
    const sm = effect as StatusModifyEffect;
    const statusDisplay = getStatusDisplay(sm.status);
    let ex = startX;

    if (statusDisplay && statusDisplay.drawIcons.length > 0) {
      const iconG = new Graphics();
      statusDisplay.drawIcons[0](iconG, iconSize);
      iconG.x = ex;
      iconG.y = rowY;
      iconG.eventMode = 'none';
      parent.addChild(iconG);
      ex += iconSize + 2;
    }

    const color = statusDisplay?.iconColor ?? 0x9ca3af;
    let opLabel: string;
    switch (sm.op) {
      case 'multiply':
        opLabel = `x${sm.amount}`;
        break;
      case 'add':
        opLabel = sm.amount >= 0 ? `+${sm.amount}` : `${sm.amount}`;
        break;
      case 'set':
        opLabel = `=${sm.amount}`;
        break;
    }
    const opText = new Text({
      text: opLabel,
      style: { fill: color, fontSize, fontWeight: 'bold' },
    });
    opText.x = ex;
    opText.y = rowY;
    opText.eventMode = 'none';
    parent.addChild(opText);
    ex += opText.width;

    return ex;
  }

  if (effect.kind === 'lane_hazard') {
    const lh = effect as LaneHazardEffect;
    const icon = createEffectIcon('lane_hazard', iconSize);
    let ex = startX;
    if (icon) {
      icon.x = ex;
      icon.y = rowY;
      parent.addChild(icon);
      ex += iconSize + 1;
      const text = new Text({
        text: `${lh.damage}×${lh.duration_turns}t`,
        style: { fill: effectColor('lane_hazard'), fontSize, fontWeight: 'bold' },
      });
      text.x = ex;
      text.y = rowY;
      text.eventMode = 'none';
      parent.addChild(text);
      ex += text.width;
    }
    return ex;
  }

  if (effect.kind === 'thorns') {
    const th = effect as ThornsEffect;
    const stacks = Math.max(1, Math.floor(th.stacks ?? 1));
    const icon = createEffectIcon('thorns', iconSize);
    let ex = startX;
    if (icon) {
      icon.x = ex;
      icon.y = rowY;
      parent.addChild(icon);
      ex += iconSize + 1;
      const text = new Text({
        text: `${stacks}`,
        style: { fill: effectColor('thorns'), fontSize, fontWeight: 'bold' },
      });
      text.x = ex;
      text.y = rowY;
      text.eventMode = 'none';
      parent.addChild(text);
      ex += text.width;
    }
    return ex;
  }

  if (effect.kind === 'status_spread') {
    const ss = effect as StatusSpreadEffect;
    const statusDisplay = getStatusDisplay(ss.status);
    let ex = startX;

    if (statusDisplay && statusDisplay.drawIcons.length > 0) {
      const iconG = new Graphics();
      statusDisplay.drawIcons[0](iconG, iconSize);
      iconG.x = ex;
      iconG.y = rowY;
      iconG.eventMode = 'none';
      parent.addChild(iconG);
      ex += iconSize + 2;
    }

    const color = statusDisplay?.iconColor ?? 0x9ca3af;
    const pct = Math.round(ss.fraction * 100);
    const spreadRange = Math.max(0, Math.floor(ss.spreadRange ?? 1));
    const spreadSide = ss.spreadSide ?? 'same';
    const sideTag = spreadSide === 'same' ? 'S' : spreadSide === 'opposing' ? 'O' : 'B';
    const spreadText = new Text({
      text: `${pct}%->r${spreadRange}${sideTag}`,
      style: { fill: color, fontSize: fontSize - 1, fontWeight: 'bold' },
    });
    spreadText.x = ex;
    spreadText.y = rowY;
    spreadText.eventMode = 'none';
    parent.addChild(spreadText);
    ex += spreadText.width;

    return ex;
  }

  const baseAmt = (effect as BaseCardEffect).amount;
  const amt = resolveDisplayAmount(
    effect.kind,
    baseAmt,
    card,
    caster,
    effect,
  );
  const icon = createEffectIcon(effect.kind, iconSize);
  let ex = startX;
  if (!icon) {
    const t = new Text({
      text: `${effect.kind}: ${amt}`,
      style: { fill: 0x9ca3af, fontSize },
    });
    t.x = ex;
    t.y = rowY;
    t.eventMode = 'none';
    parent.addChild(t);
    ex += t.width;
  } else {
    icon.x = ex;
    icon.y = rowY;
    parent.addChild(icon);
    ex += iconSize + 1;
    const numText = new Text({
      text: `${amt}`,
      style: { fill: effectColor(effect.kind), fontSize, fontWeight: 'bold' },
    });
    numText.x = ex;
    numText.y = rowY;
    numText.eventMode = 'none';
    parent.addChild(numText);
    ex += numText.width;
  }
  return ex;
}

function clampSingleLineText(text: Text, original: string, maxWidth: number): void {
  if (text.width <= maxWidth) return;
  const ellipsis = '...';
  let lo = 0;
  let hi = original.length;
  let best = '';
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = `${original.slice(0, mid)}${ellipsis}`;
    text.text = candidate;
    if (text.width <= maxWidth) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  text.text = best || ellipsis;
}

function fitTitleText(text: Text, title: string, maxWidth: number): void {
  const style = text.style;
  const fontSizeValue = typeof style.fontSize === 'number' ? style.fontSize : DEFAULT_TITLE_SIZE;
  const baseFontSize = Math.max(MIN_TITLE_SIZE, fontSizeValue);
  for (let size = baseFontSize; size >= MIN_TITLE_SIZE; size--) {
    text.style = { ...style, fontSize: size, wordWrap: false };
    text.text = title;
    if (text.width <= maxWidth) return;
  }
  clampSingleLineText(text, title, maxWidth);
}

export function formatRangeLabel(card: Card): string | null {
  if (!card.maxRange && !card.minRange && card.optimalRange === undefined) return null;
  if (card.minRange && card.maxRange) return `${card.minRange}-${card.maxRange}`;
  if (card.optimalRange !== undefined && card.maxRange) return `${card.optimalRange}/${card.maxRange}`;
  if (card.maxRange) return `<=${card.maxRange}`;
  if (card.minRange) return `>=${card.minRange}`;
  return `*${card.optimalRange}`;
}

/** Render a detailed 125x155 card tile into the provided parent container. */
export function renderCardTile(
  parent: Container,
  card: Card,
  x: number,
  y: number,
  options: RenderCardTileOptions = {},
): Container {
  const cardW = 125;
  const cardH = 155;
  const selected = options.selected ?? false;
  const dimmed = options.dimmed ?? false;
  const suppressionPenalty = options.suppressionPenalty ?? 0;
  const totalCost = card.cost.energy + suppressionPenalty;

  const container = new Container();
  container.x = x;
  container.y = y;

  // Mask to clip overflow - add first so it's behind content
  const cardMask = new Graphics();
  cardMask.rect(0, 0, cardW, cardH);
  cardMask.fill({ color: 0x000000, alpha: 1 });
  cardMask.alpha = 0.001;
  cardMask.eventMode = 'none';
  container.addChild(cardMask);
  container.mask = cardMask;

  const drawDivider = (dy: number) => {
    const line = new Graphics();
    line.moveTo(0, 0).lineTo(cardW - 20, 0);
    line.stroke({ width: 1, color: 0x374151 });
    line.alpha = 0.5;
    line.x = 10;
    line.y = dy;
    line.eventMode = 'none';
    container.addChild(line);
  };

  const bg = new Graphics();
  bg.roundRect(0, 0, cardW, cardH, 8);
  bg.fill(0x1f2937);
  bg.stroke({
    width: selected ? 3 : 1,
    color: selected ? 0x22c55e : 0x374151,
  });
  if (dimmed) bg.alpha = 0.5;
  if (options.interactive) {
    bg.eventMode = 'static';
    bg.cursor = 'pointer';
    bg.hitArea = new Rectangle(0, 0, cardW, cardH);
    if (options.onClick) {
      bg.on('pointertap', options.onClick);
    }
  } else {
    bg.eventMode = 'none';
  }
  container.addChild(bg);

  const contentLeft = 10;
  const contentRight = cardW - 10;
  const raritySlotWidth = card.rarity ? 14 : 0;
  const titleMaxWidth = Math.max(40, contentRight - contentLeft - raritySlotWidth);

  const name = new Text({
    text: card.name,
    style: { fill: 0xffffff, fontSize: DEFAULT_TITLE_SIZE, fontWeight: 'bold' },
  });
  fitTitleText(name, card.name, titleMaxWidth);
  name.x = contentLeft;
  name.y = 8;
  name.eventMode = 'none';
  container.addChild(name);

  if (card.rarity) {
    const ri = createRarityIcon(card.rarity, 8);
    const riX = cardW - 15;
    const riY = 8;
    ri.x = riX;
    ri.y = riY;
    ri.eventMode = options.onRarityHover ? 'static' : 'none';
    if (options.onRarityHover) {
      ri.cursor = 'help';
      ri.hitArea = new Rectangle(-8, -8, 24, 24);
      registerCardHoverRegion(card.id, x + riX - 8, y + riY - 8, 24, 24, x + riX, y + riY + 16);
      ri.on('pointerenter', () => {
        options.onRarityHover?.(card.id, x + riX, y + riY + 16);
      });
      ri.on('pointerout', () => {
        options.onRarityHover?.(null);
      });
    }
    container.addChild(ri);
  }

  drawDivider(26);

  const energyIconSize = 12;
  let costX = 10;
  const energyIcon = createEnergyIcon(energyIconSize);
  energyIcon.x = costX;
  energyIcon.y = 30;
  container.addChild(energyIcon);
  costX += energyIconSize + 2;

  if (suppressionPenalty > 0) {
    const cost = new Text({
      text: `${totalCost}`,
      style: { fill: 0xfb923c, fontSize: 12, fontWeight: 'bold' },
    });
    cost.x = costX;
    cost.y = 30;
    cost.eventMode = 'none';
    container.addChild(cost);
    costX += cost.width + 3;

    const originalCost = new Text({
      text: `(${card.cost.energy})`,
      style: { fill: 0x6b7280, fontSize: 9 },
    });
    originalCost.x = costX;
    originalCost.y = 32;
    originalCost.eventMode = 'none';
    container.addChild(originalCost);
  } else {
    const cost = new Text({
      text: `${card.cost.energy}`,
      style: { fill: 0x38bdf8, fontSize: 12, fontWeight: 'bold' },
    });
    cost.x = costX;
    cost.y = 30;
    cost.eventMode = 'none';
    container.addChild(cost);
  }

  drawDivider(46);

  const groups = groupEffects(card);
  const effectIconSize = 12;
  const rowHeight = 17;
  const groupGap = 6;
  let curY = 50;
  let groupIdx = 0;
  const effectsBottomY = cardH - 26;
  const effectsRowsAvailable = Math.max(0, Math.floor((effectsBottomY - curY) / rowHeight));
  let renderedRows = 0;
  let hiddenRows = 0;
  const reachableSlots = card.maxRange ? Math.min(card.maxRange, MAX_INDICATOR_SLOTS) : undefined;

  for (const [key, effects] of groups) {
    const lbl = labelForKey(key);
    let indicatorWidth = 0;
    const renderableEffects = effects.filter(e => e.kind !== 'modifier' && e.kind !== 'deck_inject');
    if (renderableEffects.length === 0) continue;

    if (groupIdx > 0 && renderedRows < effectsRowsAvailable) {
      const divG = new Graphics();
      divG.moveTo(0, 0).lineTo(cardW - 20, 0);
      divG.stroke({ width: 1, color: 0x4b5563 });
      divG.alpha = 0.35;
      divG.x = 10;
      divG.y = curY + 1;
      divG.eventMode = 'none';
      container.addChild(divG);
      curY += groupGap;
    }

    for (let ei = 0; ei < renderableEffects.length; ei++) {
      if (renderedRows >= effectsRowsAvailable) {
        hiddenRows += renderableEffects.length - ei;
        break;
      }
      let ex = 10;
      if (ei === 0 && lbl.usePositionIndicator) {
        const aoeTargetSide = key.startsWith('aoe_') ? (card.targetSide === 'ally' ? 'ally' : 'enemy') : undefined;
        const noEmptySlots = key === 'self' || key.startsWith('aoe_');
        const rangeForIndicator = key !== 'self' ? reachableSlots : undefined;
        indicatorWidth = renderPositionIndicator(
          container,
          ex,
          curY,
          lbl.filledCount,
          lbl.targetType,
          Math.floor(effectIconSize * 0.72),
          aoeTargetSide,
          noEmptySlots,
          rangeForIndicator,
        );
        ex += indicatorWidth + 3;
      } else if (lbl.usePositionIndicator) {
        ex += indicatorWidth + 3;
      }

      renderSingleEffect(
        container,
        renderableEffects[ei],
        ex,
        curY,
        effectIconSize,
        12,
        card,
        options.caster,
      );
      curY += rowHeight;
      renderedRows++;
    }
    if (renderedRows >= effectsRowsAvailable) break;
    groupIdx++;
  }

  if (hiddenRows > 0 && effectsRowsAvailable > 0) {
    const more = new Text({
      text: `+${hiddenRows} more`,
      style: { fill: 0x9ca3af, fontSize: 10, fontStyle: 'italic' },
    });
    more.x = 10;
    more.y = effectsBottomY - 1;
    more.eventMode = 'none';
    container.addChild(more);
  }

  drawDivider(cardH - 22);

  if (card.exhaust) {
    const flame = createExhaustIcon(12);
    flame.x = 8;
    flame.y = cardH - 17;
    container.addChild(flame);
  }

  const rangeLabel = formatRangeLabel(card);
  if (rangeLabel) {
    const rangeIconSize = 11;
    const footerPadding = 10;

    const rangeTxt = new Text({
      text: rangeLabel,
      style: { fill: 0x06b6d4, fontSize: 11, fontWeight: 'bold' },
    });
    rangeTxt.x = cardW - footerPadding - rangeTxt.width;
    rangeTxt.y = cardH - 16;
    rangeTxt.eventMode = 'none';
    container.addChild(rangeTxt);

    const rangeIcon = createRangeIcon(rangeIconSize);
    rangeIcon.x = rangeTxt.x - rangeIconSize - 3;
    rangeIcon.y = cardH - 17;
    container.addChild(rangeIcon);
  }

  parent.addChild(container);
  return container;
}
