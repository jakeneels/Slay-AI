// Shared icons for the game UI

import { Graphics } from 'pixi.js';

// Amber/orange to match ember thorns and status display
const THORNS_FILL = 0xf59e0b;
const THORNS_STROKE = 0xb45309;

/**
 * Create a thorns icon (scalable).
 *
 * Spiky burst design: small center with 6 outward-pointing spikes,
 * evoking armor that retaliates when struck.
 * Symmetric, 14 × 14 design grid.
 */
export function createThornsIcon(size: number = 14): Graphics {
  const g = new Graphics();
  const s = size / 14;
  const cx = 7 * s;
  const cy = 7 * s;
  const innerR = 2.5 * s;
  const outerR = 6 * s;

  // Six spikes at 60° intervals
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
  g.fill(THORNS_FILL)
    .stroke({ width: Math.max(1, size / 14), color: THORNS_STROKE, alignment: 1 });

  g.eventMode = 'none';
  return g;
}
