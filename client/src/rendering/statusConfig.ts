// Status effect display configuration
// Maps status IDs to their visual properties for rendering badges on characters.

import { Graphics } from 'pixi.js';
import { getGameState } from '../core/gameState.js';

export type IconDrawFn = (g: Graphics, size: number) => void;

export interface StatusDisplayConfig {
  label: string;                // Human-readable name
  description: string;          // Tooltip description of the effect
  iconColor: number;            // Primary fill color for the icon
  bgColor: number;              // Badge background tint
  borderColor: number;          // Badge border color
  drawIcons: IconDrawFn[];      // Icon drawing functions (supports multiple icons per badge)
}

// ── Icon drawing helpers ──────────────────────────────────────────────

/** Bleed — three blood droplets */
function drawBleedIcon(g: Graphics, size: number): void {
  const s = size / 14;
  // Center droplet (larger)
  g.moveTo(7 * s, 1 * s)
    .quadraticCurveTo(11 * s, 7 * s, 7 * s, 11 * s)
    .quadraticCurveTo(3 * s, 7 * s, 7 * s, 1 * s)
    .closePath()
    .fill(0xef4444);
  // Left small droplet
  g.moveTo(2.5 * s, 5 * s)
    .quadraticCurveTo(4.5 * s, 8 * s, 2.5 * s, 10 * s)
    .quadraticCurveTo(0.5 * s, 8 * s, 2.5 * s, 5 * s)
    .closePath()
    .fill({ color: 0xef4444, alpha: 0.7 });
  // Right small droplet
  g.moveTo(11.5 * s, 5 * s)
    .quadraticCurveTo(13.5 * s, 8 * s, 11.5 * s, 10 * s)
    .quadraticCurveTo(9.5 * s, 8 * s, 11.5 * s, 5 * s)
    .closePath()
    .fill({ color: 0xef4444, alpha: 0.7 });
}

/** Shock — lightning bolt */
function drawShockIcon(g: Graphics, size: number): void {
  const s = size / 14;
  g.moveTo(8 * s, 0)
    .lineTo(4 * s, 6 * s)
    .lineTo(7 * s, 6 * s)
    .lineTo(5 * s, 14 * s)
    .lineTo(11 * s, 5 * s)
    .lineTo(8 * s, 5 * s)
    .lineTo(10 * s, 0)
    .closePath()
    .fill(0xfbbf24)
    .stroke({ width: 0.8, color: 0xd97706, alignment: 1 });
}

/** Radiation — trefoil hazard symbol (simplified) */
function drawRadiationIcon(g: Graphics, size: number): void {
  const s = size / 14;
  const cx = 7 * s;
  const cy = 7 * s;
  const r = 5.5 * s;
  // Three "petals" at 120° intervals
  for (let i = 0; i < 3; i++) {
    const angle = (i * 120 - 90) * Math.PI / 180;
    const nextAngle = ((i * 120 + 40) - 90) * Math.PI / 180;
    const x1 = cx + Math.cos(angle) * r;
    const y1 = cy + Math.sin(angle) * r;
    const x2 = cx + Math.cos(nextAngle) * r;
    const y2 = cy + Math.sin(nextAngle) * r;
    g.moveTo(cx, cy)
      .lineTo(x1, y1)
      .arcTo(
        cx + Math.cos((angle + nextAngle) / 2) * r * 1.3,
        cy + Math.sin((angle + nextAngle) / 2) * r * 1.3,
        x2, y2, r * 0.6
      )
      .lineTo(cx, cy)
      .closePath()
      .fill(0x22c55e);
  }
  // Center dot
  g.circle(cx, cy, 1.5 * s).fill(0x16a34a);
}

/** Fortify — small shield */
function drawFortifyIcon(g: Graphics, size: number): void {
  const s = size / 14;
  g.moveTo(7 * s, 1 * s)
    .lineTo(13 * s, 3 * s)
    .lineTo(12 * s, 9 * s)
    .lineTo(7 * s, 13 * s)
    .lineTo(2 * s, 9 * s)
    .lineTo(1 * s, 3 * s)
    .closePath()
    .fill(0x60a5fa)
    .stroke({ width: 1, color: 0x3b82f6, alignment: 1 });
}

/** Regeneration — medical plus */
function drawRegenerationIcon(g: Graphics, size: number): void {
  const s = size / 14;
  g.roundRect(1.5 * s, 1.5 * s, 11 * s, 11 * s, 2.5 * s)
    .fill({ color: 0x14532d, alpha: 0.9 })
    .stroke({ width: 1, color: 0x22c55e, alignment: 1 });
  g.moveTo(7 * s, 3.5 * s).lineTo(7 * s, 10.5 * s)
    .stroke({ width: 1.8 * s, color: 0x86efac });
  g.moveTo(3.5 * s, 7 * s).lineTo(10.5 * s, 7 * s)
    .stroke({ width: 1.8 * s, color: 0x86efac });
}

/** Disrupt — broken circle / static */
function drawDisruptIcon(g: Graphics, size: number): void {
  const s = size / 14;
  const cx = 7 * s;
  const cy = 7 * s;
  const r = 5 * s;
  // Draw broken arc segments
  for (let i = 0; i < 4; i++) {
    const startAngle = (i * 90 + 10) * Math.PI / 180;
    const endAngle = (i * 90 + 70) * Math.PI / 180;
    g.moveTo(
      cx + Math.cos(startAngle) * r,
      cy + Math.sin(startAngle) * r
    )
      .arc(cx, cy, r, startAngle, endAngle)
      .stroke({ width: 2 * s, color: 0xc084fc });
  }
  // Center X
  g.moveTo(5 * s, 5 * s).lineTo(9 * s, 9 * s)
    .stroke({ width: 1.5 * s, color: 0xc084fc });
  g.moveTo(9 * s, 5 * s).lineTo(5 * s, 9 * s)
    .stroke({ width: 1.5 * s, color: 0xc084fc });
}

/** Suppressed — broken arrow (ranged attack disrupted) */
function drawSuppressedIcon(g: Graphics, size: number): void {
  const s = size / 14;
  // Arrow shaft (broken in the middle)
  // Left half of shaft
  g.moveTo(1 * s, 7 * s)
    .lineTo(5.5 * s, 7 * s)
    .stroke({ width: 1.5 * s, color: 0xfb923c });
  // Right half of shaft (offset down to show break)
  g.moveTo(8.5 * s, 8 * s)
    .lineTo(11 * s, 8 * s)
    .stroke({ width: 1.5 * s, color: 0xfb923c });
  // Arrowhead (on right end, pointing right)
  g.moveTo(13 * s, 8 * s).lineTo(11 * s, 5 * s)
    .stroke({ width: 1.2 * s, color: 0xfb923c });
  g.moveTo(13 * s, 8 * s).lineTo(11 * s, 11 * s)
    .stroke({ width: 1.2 * s, color: 0xfb923c });
  // Fletching (on left end)
  g.moveTo(1 * s, 7 * s).lineTo(3 * s, 4 * s)
    .stroke({ width: 1 * s, color: 0xfb923c });
  g.moveTo(1 * s, 7 * s).lineTo(3 * s, 10 * s)
    .stroke({ width: 1 * s, color: 0xfb923c });
  // X mark at the break point to emphasize disruption
  g.moveTo(5.5 * s, 5 * s).lineTo(8.5 * s, 10 * s)
    .stroke({ width: 1.2 * s, color: 0xef4444 });
  g.moveTo(8.5 * s, 5 * s).lineTo(5.5 * s, 10 * s)
    .stroke({ width: 1.2 * s, color: 0xef4444 });
}

/** Small energy bolt icon (used as secondary icon for suppression) */
function drawEnergySmallIcon(g: Graphics, size: number): void {
  const s = size / 14;
  // Simple lightning bolt (energy)
  g.moveTo(8 * s, 0)
    .lineTo(4 * s, 7 * s)
    .lineTo(7 * s, 7 * s)
    .lineTo(6 * s, 14 * s)
    .lineTo(10 * s, 6 * s)
    .lineTo(7 * s, 6 * s)
    .lineTo(8 * s, 0)
    .closePath()
    .fill(0x38bdf8)
    .stroke({ width: 0.6, color: 0x0284c7, alignment: 1 });
}

/** Speed down — left-pointing broken arrow */
function drawSpeedDownIcon(g: Graphics, size: number): void {
  const s = size / 14;
  g.moveTo(10 * s, 1 * s)
    .lineTo(3 * s, 7 * s)
    .lineTo(10 * s, 13 * s)
    .lineTo(10 * s, 9 * s)
    .lineTo(6 * s, 7 * s)
    .lineTo(10 * s, 5 * s)
    .closePath()
    .fill(0xf87171)
    .stroke({ width: 0.8, color: 0xdc2626, alignment: 1 });
}

/** Damage Up — crosshair / reticle with up arrow (gear: +damage dealt) */
function drawDamageUpIcon(g: Graphics, size: number): void {
  const s = size / 14;
  const cx = 7 * s;
  const cy = 7 * s;
  const r = 5 * s;
  // Outer circle
  g.circle(cx, cy, r)
    .stroke({ width: 1.2 * s, color: 0xf87171 });
  // Crosshair lines
  g.moveTo(cx, cy - r + 1.5 * s).lineTo(cx, cy - 1.5 * s)
    .stroke({ width: 1 * s, color: 0xf87171 });
  g.moveTo(cx, cy + 1.5 * s).lineTo(cx, cy + r - 1.5 * s)
    .stroke({ width: 1 * s, color: 0xf87171 });
  g.moveTo(cx - r + 1.5 * s, cy).lineTo(cx - 1.5 * s, cy)
    .stroke({ width: 1 * s, color: 0xf87171 });
  g.moveTo(cx + 1.5 * s, cy).lineTo(cx + r - 1.5 * s, cy)
    .stroke({ width: 1 * s, color: 0xf87171 });
  // Center dot
  g.circle(cx, cy, 1.2 * s).fill(0xfca5a5);
}

/** Block Up — shield with upward arrow (gear: +block amount) */
function drawBlockUpIcon(g: Graphics, size: number): void {
  const s = size / 14;
  // Shield outline
  g.moveTo(7 * s, 1.5 * s)
    .lineTo(12 * s, 3.5 * s)
    .lineTo(11 * s, 9 * s)
    .lineTo(7 * s, 12.5 * s)
    .lineTo(3 * s, 9 * s)
    .lineTo(2 * s, 3.5 * s)
    .closePath()
    .fill(0x38bdf8)
    .stroke({ width: 1, color: 0x0ea5e9, alignment: 1 });
  // Up arrow inside shield
  g.moveTo(7 * s, 4.5 * s)
    .lineTo(7 * s, 10 * s)
    .stroke({ width: 1.5 * s, color: 0xffffff });
  g.moveTo(7 * s, 4.5 * s)
    .lineTo(5 * s, 6.5 * s)
    .stroke({ width: 1.2 * s, color: 0xffffff });
  g.moveTo(7 * s, 4.5 * s)
    .lineTo(9 * s, 6.5 * s)
    .stroke({ width: 1.2 * s, color: 0xffffff });
}

/** Thorns — spiky burst (retaliation damage) */
function drawThornsIcon(g: Graphics, size: number): void {
  const s = size / 14;
  const cx = 7 * s;
  const cy = 7 * s;
  const innerR = 2.5 * s;
  const outerR = 6 * s;

  for (let i = 0; i < 6; i++) {
    const angle = (i * 60 - 90) * Math.PI / 180;
    const nextAngle = ((i + 1) * 60 - 90) * Math.PI / 180;
    const tipX = cx + Math.cos(angle) * outerR;
    const tipY = cy + Math.sin(angle) * outerR;
    const baseX = cx + Math.cos(nextAngle) * innerR;
    const baseY = cy + Math.sin(nextAngle) * innerR;
    g.moveTo(cx, cy)
      .lineTo(tipX, tipY)
      .lineTo(baseX, baseY)
      .closePath();
  }
  g.fill(0xf59e0b)
    .stroke({ width: Math.max(1, size / 14), color: 0xb45309, alignment: 1 });
}

/** Speed up — right-pointing arrow (teal, matches existing speed icon) */
function drawSpeedUpIcon(g: Graphics, size: number): void {
  const s = size / 14;
  g.moveTo(4 * s, 1 * s)
    .lineTo(11 * s, 7 * s)
    .lineTo(4 * s, 13 * s)
    .lineTo(4 * s, 9 * s)
    .lineTo(8 * s, 7 * s)
    .lineTo(4 * s, 5 * s)
    .closePath()
    .fill(0x2dd4bf)
    .stroke({ width: 0.8, color: 0x0d9488, alignment: 1 });
}

// ── Registry ──────────────────────────────────────────────────────────

export const STATUS_DISPLAY: Record<string, StatusDisplayConfig> = {
  bleed: {
    label: 'Bleed',
    description: 'Takes damage equal to stacks at end of turn. Reduced by block.',
    iconColor: 0xef4444,
    bgColor: 0x3b1111,
    borderColor: 0x7f1d1d,
    drawIcons: [drawBleedIcon],
  },
  shock: {
    label: 'Shock',
    description: 'Takes damage equal to stacks at end of turn. Reduced by block.',
    iconColor: 0xfbbf24,
    bgColor: 0x3b2e11,
    borderColor: 0x78350f,
    drawIcons: [drawShockIcon],
  },
  radiation: {
    label: 'Radiation',
    description: 'Deals damage equal to stacks each turn (ignores block). Stacks halve each turn. Cannot be applied if target has block.',
    iconColor: 0x22c55e,
    bgColor: 0x113b1e,
    borderColor: 0x166534,
    drawIcons: [drawRadiationIcon],
  },
  fortify: {
    label: 'Fortify',
    description: 'Block decays slower. Each stack reduces block decay rate.',
    iconColor: 0x60a5fa,
    bgColor: 0x11223b,
    borderColor: 0x1e3a5f,
    drawIcons: [drawFortifyIcon],
  },
  regeneration: {
    label: 'Regeneration',
    description: 'Heals HP equal to stacks each tick.',
    iconColor: 0x22c55e,
    bgColor: 0x0f2f1e,
    borderColor: 0x15803d,
    drawIcons: [drawRegenerationIcon],
  },
  disrupt: {
    label: 'Disrupt',
    description: 'Interferes with abilities. May increase costs or reduce effectiveness.',
    iconColor: 0xc084fc,
    bgColor: 0x2e1146,
    borderColor: 0x581c87,
    drawIcons: [drawDisruptIcon],
  },
  suppressed: {
    label: 'Suppressed',
    description: 'An enemy is too close. Ranged cards (range 4+) cost extra energy.',
    iconColor: 0xfb923c,
    bgColor: 0x3b2211,
    borderColor: 0x9a3412,
    drawIcons: [drawSuppressedIcon, drawEnergySmallIcon],
  },
  speed_up: {
    label: 'Speed Up',
    description: 'Increased movement speed. Move further per energy spent.',
    iconColor: 0x2dd4bf,
    bgColor: 0x113b33,
    borderColor: 0x0d9488,
    drawIcons: [drawSpeedUpIcon],
  },
  speed_down: {
    label: 'Speed Down',
    description: 'Reduced movement speed. Costs more energy to move.',
    iconColor: 0xf87171,
    bgColor: 0x3b1111,
    borderColor: 0xdc2626,
    drawIcons: [drawSpeedDownIcon],
  },
  block_up: {
    label: 'Block Up',
    description: 'Gear bonus: block gained is increased.',
    iconColor: 0x38bdf8,
    bgColor: 0x0c2d44,
    borderColor: 0x0e4f6e,
    drawIcons: [drawBlockUpIcon],
  },
  damage_up: {
    label: 'Damage Up',
    description: 'Gear bonus: damage dealt is increased.',
    iconColor: 0xf87171,
    bgColor: 0x3b1111,
    borderColor: 0x7f1d1d,
    drawIcons: [drawDamageUpIcon],
  },
  thorns: {
    label: 'Thorns',
    description: 'When hit by unblocked attack damage, retaliates against the attacker.',
    iconColor: 0xf59e0b,
    bgColor: 0x3b250f,
    borderColor: 0xb45309,
    drawIcons: [drawThornsIcon],
  },
};

// ── Icon draw function registry (keyed by icon name from YAML) ───────

const ICON_DRAW_REGISTRY: Record<string, IconDrawFn[]> = {
  bleed: [drawBleedIcon],
  shock: [drawShockIcon],
  radiation: [drawRadiationIcon],
  fortify: [drawFortifyIcon],
  regeneration: [drawRegenerationIcon],
  disrupt: [drawDisruptIcon],
  suppressed: [drawSuppressedIcon, drawEnergySmallIcon],
  speed_up: [drawSpeedUpIcon],
  speed_down: [drawSpeedDownIcon],
  block_up: [drawBlockUpIcon],
  damage_up: [drawDamageUpIcon],
  thorns: [drawThornsIcon],
};

/**
 * Get the display config for a status ID.
 * Merges YAML-driven display data (description, colors) with code-side icon drawers.
 * Falls back to hardcoded STATUS_DISPLAY for statuses without YAML definitions.
 * Returns undefined for completely unknown statuses.
 */
export function getStatusDisplay(statusId: string): StatusDisplayConfig | undefined {
  const hardcoded = STATUS_DISPLAY[statusId];
  const def = getGameState().statusLibrary[statusId];

  if (!def?.display) return hardcoded;

  // Merge: YAML display data overrides hardcoded values, icon drawers come from code
  const iconKey = def.display.icon || statusId;
  const drawIcons = ICON_DRAW_REGISTRY[iconKey] ?? hardcoded?.drawIcons ?? [];

  return {
    label: def.name,
    description: def.description,
    iconColor: def.display.iconColor ?? hardcoded?.iconColor ?? 0xd1d5db,
    bgColor: def.display.bgColor ?? hardcoded?.bgColor ?? 0x1f2937,
    borderColor: def.display.borderColor ?? hardcoded?.borderColor ?? 0x374151,
    drawIcons,
  };
}
