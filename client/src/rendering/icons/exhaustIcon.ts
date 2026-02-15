// Shared icons for the game UI

import { Graphics } from 'pixi.js';

// Warm orange flame - signals "burns away after use"
const EXHAUST_FILL = 0xf97316;    // Orange
const EXHAUST_STROKE = 0xc2410c;  // Deep orange outline

/**
 * Create a flame exhaust icon (scalable).
 * Classic STS-style flame — card is consumed after play.
 * Size = height in pixels. Uses positive coordinates (top-left origin).
 *
 * Three-tongue flame on a 14 × 14 grid, symmetric about x = 7.
 *
 *              (7,0)           centre tip
 *             / . . \
 *    (3.5,2.5)       (10.5,2.5)  side tips
 *      |  (5.5,6) (8.5,6)  |     notches
 *   (2,6)                (12,6)   outer shoulders
 *    (1,9)              (13,9)    widest
 *      (3,14)-------(11,14)       base
 */
export function createExhaustIcon(size: number = 12): Graphics {
  const g = new Graphics();
  const s = size / 14;

  g.moveTo(3 * s, 14 * s)          // base left
    .lineTo(1 * s, 9 * s)          // outer left (widest)
    .lineTo(2 * s, 6 * s)          // left shoulder
    .lineTo(3.5 * s, 2.5 * s)      // left tongue tip
    .lineTo(5.5 * s, 6 * s)        // notch left of centre
    .lineTo(7 * s, 0)              // centre tip
    .lineTo(8.5 * s, 6 * s)        // notch right of centre
    .lineTo(10.5 * s, 2.5 * s)     // right tongue tip
    .lineTo(12 * s, 6 * s)         // right shoulder
    .lineTo(13 * s, 9 * s)         // outer right (widest)
    .lineTo(11 * s, 14 * s)        // base right
    .closePath()
    .fill(EXHAUST_FILL)
    .stroke({ width: Math.max(1, size / 12), color: EXHAUST_STROKE, alignment: 1 });

  g.eventMode = 'none';
  return g;
}
