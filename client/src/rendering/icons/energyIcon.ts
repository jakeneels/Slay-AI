// Shared icons for the game UI

import { Graphics } from 'pixi.js';

/**
 * Create a lightning bolt energy icon (scalable).
 *
 * Uses the classic icon-library bolt silhouette (same shape as Font Awesome):
 * a 7-point polygon — upper diagonal, step, lower diagonal, then back.
 * No glow, no double-draws — just a clean filled shape.
 *
 *        1-------7
 *       /       /
 *      2---3   /
 *          |  6
 *          | /
 *          4---5   (5 is off to the right)
 *              ← but 5 goes back up to 6→7
 *
 * Coords (positive, top-left origin):
 *   1(3.6, 0)  2(0, 8)  3(4, 8)  4(1.2, 14.4)
 *   5(8.8, 5.6)  6(4, 5.6)  7(6.4, 0)
 */
export function createEnergyIcon(size: number = 14): Graphics {
  const g = new Graphics();
  const s = size / 14.4; // height of design = 14.4 → maps to `size`

  g.moveTo(3.6 * s, 0)        // 1  top-left
    .lineTo(0, 8 * s)          // 2  down-left
    .lineTo(4 * s, 8 * s)      // 3  step right
    .lineTo(1.2 * s, 14.4 * s) // 4  down-left (bottom tip)
    .lineTo(8.8 * s, 5.6 * s)  // 5  up-right
    .lineTo(4 * s, 5.6 * s)    // 6  step left
    .lineTo(6.4 * s, 0)        // 7  up-right (top)
    .closePath()
    .fill(0x38bdf8)             // bright electric blue
    .stroke({ width: 1, color: 0x0284c7, alignment: 1 }); // darker blue edge

  g.eventMode = 'none';
  return g;
}
