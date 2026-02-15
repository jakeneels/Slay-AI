// Range icon for card display - crosshair/reticle style

import { Graphics } from 'pixi.js';

// Teal/cyan colours - distinct from damage (red) and heal (green)
const RANGE_FILL = 0x06b6d4;     // cyan-500
const RANGE_STROKE = 0x0e7490;   // cyan-700

/**
 * Create a crosshair/reticle range icon (scalable).
 *
 * Outer ring with four tick marks (N, S, E, W) and a centre dot.
 * Readable at 12-14 px. Positive coords, top-left origin, 14 × 14 grid.
 */
export function createRangeIcon(size: number = 14): Graphics {
  const g = new Graphics();
  const s = size / 14;
  const cx = 7 * s;
  const cy = 7 * s;
  const outerR = 6 * s;
  const innerR = 1.5 * s;
  const tickLen = 2 * s;
  const tickW = Math.max(1, size / 12);

  // Outer ring
  g.circle(cx, cy, outerR)
    .stroke({ width: tickW, color: RANGE_STROKE });

  // Tick marks (N, E, S, W)
  const ticks: [number, number, number, number][] = [
    [cx, cy - outerR - tickLen, cx, cy - outerR + 1],   // N
    [cx, cy + outerR - 1, cx, cy + outerR + tickLen],   // S
    [cx + outerR - 1, cy, cx + outerR + tickLen, cy],   // E
    [cx - outerR - tickLen, cy, cx - outerR + 1, cy],   // W
  ];
  for (const [x1, y1, x2, y2] of ticks) {
    g.moveTo(x1, y1).lineTo(x2, y2)
      .stroke({ width: tickW, color: RANGE_FILL });
  }

  // Centre dot
  g.circle(cx, cy, innerR)
    .fill(RANGE_FILL);

  g.eventMode = 'none';
  return g;
}
