// Rarity indicator icons - distinct shapes for satisfying quality progression

import { Graphics } from 'pixi.js';
import { getRarityColor } from '../../utils/cardUtils.js';

/**
 * Create a rarity icon with a shape that scales with tier quality.
 * Common → Rare → Epic → Legendary → Mythic
 * circle → diamond → pentagon → hexagon → star
 * Size = radius/scale in pixels. Icon is drawn centered at (0,0).
 */
export function createRarityIcon(rarity: string, size: number = 8): Graphics {
  const g = new Graphics();
  const color = getRarityColor(rarity);
  const r = size;

  switch (rarity.toLowerCase()) {
    case 'common':
      // Simple circle
      g.circle(0, 0, r).fill(color);
      break;

    case 'rare':
      // Diamond — classic gem cut
      g.moveTo(0, -r)
        .lineTo(r, 0)
        .lineTo(0, r)
        .lineTo(-r, 0)
        .closePath()
        .fill(color);
      break;

    case 'epic': {
      // Pentagon — 5 sides, one step above diamond
      const sides = 5;
      for (let i = 0; i < sides; i++) {
        const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath().fill(color);
      break;
    }

    case 'legendary': {
      // Hexagon — 6 sides, prestigious
      const sides = 6;
      for (let i = 0; i < sides; i++) {
        const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath().fill(color);
      break;
    }

    case 'mythic': {
      // 4-point star — top tier
      const outer = r;
      const inner = r * 0.4;
      for (let i = 0; i < 8; i++) {
        const radius = i % 2 === 0 ? outer : inner;
        const angle = (i * Math.PI) / 4 - Math.PI / 2;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath().fill(color);
      break;
    }

    default:
      // Fallback: circle
      g.circle(0, 0, r).fill(color);
      break;
  }

  g.eventMode = 'none';
  return g;
}
