// Shared icons for the game UI

import { Graphics } from 'pixi.js';

/**
 * Create a right-pointing arrow speed icon (scalable).
 *
 * Clean 6-point hollow chevron: reads as "fast/speed" at any size.
 * Positive coords, top-left origin.
 *
 * Design grid (10 × 14):
 *   (0,0)
 *    \
 *     (7,7)  → tip
 *    /
 *   (0,14)
 *   (0,10)
 *    \
 *     (4,7)  → inner tip
 *    /
 *   (0,4)
 */
export function createSpeedIcon(size: number = 14): Graphics {
  const g = new Graphics();
  const s = size / 14;

  g.moveTo(0, 0)              // top-left
    .lineTo(7 * s, 7 * s)      // right tip
    .lineTo(0, 14 * s)         // bottom-left
    .lineTo(0, 10 * s)         // inner bottom
    .lineTo(4 * s, 7 * s)      // inner tip
    .lineTo(0, 4 * s)          // inner top
    .closePath()
    .fill(0x2dd4bf)             // bright teal
    .stroke({ width: 1, color: 0x0d9488, alignment: 1 }); // darker teal edge

  g.eventMode = 'none';
  return g;
}
