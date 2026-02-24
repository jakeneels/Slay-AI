// Lane rendering - visual slot indicators with debug indexes

import type { Application } from 'pixi.js';
import { Container, Graphics, Text } from 'pixi.js';
import { WIDTH, HEIGHT, MAX_SLOTS, ALLY_SLOT_END, ENEMY_SLOT_START, SPRITE_CENTER } from '../core/constants.js';
import type { GameState } from '../core/types.js';
import { createDamageIcon } from './icons/damageIcon.js';
import { createShieldIcon } from './icons/shieldIcon.js';
import { createSpeedIcon } from './icons/speedIcon.js';
import { createLaneHazardIcon } from './icons/laneHazardIcon.js';
import { createHealIcon } from './icons/healIcon.js';
import type { GameModifier } from '../core/types.js';

const BATTLE_Y_OFFSET = 265;
const BATTLE_SIDE_OVERSCAN = 40;
const SHOW_LANES_STORAGE_KEY = 'slayai:debug:show-lanes';
let showLanesSetting = true;
const laneAnimationCleanups: Array<() => void> = [];

type LaneLabelSegment = {
  iconFactory?: (size?: number) => Graphics;
  valueText: string;
  valueColor: number;
};

/**
 * Maps modifier targets to their corresponding icon factory functions.
 */
function getModifierIconFactory(target: string): ((size?: number) => Graphics) | null {
  const iconMap: Record<string, (size?: number) => Graphics> = {
    damage_dealt: createDamageIcon,
    block_amount: createShieldIcon,
    speed: createSpeedIcon,
    heal_amount: createHealIcon,
    friendly_heal_outgoing: createHealIcon,
    friendly_heal_incoming: createHealIcon,
    friendly_heal_in: createHealIcon,
    heal_incoming: createHealIcon,
    incoming_heal: createHealIcon,
  };
  return iconMap[target] ?? null;
}

/**
 * Formats a modifier value based on its operation type.
 */
function formatModifierValue(mod: GameModifier): string {
  if (mod.op === 'multiply') {
    const pct = Math.round((mod.value - 1) * 100);
    return `${pct > 0 ? '+' : ''}${pct}%`;
  } else if (mod.op === 'add') {
    return `${mod.value > 0 ? '+' : ''}${mod.value}`;
  } else if (mod.op === 'set') {
    return `${mod.value}`;
  } else {
    return `${mod.op} ${mod.value}`;
  }
}

function getLaneBuffLabelSegments(buff: GameState['laneBuffs'][number]): LaneLabelSegment[] {
  const segments: LaneLabelSegment[] = [];
  for (const mod of buff.modifiers) {
    const iconFactory = getModifierIconFactory(mod.target);
    const valueText = formatModifierValue(mod);
    
    if (iconFactory) {
      segments.push({
        iconFactory,
        valueText,
        valueColor: 0xfff4b0,
      });
    } else {
      // Fallback to text for unknown modifier targets
      segments.push({
        valueText: `${mod.target} ${mod.op} ${mod.value}`,
        valueColor: 0xfff4b0,
      });
    }
  }
  segments.push({ valueText: `${buff.remainingTurns}t`, valueColor: 0xfef08a });
  return segments;
}

function getLaneHazardLabelSegments(hazard: GameState['laneHazards'][number]): LaneLabelSegment[] {
  return [
    {
      iconFactory: createLaneHazardIcon,
      valueText: `${hazard.damage}`,
      valueColor: 0xffd180,
    },
    { valueText: `${hazard.remainingTurns}t`, valueColor: 0xffd180 },
  ];
}

type LaneParticleDirection = 'up' | 'down';

type AnimatedLaneEffectOptions = {
  app: Application;
  slot: number;
  labelSegments: LaneLabelSegment[];
  labelOffsetY?: number;
  laneLeft: number;
  laneW: number;
  laneTop: number;
  laneBottom: number;
  laneHeight: number;
  visualCenter: number;
  zIndex: number;
  overlayColor: number;
  borderColor: number;
  glowColor: number;
  particleColor: number;
  particleDirection: LaneParticleDirection;
  effectStyle?: 'default' | 'fire';
  cleanups: Array<() => void>;
};

function renderAnimatedLaneEffect(options: AnimatedLaneEffectOptions): void {
  const {
    app,
    labelSegments,
    labelOffsetY,
    laneLeft,
    laneW,
    laneTop,
    laneBottom,
    laneHeight,
    visualCenter,
    zIndex,
    overlayColor,
    borderColor,
    glowColor,
    particleColor,
    particleDirection,
    effectStyle,
    cleanups,
  } = options;

  const effectContainer = new Container();
  effectContainer.zIndex = zIndex;
  effectContainer.eventMode = 'none';
  app.stage.addChild(effectContainer);

  const effectOverlay = new Graphics();
  effectOverlay.rect(laneLeft, laneTop, laneW, laneHeight)
    .fill({ color: overlayColor, alpha: 0.14 })
    .stroke({ width: 2, color: borderColor, alpha: 0.45 });
  effectOverlay.eventMode = 'none';
  effectContainer.addChild(effectOverlay);

  const effectGlow = new Graphics();
  effectGlow.rect(laneLeft, laneTop, laneW, laneHeight)
    .fill({ color: glowColor, alpha: 0.06 });
  effectGlow.eventMode = 'none';
  effectContainer.addChild(effectGlow);

  const fireTongues: Array<{ sprite: Graphics; baseX: number; phase: number; width: number; height: number; tint: number }> = [];
  if (effectStyle === 'fire') {
    const tongueCount = Math.max(3, Math.floor(laneW / 36));
    for (let i = 0; i < tongueCount; i++) {
      const sprite = new Graphics();
      sprite.eventMode = 'none';
      sprite.alpha = 0.45;
      effectContainer.addChild(sprite);
      fireTongues.push({
        sprite,
        baseX: laneLeft + (i + 0.5) * (laneW / tongueCount),
        phase: Math.random() * Math.PI * 2,
        width: 4 + Math.random() * 3.2,
        height: 26 + Math.random() * 30,
        tint: i % 2 === 0 ? 0xfb923c : 0xfacc15,
      });
    }
  }

  const particleCount = effectStyle === 'fire' ? 18 : 8;
  const particles = Array.from({ length: particleCount }, () => {
    const radius = effectStyle === 'fire'
      ? 0.7 + Math.random() * 0.9
      : 1.7 + Math.random() * 1.8;
    const particle = new Graphics();
    particle.circle(0, 0, radius)
      .fill({ color: particleColor, alpha: 0.78 });
    particle.x = laneLeft + Math.random() * laneW;
    particle.y = particleDirection === 'up'
      ? laneBottom - 14 - Math.random() * 60
      : laneTop + 12 + Math.random() * 60;
    particle.eventMode = 'none';
    particle.alpha = 0.45 + Math.random() * 0.45;
    effectContainer.addChild(particle);
    return {
      sprite: particle,
      speed: effectStyle === 'fire' ? 28 + Math.random() * 44 : 22 + Math.random() * 28,
      drift: effectStyle === 'fire' ? (Math.random() - 0.5) * 8 : (Math.random() - 0.5) * 12,
    };
  });

  const iconSize = 10;
  const iconGap = 2;
  const segmentGap = 6;
  const measured = labelSegments.map(segment => {
    const txt = new Text({
      text: segment.valueText,
      style: {
        fill: segment.valueColor,
        fontSize: 10,
        fontWeight: 'bold',
        stroke: { color: 0x000000, width: 3 },
      },
    });
    txt.eventMode = 'none';
    const segmentW = segment.iconFactory ? (iconSize + iconGap + txt.width) : txt.width;
    return { segment, txt, width: segmentW };
  });
  const totalLabelW = measured.reduce((sum, m, idx) => sum + m.width + (idx > 0 ? segmentGap : 0), 0);
  let labelX = visualCenter - totalLabelW / 2;
  const labelY = laneTop + (labelOffsetY ?? 8);
  for (let i = 0; i < measured.length; i++) {
    const m = measured[i];
    let valueX = labelX;
    if (m.segment.iconFactory) {
      const icon = m.segment.iconFactory(iconSize);
      icon.x = labelX;
      icon.y = labelY + 1;
      icon.alpha = 0.95;
      icon.eventMode = 'none';
      icon.zIndex = zIndex + 1;
      effectContainer.addChild(icon);
      valueX += iconSize + iconGap;
    }

    m.txt.x = valueX;
    m.txt.y = labelY;
    m.txt.alpha = 0.92;
    m.txt.zIndex = zIndex + 1;
    effectContainer.addChild(m.txt);

    labelX += m.width + segmentGap;
  }

  let t = Math.random() * Math.PI * 2;
  const tick = (ticker: { deltaMS: number }) => {
    const dt = Math.max(0.001, ticker.deltaMS / 1000);
    t += dt;
    const flicker = 0.5 + 0.5 * Math.sin(t * 9);
    const glow = 0.5 + 0.5 * Math.sin(t * 5 + 1.2);
    effectOverlay.alpha = 0.11 + flicker * 0.12;
    effectGlow.alpha = 0.04 + glow * 0.1;

    if (fireTongues.length > 0) {
      for (const tongue of fireTongues) {
        const sway = Math.sin(t * 7 + tongue.phase) * 3;
        const pulse = 0.55 + 0.45 * Math.sin(t * 9 + tongue.phase);
        const baseY = laneBottom - 4;
        const tipY = Math.max(laneTop + 6, baseY - (tongue.height * (1.0 + pulse)));
        const leftX = tongue.baseX - tongue.width + sway;
        const rightX = tongue.baseX + tongue.width + sway;
        const tipX = tongue.baseX + sway * 0.5;

        tongue.sprite.clear();
        tongue.sprite
          .moveTo(leftX, baseY)
          .quadraticCurveTo(tipX - tongue.width * 0.7, baseY - tongue.height * 0.35, tipX, tipY)
          .quadraticCurveTo(tipX + tongue.width * 0.7, baseY - tongue.height * 0.35, rightX, baseY)
          .lineTo(tipX, baseY - 2)
          .closePath()
          .fill({ color: tongue.tint, alpha: 0.28 + pulse * 0.32 });
      }
    }

    for (const particle of particles) {
      particle.sprite.y += (particleDirection === 'up' ? -1 : 1) * particle.speed * dt;
      particle.sprite.x += particle.drift * dt;
      const life = particleDirection === 'up'
        ? (laneBottom - particle.sprite.y) / laneHeight
        : (particle.sprite.y - laneTop) / laneHeight;
      particle.sprite.alpha = Math.max(0, 0.85 - life);
      const hitBoundary = particleDirection === 'up'
        ? particle.sprite.y < laneTop + 14
        : particle.sprite.y > laneBottom - 12;
      if (!hitBoundary) continue;
      particle.sprite.y = particleDirection === 'up'
        ? laneBottom - 10 - Math.random() * 18
        : laneTop + 10 + Math.random() * 18;
      particle.sprite.x = laneLeft + Math.random() * laneW;
      particle.speed = 22 + Math.random() * 28;
      particle.drift = (Math.random() - 0.5) * 12;
      particle.sprite.alpha = 0.45 + Math.random() * 0.45;
    }
  };

  app.ticker.add(tick);
  cleanups.push(() => app.ticker.remove(tick));
}

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

  // Lane strip — from above character sprites down past the info rows (extended higher so tall enemies don't block hazard info)
  const laneTop = battleY - 120;
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

    renderAnimatedLaneEffect({
      app,
      slot,
      labelSegments: getLaneHazardLabelSegments(hazard),
      labelOffsetY: 8,
      laneLeft,
      laneW,
      laneTop,
      laneBottom,
      laneHeight,
      visualCenter,
      zIndex: -350,
      overlayColor: 0xdc2626,
      borderColor: 0xfb923c,
      glowColor: 0xef4444,
      particleColor: 0xf97316,
      particleDirection: 'up',
      effectStyle: 'fire',
      cleanups: laneAnimationCleanups,
    });
  }

  // Lane buff overlays (render above hazards but below characters).
  for (const buff of gameState.laneBuffs) {
    const slot = buff.slotIndex;
    if (slot < 0 || slot >= MAX_SLOTS) continue;
    const slotX = leftBase + slot * slotSpacing;
    const visualCenter = slotX + SPRITE_CENTER;
    const laneLeft = Math.max(0, visualCenter - halfLane);
    const laneRight = Math.min(WIDTH, visualCenter + halfLane);
    const laneW = laneRight - laneLeft;

    renderAnimatedLaneEffect({
      app,
      slot,
      labelSegments: getLaneBuffLabelSegments(buff),
      labelOffsetY: 24,
      laneLeft,
      laneW,
      laneTop,
      laneBottom,
      laneHeight,
      visualCenter,
      zIndex: -330,
      overlayColor: 0xfef08a,
      borderColor: 0xfde047,
      glowColor: 0xfffbeb,
      particleColor: 0xfffbeb,
      particleDirection: 'down',
      effectStyle: 'default',
      cleanups: laneAnimationCleanups,
    });
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
