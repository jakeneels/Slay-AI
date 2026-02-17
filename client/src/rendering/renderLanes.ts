// Lane rendering - visual slot indicators with debug indexes

import type { Application } from 'pixi.js';
import { Container, Graphics, Text } from 'pixi.js';
import { WIDTH, HEIGHT, MAX_SLOTS, ALLY_SLOT_END, ENEMY_SLOT_START, SPRITE_CENTER } from '../core/constants.js';
import type { GameState } from '../core/types.js';

const BATTLE_Y_OFFSET = 265;
const BATTLE_SIDE_OVERSCAN = 40;
const SHOW_LANES_STORAGE_KEY = 'slayai:debug:show-lanes';
let showLanesSetting = true;
const laneAnimationCleanups: Array<() => void> = [];

function parseBoolFlag(value: string | null): boolean {
  return value === '1' || value === 'true' || value === 'on';
}

function loadShowLanesSetting(): boolean {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('showLanes');
    if (fromQuery !== null) {
      return parseBoolFlag(fromQuery.toLowerCase());
    }
    const raw = window.localStorage.getItem(SHOW_LANES_STORAGE_KEY);
    if (raw === null) return true; // default on for current behavior
    return parseBoolFlag(raw.toLowerCase());
  } catch {
    return true;
  }
}

showLanesSetting = loadShowLanesSetting();

export function getShowLanesSetting(): boolean {
  return showLanesSetting;
}

export function setShowLanesSetting(show: boolean): void {
  showLanesSetting = show;
  try {
    window.localStorage.setItem(SHOW_LANES_STORAGE_KEY, show ? 'true' : 'false');
  } catch {
    // localStorage unavailable or full – silently ignore
  }
}

export function cleanupLaneAnimations(): void {
  while (laneAnimationCleanups.length > 0) {
    const cleanup = laneAnimationCleanups.pop();
    if (!cleanup) continue;
    cleanup();
  }
}

/**
 * Render lane indicators on the battlefield.
 * Shows subtle vertical lanes for each slot, a divider between ally/enemy sides,
 * and debug-only slot index labels at the bottom.
 */
export function renderLanes(app: Application, gameState: GameState): void {
  if (!showLanesSetting) return;

  const battleY = HEIGHT - BATTLE_Y_OFFSET;
  const leftBase = -BATTLE_SIDE_OVERSCAN;
  const rightBase = WIDTH - SPRITE_CENTER * 2 + BATTLE_SIDE_OVERSCAN;
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

  // Lane hazard overlays (render above lane strips but below characters).
  for (const hazard of gameState.laneHazards) {
    const slot = hazard.slotIndex;
    if (slot < 0 || slot >= MAX_SLOTS) continue;
    const slotX = leftBase + slot * slotSpacing;
    const visualCenter = slotX + SPRITE_CENTER;
    const laneLeft = Math.max(0, visualCenter - halfLane);
    const laneRight = Math.min(WIDTH, visualCenter + halfLane);
    const laneW = laneRight - laneLeft;

    const hazardContainer = new Container();
    hazardContainer.zIndex = -350;
    hazardContainer.eventMode = 'none';
    app.stage.addChild(hazardContainer);

    const hazardOverlay = new Graphics();
    hazardOverlay.rect(laneLeft, laneTop, laneW, laneHeight)
      .fill({ color: 0xff5a1f, alpha: 0.14 })
      .stroke({ width: 2, color: 0xffa726, alpha: 0.45 });
    hazardOverlay.eventMode = 'none';
    hazardContainer.addChild(hazardOverlay);

    const hazardGlow = new Graphics();
    hazardGlow.rect(laneLeft, laneTop, laneW, laneHeight)
      .fill({ color: 0xffd54f, alpha: 0.06 });
    hazardGlow.eventMode = 'none';
    hazardContainer.addChild(hazardGlow);

    const emberCount = 8;
    const embers = Array.from({ length: emberCount }, () => {
      const ember = new Graphics();
      ember.circle(0, 0, 1.7 + Math.random() * 1.8)
        .fill({ color: 0xffc26b, alpha: 0.75 });
      ember.x = laneLeft + Math.random() * laneW;
      ember.y = laneBottom - 14 - Math.random() * 60;
      ember.eventMode = 'none';
      ember.alpha = 0.45 + Math.random() * 0.45;
      hazardContainer.addChild(ember);
      return {
        sprite: ember,
        speed: 22 + Math.random() * 28,
        drift: (Math.random() - 0.5) * 12,
      };
    });

    const hazardText = new Text({
      text: `${hazard.damage} / ${hazard.remainingTurns}t`,
      style: {
        fill: 0xffd180,
        fontSize: 10,
        fontWeight: 'bold',
        stroke: { color: 0x000000, width: 3 },
      },
    });
    hazardText.x = visualCenter - hazardText.width / 2;
    hazardText.y = laneTop + 22;
    hazardText.alpha = 0.9;
    hazardText.eventMode = 'none';
    hazardText.zIndex = -349;
    hazardContainer.addChild(hazardText);

    let t = Math.random() * Math.PI * 2;
    const tick = (ticker: { deltaMS: number }) => {
      const dt = Math.max(0.001, ticker.deltaMS / 1000);
      t += dt;
      const flicker = 0.5 + 0.5 * Math.sin(t * 9);
      const glow = 0.5 + 0.5 * Math.sin(t * 5 + 1.2);
      hazardOverlay.alpha = 0.11 + flicker * 0.12;
      hazardGlow.alpha = 0.04 + glow * 0.1;

      for (const ember of embers) {
        ember.sprite.y -= ember.speed * dt;
        ember.sprite.x += ember.drift * dt;
        const life = (laneBottom - ember.sprite.y) / laneHeight;
        ember.sprite.alpha = Math.max(0, 0.85 - life);
        if (ember.sprite.y < laneTop + 14) {
          ember.sprite.y = laneBottom - 10 - Math.random() * 18;
          ember.sprite.x = laneLeft + Math.random() * laneW;
          ember.speed = 22 + Math.random() * 28;
          ember.drift = (Math.random() - 0.5) * 12;
          ember.sprite.alpha = 0.45 + Math.random() * 0.45;
        }
      }
    };
    app.ticker.add(tick);
    laneAnimationCleanups.push(() => app.ticker.remove(tick));
  }

  // Prominent dashed divider between ally and enemy sides.
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
