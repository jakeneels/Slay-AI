// Status effect tooltip renderer
// Draws a tooltip panel when hovering over a status badge on a character.

import type { Application } from 'pixi.js';
import { Graphics, Text } from 'pixi.js';
import { getHoveredStatus } from './tooltipState.js';
import { getStatusDisplay } from './statusConfig.js';
import { WIDTH, HEIGHT } from '../core/constants.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOLTIP_W = 220;
const PAD = 10;
const ICON_SIZE = 16;
const ICON_GAP = 4;
const Z_BASE = 6000; // Above card tooltips (5000)

const HEADER_FONT = 13;
const BODY_FONT = 11;
const STACK_FONT = 10;

const BG_COLOR = 0x111827;
const BG_ALPHA = 0.96;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Render the status effect tooltip if a status badge is currently hovered.
 * Should be called last in the render loop so it draws on top of everything.
 */
export function renderStatusTooltip(app: Application): void {
  const { statusId, stacks, x: anchorX, y: anchorY } = getHoveredStatus();
  if (!statusId) return;

  const config = getStatusDisplay(statusId);
  if (!config) return;

  // ── Measure content height ────────────────────────────────────────

  let contentH = PAD; // top padding

  // Header row: icons + label
  contentH += Math.max(ICON_SIZE, HEADER_FONT + 4);
  contentH += 6; // separator gap

  // Description text (rough estimate: ~30 chars per line at BODY_FONT)
  const descLines = Math.ceil(config.description.length / 30);
  contentH += descLines * (BODY_FONT + 4);
  contentH += 4;

  // Stack/penalty line (if stacks > 0)
  if (stacks > 0) {
    contentH += 4; // gap
    contentH += STACK_FONT + 4;
  }

  contentH += PAD; // bottom padding

  // ── Position tooltip ──────────────────────────────────────────────

  // Default: above the badge
  let tx = anchorX - TOOLTIP_W / 2;
  let ty = anchorY - contentH - 8;

  // Clamp horizontal
  if (tx < 8) tx = 8;
  if (tx + TOOLTIP_W > WIDTH - 8) tx = WIDTH - 8 - TOOLTIP_W;

  // If it would go off the top, flip below the badge
  if (ty < 8) {
    ty = anchorY + BADGE_H_APPROX + 8;
  }
  // Clamp vertical
  if (ty < 8) ty = 8;
  if (ty + contentH > HEIGHT - 8) ty = HEIGHT - 8 - contentH;

  // ── Draw background ───────────────────────────────────────────────

  // Drop shadow
  const shadow = new Graphics();
  shadow.roundRect(2, 2, TOOLTIP_W, contentH, 8)
    .fill({ color: 0x000000, alpha: 0.3 });
  shadow.x = tx;
  shadow.y = ty;
  shadow.eventMode = 'none';
  shadow.zIndex = Z_BASE - 1;
  app.stage.addChild(shadow);

  // Main panel
  const bg = new Graphics();
  bg.roundRect(0, 0, TOOLTIP_W, contentH, 8)
    .fill({ color: BG_COLOR, alpha: BG_ALPHA })
    .stroke({ width: 1.5, color: config.borderColor, alpha: 0.9 });
  bg.x = tx;
  bg.y = ty;
  bg.eventMode = 'none';
  bg.zIndex = Z_BASE;
  app.stage.addChild(bg);

  // ── Draw content ──────────────────────────────────────────────────

  let cy = ty + PAD;
  let cx = tx + PAD;

  // Icons
  for (const drawFn of config.drawIcons) {
    const icon = new Graphics();
    drawFn(icon, ICON_SIZE);
    icon.x = cx;
    icon.y = cy;
    icon.eventMode = 'none';
    icon.zIndex = Z_BASE + 1;
    app.stage.addChild(icon);
    cx += ICON_SIZE + ICON_GAP;
  }

  // Label (next to icons)
  const label = new Text({
    text: config.label,
    style: {
      fill: config.iconColor,
      fontSize: HEADER_FONT,
      fontWeight: 'bold',
    },
  });
  label.x = cx + 2;
  label.y = cy + (ICON_SIZE - HEADER_FONT) / 2;
  label.eventMode = 'none';
  label.zIndex = Z_BASE + 1;
  app.stage.addChild(label);

  cy += Math.max(ICON_SIZE, HEADER_FONT + 4);

  // Separator line
  const sep = new Graphics();
  sep.moveTo(tx + PAD, cy)
    .lineTo(tx + TOOLTIP_W - PAD, cy)
    .stroke({ width: 1, color: config.borderColor, alpha: 0.3 });
  sep.eventMode = 'none';
  sep.zIndex = Z_BASE + 1;
  app.stage.addChild(sep);
  cy += 6;

  // Description (word-wrapped)
  const desc = new Text({
    text: config.description,
    style: {
      fill: 0xd1d5db,
      fontSize: BODY_FONT,
      wordWrap: true,
      wordWrapWidth: TOOLTIP_W - PAD * 2,
    },
  });
  desc.x = tx + PAD;
  desc.y = cy;
  desc.eventMode = 'none';
  desc.zIndex = Z_BASE + 1;
  app.stage.addChild(desc);
  cy += desc.height + 4;

  // Stack/penalty info
  if (stacks > 0) {
    let stackLabel: string;
    if (statusId === 'suppressed') {
      stackLabel = `Energy penalty: +${stacks}`;
    } else {
      stackLabel = `Stacks: ${stacks}`;
    }

    const stackText = new Text({
      text: stackLabel,
      style: {
        fill: config.iconColor,
        fontSize: STACK_FONT,
        fontWeight: 'bold',
      },
    });
    stackText.x = tx + PAD;
    stackText.y = cy;
    stackText.eventMode = 'none';
    stackText.zIndex = Z_BASE + 1;
    app.stage.addChild(stackText);
  }
}

// Approximate badge height for positioning logic
const BADGE_H_APPROX = 16;
