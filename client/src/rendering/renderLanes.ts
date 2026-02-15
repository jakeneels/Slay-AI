// Lane rendering - visual slot indicators with debug indexes

import type { Application } from 'pixi.js';
import { Graphics, Text } from 'pixi.js';
import { WIDTH, HEIGHT, MAX_SLOTS, ALLY_SLOT_END, ENEMY_SLOT_START } from '../core/constants.js';

const BATTLE_Y_OFFSET = 290;
// Character sprites are ~200px wide; the slot x is the left edge, so visual center = x + SPRITE_CENTER
const SPRITE_CENTER = 100;

/**
 * Render lane indicators on the battlefield.
 * Shows subtle vertical lanes for each slot, a divider between ally/enemy sides,
 * and debug-only slot index labels at the bottom.
 */
export function renderLanes(app: Application): void {
  const battleY = HEIGHT - BATTLE_Y_OFFSET;
  const leftBase = 100;
  const rightBase = WIDTH - 200;
  const availableWidth = rightBase - leftBase;
  const slotSpacing = MAX_SLOTS > 1 ? availableWidth / (MAX_SLOTS - 1) : 0;

  // Lane strip — from above character sprites down past the info rows
  const laneTop = battleY - 50;
  const laneBottom = battleY + 250;
  const laneHeight = laneBottom - laneTop;
  const halfLane = slotSpacing / 2;

  // Draw alternating lane strips centred on each character's visual centre
  for (let i = 0; i < MAX_SLOTS; i++) {
    const slotX = leftBase + i * slotSpacing;           // left edge of sprite
    const visualCenter = slotX + SPRITE_CENTER;          // visual centre of character
    const isAlly = i <= ALLY_SLOT_END;
    const isEven = i % 2 === 0;

    // Compute left/right edges of lane strip (clamp for first/last)
    const laneLeft = Math.max(0, visualCenter - halfLane);
    const laneRight = Math.min(WIDTH, visualCenter + halfLane);
    const laneW = laneRight - laneLeft;

    // Subtle alternating tint
    const lane = new Graphics();
    const allyColor = isEven ? 0x22c55e : 0x16a34a;
    const enemyColor = isEven ? 0xef4444 : 0xdc2626;
    const fillColor = isAlly ? allyColor : enemyColor;

    lane.rect(laneLeft, laneTop, laneW, laneHeight)
      .fill({ color: fillColor, alpha: 0.04 });
    lane.zIndex = -500;
    lane.eventMode = 'none';
    app.stage.addChild(lane);

    // Thin vertical divider line at left edge of each lane (skip first)
    if (i > 0) {
      const divider = new Graphics();
      divider.moveTo(laneLeft, laneTop)
        .lineTo(laneLeft, laneBottom);
      divider.stroke({ width: 1, color: 0xffffff, alpha: 0.2 });
      divider.zIndex = -499;
      divider.eventMode = 'none';
      app.stage.addChild(divider);
    }

    // Debug slot index label at the bottom of each lane
    const indexLabel = new Text({
      text: `${i}`,
      style: {
        fill: isAlly ? 0x4ade80 : 0xf87171,
        fontSize: 12,
        fontWeight: 'bold',
        stroke: { color: 0x000000, width: 3 },
      }
    });
    indexLabel.x = visualCenter - indexLabel.width / 2;
    indexLabel.y = laneBottom - 20;
    indexLabel.alpha = 0.6;
    indexLabel.eventMode = 'none';
    indexLabel.zIndex = -498;
    app.stage.addChild(indexLabel);
  }

  // Prominent dashed divider between ally side (slots 0-3) and enemy side (slots 4-7)
  const allyEdgeCenter = leftBase + ALLY_SLOT_END * slotSpacing + SPRITE_CENTER;
  const enemyEdgeCenter = leftBase + ENEMY_SLOT_START * slotSpacing + SPRITE_CENTER;
  const dividerX = (allyEdgeCenter + enemyEdgeCenter) / 2;

  const midDivider = new Graphics();
  const dashLen = 10;
  const gapLen = 6;
  let drawY = laneTop;
  while (drawY < laneBottom) {
    const segEnd = Math.min(drawY + dashLen, laneBottom);
    midDivider.moveTo(dividerX, drawY)
      .lineTo(dividerX, segEnd);
    drawY = segEnd + gapLen;
  }
  midDivider.stroke({ width: 2, color: 0xfbbf24, alpha: 0.25 });
  midDivider.zIndex = -498;
  midDivider.eventMode = 'none';
  app.stage.addChild(midDivider);

  // Side labels just above the lane area
  const allyLabel = new Text({
    text: '',
    style: {
      fill: 0x4ade80,
      fontSize: 10,
      fontWeight: 'bold',
      letterSpacing: 2,
      stroke: { color: 0x000000, width: 3 },
    }
  });
  allyLabel.x = dividerX - allyLabel.width - 12;
  allyLabel.y = laneTop + 4;
  allyLabel.alpha = 0.35;
  allyLabel.eventMode = 'none';
  allyLabel.zIndex = -498;
  app.stage.addChild(allyLabel);

  const enemyLabel = new Text({
    text: '',
    style: {
      fill: 0xf87171,
      fontSize: 10,
      fontWeight: 'bold',
      letterSpacing: 2,
      stroke: { color: 0x000000, width: 3 },
    }
  });
  enemyLabel.x = dividerX + 12;
  enemyLabel.y = laneTop + 4;
  enemyLabel.alpha = 0.15;
  enemyLabel.eventMode = 'none';
  enemyLabel.zIndex = -498;
  app.stage.addChild(enemyLabel);
}
