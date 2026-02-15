// Card detail tooltip renderer
// Draws a rich tooltip panel when hovering over a card's rarity icon.

import type { Application } from 'pixi.js';
import { Graphics, Text } from 'pixi.js';
import { getHoveredCard } from './tooltipState.js';
import { getGameState } from '../core/gameState.js';
import { getCard } from '../core/card.js';
import { generateTooltipData } from '../utils/cardTooltipText.js';
import type { TooltipData, TooltipEffectLine, TooltipPropertyLine } from '../utils/cardTooltipText.js';
import { getRarityColor } from '../utils/cardUtils.js';
import { WIDTH, HEIGHT } from '../core/constants.js';
import { createRarityIcon } from './icons/rarityIcon.js';
import { createEnergyIcon } from './icons/energyIcon.js';
import { createDamageIcon } from './icons/damageIcon.js';
import { createHealIcon } from './icons/healIcon.js';
import { createSpeedIcon } from './icons/speedIcon.js';
import { createShieldIcon } from './icons/shieldIcon.js';
import { createExhaustIcon } from './icons/exhaustIcon.js';
import { createRangeIcon } from './icons/rangeIcon.js';
import { createKnockbackIcon } from './icons/knockbackIcon.js';
import { createPullIcon } from './icons/pullIcon.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOLTIP_W = 280;
const PAD = 14;
const LINE_H = 16;
const SUB_LINE_H = 14;
const SECTION_GAP = 10;
const BG_COLOR = 0x111827;
const BG_ALPHA = 0.96;
const Z_BASE = 5000;

const HEADER_FONT = 15;
const BODY_FONT = 12;
const SUB_FONT = 11;
const LABEL_FONT = 11;
const FLAVOR_FONT = 11;

// ---------------------------------------------------------------------------
// Icon factory
// ---------------------------------------------------------------------------

function createIconForKey(key: string, size: number): Graphics | null {
  switch (key) {
    case 'damage': return createDamageIcon(size);
    case 'heal': return createHealIcon(size);
    case 'energy': return createEnergyIcon(size);
    case 'speed': return createSpeedIcon(size);
    case 'shield': return createShieldIcon(size);
    case 'exhaust': return createExhaustIcon(size);
    case 'range': return createRangeIcon(size);
    case 'knockback': return createKnockbackIcon(size);
    case 'pull': return createPullIcon(size);
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Layout helpers — everything returns the next Y position
// ---------------------------------------------------------------------------

function addText(
  app: Application,
  text: string,
  x: number,
  y: number,
  opts: { color?: number; size?: number; bold?: boolean; italic?: boolean; maxWidth?: number } = {},
): { t: Text; nextY: number } {
  const style: Record<string, any> = {
    fill: opts.color ?? 0xd1d5db,
    fontSize: opts.size ?? BODY_FONT,
    wordWrap: opts.maxWidth ? true : false,
    wordWrapWidth: opts.maxWidth,
  };
  if (opts.bold) style.fontWeight = 'bold';
  if (opts.italic) style.fontStyle = 'italic';
  const t = new Text({ text, style });
  t.x = x;
  t.y = y;
  t.eventMode = 'none';
  t.zIndex = Z_BASE + 2;
  app.stage.addChild(t);
  return { t, nextY: y + t.height + 2 };
}

function addIcon(app: Application, key: string, x: number, y: number, size: number): Graphics | null {
  const icon = createIconForKey(key, size);
  if (!icon) return null;
  icon.x = x;
  icon.y = y;
  icon.eventMode = 'none';
  icon.zIndex = Z_BASE + 2;
  app.stage.addChild(icon);
  return icon;
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderHeader(app: Application, data: TooltipData, x: number, y: number): number {
  const rarityColor = getRarityColor(data.header.rarity);

  // Rarity icon
  const ri = createRarityIcon(data.header.rarity, 7);
  ri.x = x + PAD + 7;
  ri.y = y + PAD + 8;
  ri.eventMode = 'none';
  ri.zIndex = Z_BASE + 2;
  app.stage.addChild(ri);

  // Card name
  const { t: nameText } = addText(app, data.header.name.toUpperCase(), x + PAD + 18, y + PAD, {
    color: 0xffffff,
    size: HEADER_FONT,
    bold: true,
  });

  // Rarity label (right-aligned)
  const rarityLabel = data.header.rarity.charAt(0).toUpperCase() + data.header.rarity.slice(1);
  const { t: rarityText } = addText(app, rarityLabel, 0, y + PAD + 1, {
    color: rarityColor,
    size: LABEL_FONT,
    bold: true,
  });
  rarityText.x = x + TOOLTIP_W - PAD - rarityText.width;

  let cy = y + PAD + nameText.height + 4;

  // Separator line
  const sep = new Graphics();
  sep.moveTo(x + PAD, cy).lineTo(x + TOOLTIP_W - PAD, cy).stroke({ width: 1, color: rarityColor, alpha: 0.4 });
  sep.eventMode = 'none';
  sep.zIndex = Z_BASE + 2;
  app.stage.addChild(sep);
  cy += 6;

  // Type line
  if (data.header.type) {
    const { nextY } = addText(app, data.header.type.charAt(0).toUpperCase() + data.header.type.slice(1), x + PAD, cy, {
      color: 0x9ca3af,
      size: BODY_FONT,
    });
    cy = nextY + 2;
  }

  return cy;
}

function renderCost(app: Application, data: TooltipData, x: number, cy: number): number {
  const iconSize = 13;
  let ix = x + PAD;

  {
    const { t } = addText(app, `${data.cost} ×`, ix, cy, { color: 0x38bdf8, size: BODY_FONT, bold: true });
    ix += t.width + 4;
    const ei = createEnergyIcon(iconSize);
    ei.x = ix;
    ei.y = cy;
    ei.eventMode = 'none';
    ei.zIndex = Z_BASE + 2;
    app.stage.addChild(ei);
  }

  // Label
  addText(app, `${data.cost} Energy`, ix + iconSize + 6, cy, {
    color: 0x6b7280,
    size: SUB_FONT,
  });

  return cy + LINE_H + 2;
}

function renderEffects(app: Application, effects: TooltipEffectLine[], x: number, cy: number): number {
  if (effects.length === 0) return cy;

  const { nextY: headerY } = addText(app, 'EFFECTS', x + PAD, cy, {
    color: 0x6b7280,
    size: LABEL_FONT,
    bold: true,
  });
  cy = headerY;

  const iconSize = 12;

  for (const eff of effects) {
    let lineX = x + PAD + 4;

    // Icon
    if (eff.icon) {
      addIcon(app, eff.icon, lineX, cy, iconSize);
      lineX += iconSize + 5;
    } else {
      // Bullet for icon-less effects
      const bullet = new Graphics();
      bullet.circle(lineX + 3, cy + 6, 2.5).fill(0x6b7280);
      bullet.eventMode = 'none';
      bullet.zIndex = Z_BASE + 2;
      app.stage.addChild(bullet);
      lineX += 12;
    }

    // Primary text
    let primaryText = eff.text;
    if (eff.targetLabel) {
      primaryText += `  ->  ${eff.targetLabel}`;
    }
    const { nextY } = addText(app, primaryText, lineX, cy, {
      color: 0xe5e7eb,
      size: BODY_FONT,
      maxWidth: TOOLTIP_W - PAD - (lineX - x),
    });
    cy = nextY;

    // Sub-lines (indented further)
    for (const sub of eff.subLines) {
      const { nextY: subY } = addText(app, sub, x + PAD + 20, cy, {
        color: 0x9ca3af,
        size: SUB_FONT,
        maxWidth: TOOLTIP_W - PAD * 2 - 20,
      });
      cy = subY;
    }
  }

  return cy + 2;
}

function renderTargeting(app: Application, data: TooltipData, x: number, cy: number): number {
  const { nextY: headerY } = addText(app, 'TARGETING', x + PAD, cy, {
    color: 0x6b7280,
    size: LABEL_FONT,
    bold: true,
  });
  cy = headerY;

  const { nextY } = addText(app, data.targeting.label, x + PAD + 4, cy, {
    color: 0xe5e7eb,
    size: BODY_FONT,
  });
  cy = nextY;

  if (data.targeting.detail) {
    const { nextY: detailY } = addText(app, data.targeting.detail, x + PAD + 4, cy, {
      color: 0x9ca3af,
      size: SUB_FONT,
    });
    cy = detailY;
  }

  return cy + 2;
}

function renderRange(app: Application, lines: string[], x: number, cy: number): number {
  if (lines.length === 0) return cy;

  const { nextY: headerY } = addText(app, 'RANGE', x + PAD, cy, {
    color: 0x6b7280,
    size: LABEL_FONT,
    bold: true,
  });
  cy = headerY;

  const rangeIconSize = 11;
  addIcon(app, 'range', x + PAD + 4, cy, rangeIconSize);

  for (let i = 0; i < lines.length; i++) {
    const lineX = i === 0 ? x + PAD + 4 + rangeIconSize + 4 : x + PAD + 20;
    const { nextY } = addText(app, lines[i], lineX, cy, {
      color: i === 0 ? 0xe5e7eb : 0x9ca3af,
      size: i === 0 ? BODY_FONT : SUB_FONT,
    });
    cy = nextY;
  }

  return cy + 2;
}

function renderProperties(app: Application, props: TooltipPropertyLine[], x: number, cy: number): number {
  if (props.length === 0) return cy;

  for (const prop of props) {
    const iconSize = 12;
    let lineX = x + PAD;

    if (prop.icon) {
      addIcon(app, prop.icon, lineX, cy, iconSize);
      lineX += iconSize + 5;
    }

    const { nextY } = addText(app, prop.label.toUpperCase(), lineX, cy, {
      color: prop.icon === 'exhaust' ? 0xf97316 : 0xfbbf24,
      size: BODY_FONT,
      bold: true,
    });
    cy = nextY;

    const { nextY: descY } = addText(app, prop.description, x + PAD + 4, cy, {
      color: 0x9ca3af,
      size: SUB_FONT,
    });
    cy = descY + 2;
  }

  return cy;
}

function renderTags(app: Application, tags: string[], x: number, cy: number): number {
  if (tags.length === 0) return cy;

  let tagX = x + PAD;
  for (const tag of tags) {
    const tagW = tag.length * 7 + 12;
    const tagH = 16;

    const bg = new Graphics();
    bg.roundRect(0, 0, tagW, tagH, 4).fill({ color: 0x374151, alpha: 0.8 });
    bg.x = tagX;
    bg.y = cy;
    bg.eventMode = 'none';
    bg.zIndex = Z_BASE + 2;
    app.stage.addChild(bg);

    addText(app, tag, tagX + 6, cy + 2, {
      color: 0x9ca3af,
      size: 10,
    });

    tagX += tagW + 4;
  }

  return cy + 20;
}

function renderFlavor(app: Application, flavor: string, x: number, cy: number): number {
  // Separator
  const sep = new Graphics();
  sep.moveTo(x + PAD, cy).lineTo(x + TOOLTIP_W - PAD, cy).stroke({ width: 1, color: 0x374151, alpha: 0.5 });
  sep.eventMode = 'none';
  sep.zIndex = Z_BASE + 2;
  app.stage.addChild(sep);
  cy += 6;

  const { nextY } = addText(app, `"${flavor}"`, x + PAD, cy, {
    color: 0x6b7280,
    size: FLAVOR_FONT,
    italic: true,
    maxWidth: TOOLTIP_W - PAD * 2,
  });

  return nextY + 2;
}

// ---------------------------------------------------------------------------
// Measure pass — compute total height before drawing background
// ---------------------------------------------------------------------------

/** Lightweight Y-cursor walk to estimate total tooltip height. */
function measureTooltipHeight(data: TooltipData): number {
  let cy = 0;

  // Header (name + separator + type)
  cy += PAD + 18 + 4; // name
  cy += 6; // separator
  if (data.header.type) cy += LINE_H + 2;

  // Cost
  cy += LINE_H + 2 + SECTION_GAP;

  // Effects
  if (data.effects.length > 0) {
    cy += LINE_H; // "EFFECTS" header
    for (const eff of data.effects) {
      cy += LINE_H; // primary line
      for (const sub of eff.subLines) {
        // Estimate wrapped lines: ~35 chars per line at SUB_FONT in available width
        const wrappedLines = Math.ceil(sub.length / 35);
        cy += wrappedLines * SUB_LINE_H;
      }
    }
    cy += 2 + SECTION_GAP;
  }

  // Targeting
  cy += LINE_H; // "TARGETING" header
  cy += LINE_H; // label
  if (data.targeting.detail) cy += SUB_LINE_H;
  cy += 2 + SECTION_GAP;

  // Range
  if (data.range.lines.length > 0) {
    cy += LINE_H; // "RANGE" header
    cy += data.range.lines.length * LINE_H;
    cy += 2 + SECTION_GAP;
  }

  // Properties
  for (const _prop of data.properties) {
    cy += LINE_H + SUB_LINE_H + 2;
  }
  if (data.properties.length > 0) cy += SECTION_GAP;

  // Tags
  if (data.tags.length > 0) cy += 20 + SECTION_GAP;

  // Flavor
  if (data.flavor) {
    cy += 6; // separator
    // Rough estimate: ~50 chars per line at FLAVOR_FONT size
    const lines = Math.ceil(data.flavor.length / 38);
    cy += lines * (FLAVOR_FONT + 3) + 2;
  }

  cy += PAD; // bottom padding

  return cy;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Render the card detail tooltip if a card is currently hovered.
 * Should be called last in the render loop so it draws on top of everything.
 */
export function renderCardTooltip(app: Application): void {
  const { cardId, x: anchorX, y: anchorY } = getHoveredCard();
  if (!cardId) return;

  // Resolve the card template (not instance)
  const gameState = getGameState();
  let card = gameState.cardLibrary[cardId];
  if (!card) {
    // Try card instance
    card = getCard(cardId) as any;
    if (!card) return;
  }

  const data = generateTooltipData(card);
  const tooltipH = measureTooltipHeight(data);

  // Position: below the rarity icon, clamped to canvas
  let tx = anchorX - TOOLTIP_W / 2;
  let ty = anchorY + 20; // 20px below the icon

  // Clamp horizontal
  if (tx < 8) tx = 8;
  if (tx + TOOLTIP_W > WIDTH - 8) tx = WIDTH - 8 - TOOLTIP_W;

  // If it would go off the bottom, flip above the icon
  if (ty + tooltipH > HEIGHT - 8) {
    ty = anchorY - tooltipH - 10;
  }
  // Clamp vertical
  if (ty < 8) ty = 8;

  // Background panel
  const rarityColor = getRarityColor(data.header.rarity);
  const bg = new Graphics();
  bg.roundRect(0, 0, TOOLTIP_W, tooltipH, 10)
    .fill({ color: BG_COLOR, alpha: BG_ALPHA })
    .stroke({ width: 2, color: rarityColor, alpha: 0.8 });
  bg.x = tx;
  bg.y = ty;
  bg.eventMode = 'none';
  bg.zIndex = Z_BASE;
  app.stage.addChild(bg);

  // Drop shadow (subtle)
  const shadow = new Graphics();
  shadow.roundRect(3, 3, TOOLTIP_W, tooltipH, 10)
    .fill({ color: 0x000000, alpha: 0.3 });
  shadow.x = tx;
  shadow.y = ty;
  shadow.eventMode = 'none';
  shadow.zIndex = Z_BASE - 1;
  app.stage.addChild(shadow);

  // Render sections
  let cy = renderHeader(app, data, tx, ty);
  cy += SECTION_GAP;

  cy = renderCost(app, data, tx, cy);
  cy += SECTION_GAP;

  cy = renderEffects(app, data.effects, tx, cy);
  cy += SECTION_GAP;

  cy = renderTargeting(app, data, tx, cy);
  cy += SECTION_GAP;

  cy = renderRange(app, data.range.lines, tx, cy);
  if (data.range.lines.length > 0) cy += SECTION_GAP;

  cy = renderProperties(app, data.properties, tx, cy);
  if (data.properties.length > 0) cy += SECTION_GAP;

  cy = renderTags(app, data.tags, tx, cy);

  if (data.flavor) {
    renderFlavor(app, data.flavor, tx, cy);
  }
}
