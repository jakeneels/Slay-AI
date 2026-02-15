// Pull icon — bold right-pointing arrow with hook/lasso lines
// Mirror of the knockback icon but in cyan, representing "pull toward caster"

import { Graphics } from 'pixi.js';

const PULL_FILL = 0x22d3ee;     // cyan
const PULL_STROKE = 0x0891b2;   // deep cyan outline
const PULL_BURST = 0x67e8f9;    // lighter cyan for hook lines

/**
 * Create a pull icon (scalable).
 *
 * Bold right-pointing filled arrow (triangular head + shaft)
 * with 3 short hook lines radiating from the tip.
 * Reads as "pull / lasso" — clearly the reverse of the
 * left-pointing red knockback arrow.
 *
 * Design grid (14 × 14):
 *
 *   Shaft       Arrow head       Hook
 *   (0,4.5)━━(6,4.5)
 *              │       (6,1.5)
 *              │            ↘      ╱
 *   (0,9.5)━━(6,9.5)  (11,7) ── burst
 *                     (6,12.5) ╲
 */
export function createPullIcon(size: number = 14): Graphics {
  const g = new Graphics();
  const s = size / 14;

  // Bold filled left-pointing arrow (head + shaft) — pulls enemy toward allies
  g.moveTo(3 * s, 7 * s)         // tip (pull point)
    .lineTo(8 * s, 1.5 * s)      // head top
    .lineTo(8 * s, 4.5 * s)      // inner top
    .lineTo(14 * s, 4.5 * s)     // shaft top-right
    .lineTo(14 * s, 9.5 * s)     // shaft bottom-right
    .lineTo(8 * s, 9.5 * s)      // inner bottom
    .lineTo(8 * s, 12.5 * s)     // head bottom
    .closePath()
    .fill(PULL_FILL)
    .stroke({ width: 1, color: PULL_STROKE, alignment: 1 });

  // Hook lines radiating from near the tip
  const bw = Math.max(1, 1.5 * s);
  g.moveTo(2.5 * s, 5.5 * s).lineTo(0.5 * s, 2 * s)
    .stroke({ width: bw, color: PULL_BURST });
  g.moveTo(2 * s, 7 * s).lineTo(0, 7 * s)
    .stroke({ width: bw, color: PULL_BURST });
  g.moveTo(2.5 * s, 8.5 * s).lineTo(0.5 * s, 12 * s)
    .stroke({ width: bw, color: PULL_BURST });

  g.eventMode = 'none';
  return g;
}
