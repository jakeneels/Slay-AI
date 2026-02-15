// Shared icons for the game UI

import { Graphics } from 'pixi.js';

// Matches the block shield on character HP bars
const SHIELD_FILL = 0x60a5fa;    // Bright blue
const SHIELD_STROKE = 0x1e40af;  // Deep blue outline

/**
 * Create a shield / block icon (scalable).
 *
 * Classic kite-shield silhouette: flat top with chamfered corners,
 * wide upper body, tapering to a point at the bottom.
 * Symmetric about x = 7.  Positive coords, top-left origin.
 *
 * Design grid (14 × 14):
 *
 *      (3,0)----------(11,0)       flat top
 *     /                      \
 *   (1,2)                (13,2)    chamfered corners
 *    |                        |
 *   (1,5)                (13,5)    widest
 *     \                      /
 *      (3,9)          (11,9)       lower taper
 *          \          /
 *            (7,14)                bottom point
 */
export function createShieldIcon(size: number = 14): Graphics {
  const g = new Graphics();
  const s = size / 14;

  g.moveTo(3 * s, 0)             // top-left (after chamfer)
    .lineTo(11 * s, 0)           // top-right (before chamfer)
    .lineTo(13 * s, 2 * s)       // right chamfer corner
    .lineTo(13 * s, 5 * s)       // right side, upper
    .lineTo(11 * s, 9 * s)       // right side, lower taper
    .lineTo(7 * s, 14 * s)       // bottom point
    .lineTo(3 * s, 9 * s)        // left side, lower taper
    .lineTo(1 * s, 5 * s)        // left side, upper
    .lineTo(1 * s, 2 * s)        // left chamfer corner
    .closePath()
    .fill(SHIELD_FILL)
    .stroke({ width: Math.max(1, size / 12), color: SHIELD_STROKE, alignment: 1 });

  g.eventMode = 'none';
  return g;
}
