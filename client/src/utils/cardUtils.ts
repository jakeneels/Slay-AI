// Card utility functions

/**
 * Get color for card rarity
 */
export function getRarityColor(rarity: string): number {
  switch (rarity.toLowerCase()) {
    case 'common': return 0x22c55e;  // Green
    case 'rare': return 0x3b82f6;     // Blue
    case 'epic': return 0xa855f7;     // Purple
    case 'legendary': return 0xf59e0b; // Orange/Gold
    case 'mythic': return 0xff0080;   // Hot Pink
    default: return 0xffffff;         // White fallback
  }
}

