// Shared icons for the game UI

import { Graphics } from 'pixi.js';

// Burning ground / hazard zone - warm orange-red
const HAZARD_FILL = 0xea580c;    // Amber-orange
const HAZARD_STROKE = 0xc2410c;  // Deep orange outline

/**
 * Create a lane hazard icon (scalable).
 * Horizontal ground fire / danger zone — represents hazards placed on a lane.
 * Flames spreading along a horizontal bar (the lane).
 *
 * 14 × 14 design grid, symmetric.
 *
 *     (2,4)   (7,1)   (12,4)   flame tips
 *       \     |     /
 *    (1,6)---(7,6)---(13,6)    fire bar
 *    (0,8)============(14,8)   ground line
 *    (2,10)  (7,12)  (12,10)   base
 */
export function createLaneHazardIcon(size: number = 14): Graphics {
  const g = new Graphics();
  const s = size / 14;

  // Main ground/fire bar with three flame tongues
  g.moveTo(0 * s, 8 * s)           // ground left
    .lineTo(1 * s, 6 * s)          // bar left
    .lineTo(2 * s, 4 * s)          // left flame tip
    .lineTo(4 * s, 6 * s)          // left flame base
    .lineTo(7 * s, 1 * s)          // centre flame tip
    .lineTo(10 * s, 6 * s)         // right flame base
    .lineTo(12 * s, 4 * s)         // right flame tip
    .lineTo(13 * s, 6 * s)         // bar right
    .lineTo(14 * s, 8 * s)         // ground right
    .lineTo(12 * s, 10 * s)        // base right
    .lineTo(7 * s, 12 * s)         // centre base
    .lineTo(2 * s, 10 * s)         // base left
    .closePath()
    .fill(HAZARD_FILL)
    .stroke({ width: Math.max(1, size / 12), color: HAZARD_STROKE, alignment: 1 });

  g.eventMode = 'none';
  return g;
}
