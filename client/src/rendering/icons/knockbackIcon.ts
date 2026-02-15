// Knockback icon — bold push-arrow with impact burst lines

import { Graphics } from 'pixi.js';

const KB_FILL = 0xef4444;     // red
const KB_STROKE = 0xb91c1c;   // deep red outline
const KB_BURST = 0xfca5a5;    // lighter red for impact lines

/**
 * Create a knockback icon (scalable).
 *
 * Bold left-pointing filled arrow (triangular head + shaft)
 * with 3 short burst lines radiating from the tip.
 * Reads as "impact / push" — clearly different from the
 * thin right-pointing teal speed chevron.
 *
 * Design grid (14 × 14):
 *
 *       Burst    Arrow head        Shaft
 *        ╲
 *   ─── (3,7) → (8,1.5)     (8,4.5)━━(14,4.5)
 *        ╱       tip  ↘               │
 *                   (8,12.5)  (8,9.5)━━(14,9.5)
 */
export function createKnockbackIcon(size: number = 14): Graphics {
  const g = new Graphics();
  const s = size / 14;

  // Bold filled right-pointing arrow (head + shaft) — pushes enemy away
  g.moveTo(11 * s, 7 * s)        // tip (impact point)
    .lineTo(6 * s, 1.5 * s)      // head top
    .lineTo(6 * s, 4.5 * s)      // inner top
    .lineTo(0, 4.5 * s)          // shaft top-left
    .lineTo(0, 9.5 * s)          // shaft bottom-left
    .lineTo(6 * s, 9.5 * s)      // inner bottom
    .lineTo(6 * s, 12.5 * s)     // head bottom
    .closePath()
    .fill(KB_FILL)
    .stroke({ width: 1, color: KB_STROKE, alignment: 1 });

  // Impact burst lines radiating from near the tip
  const bw = Math.max(1, 1.5 * s);
  g.moveTo(11.5 * s, 5.5 * s).lineTo(13.5 * s, 2 * s)
    .stroke({ width: bw, color: KB_BURST });
  g.moveTo(12 * s, 7 * s).lineTo(14 * s, 7 * s)
    .stroke({ width: bw, color: KB_BURST });
  g.moveTo(11.5 * s, 8.5 * s).lineTo(13.5 * s, 12 * s)
    .stroke({ width: bw, color: KB_BURST });

  g.eventMode = 'none';
  return g;
}
