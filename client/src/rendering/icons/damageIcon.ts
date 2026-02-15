// Shared icons for the game UI

import { Graphics } from 'pixi.js';

// Bold, aggressive red - stands out like a wound
const DAMAGE_FILL = 0xdc2626;    // saturated red
const DAMAGE_STROKE = 0x991b1b;  // deep red outline

/**
 * Create a sword damage icon (scalable).
 *
 * Wide triangular blade, bold crossguard, short grip & pommel.
 * Symmetric and readable even at 14 px.
 * Positive coords, top-left origin, 14 × 14 design grid.
 *
 *           (7,0)           blade tip
 *          / ... \
 *     (3.5,7)---(10.5,7)   blade base
 *   (1,7)============(13,7)  crossguard
 *   (1,8.5)==========(13,8.5)
 *       (5.5,8.5)--(8.5,8.5) grip top
 *       (5.5,12)----(8.5,12) grip bottom
 *            (7,14)          pommel
 */
export function createDamageIcon(size: number = 14): Graphics {
  const g = new Graphics();
  const s = size / 14;

  g.moveTo(7 * s, 0)              // blade tip
    .lineTo(10.5 * s, 7 * s)      // blade right edge
    .lineTo(13 * s, 7 * s)        // crossguard right, top
    .lineTo(13 * s, 8.5 * s)      // crossguard right, bottom
    .lineTo(8.5 * s, 8.5 * s)     // grip top right
    .lineTo(8.5 * s, 12 * s)      // grip bottom right
    .lineTo(7 * s, 14 * s)        // pommel point
    .lineTo(5.5 * s, 12 * s)      // grip bottom left
    .lineTo(5.5 * s, 8.5 * s)     // grip top left
    .lineTo(1 * s, 8.5 * s)       // crossguard left, bottom
    .lineTo(1 * s, 7 * s)         // crossguard left, top
    .lineTo(3.5 * s, 7 * s)       // blade left edge
    .closePath()
    .fill(DAMAGE_FILL)
    .stroke({ width: Math.max(1, size / 12), color: DAMAGE_STROKE, alignment: 1 });

  g.eventMode = 'none';
  return g;
}
