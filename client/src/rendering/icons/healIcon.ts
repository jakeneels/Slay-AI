// Shared icons for the game UI

import { Graphics } from 'pixi.js';

/**
 * Create a medical cross heal icon (scalable).
 *
 * Clean 12-point plus/cross: universal "heal" symbol.
 * Positive coords, top-left origin.
 *
 * Design grid (14 × 14):
 *       (5,0)---(9,0)
 *        |       |
 *  (0,5)-+       +--(14,5)
 *   |                |
 *  (0,9)-+       +--(14,9)
 *        |       |
 *       (5,14)-(9,14)
 */
export function createHealIcon(size: number = 14): Graphics {
  const g = new Graphics();
  const s = size / 14;

  g.moveTo(5 * s, 0)           // top-left of top arm
    .lineTo(9 * s, 0)           // top-right of top arm
    .lineTo(9 * s, 5 * s)       // inner corner → right arm
    .lineTo(14 * s, 5 * s)      // right arm top
    .lineTo(14 * s, 9 * s)      // right arm bottom
    .lineTo(9 * s, 9 * s)       // inner corner → bottom arm
    .lineTo(9 * s, 14 * s)      // bottom arm right
    .lineTo(5 * s, 14 * s)      // bottom arm left
    .lineTo(5 * s, 9 * s)       // inner corner → left arm
    .lineTo(0, 9 * s)           // left arm bottom
    .lineTo(0, 5 * s)           // left arm top
    .lineTo(5 * s, 5 * s)       // inner corner → top arm
    .closePath()
    .fill(0x4ade80)              // bright green
    .stroke({ width: 1, color: 0x16a34a, alignment: 1 }); // darker green edge

  g.eventMode = 'none';
  return g;
}
