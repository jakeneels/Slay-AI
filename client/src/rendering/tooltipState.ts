// Tooltip hover state - module-level state that persists across re-renders
// Same pattern as selectedCardId in gameState.ts

// ── Card tooltip state ────────────────────────────────────────────────

let hoveredCardId: string | null = null;
let hoveredCardX: number = 0;
let hoveredCardY: number = 0;

/**
 * Set the currently hovered card (call from rarity icon pointerenter/pointerleave).
 * Returns true if the state actually changed (callers should only re-render on change).
 * @param cardId  Card template ID, or null to clear
 * @param x       X position of the rarity icon (for tooltip anchoring)
 * @param y       Y position of the rarity icon (for tooltip anchoring)
 */
export function setHoveredCard(cardId: string | null, x: number = 0, y: number = 0): boolean {
  if (hoveredCardId === cardId) return false; // no change — prevent re-render loops
  hoveredCardId = cardId;
  hoveredCardX = x;
  hoveredCardY = y;
  return true;
}

/**
 * Get the currently hovered card info
 */
export function getHoveredCard(): { cardId: string | null; x: number; y: number } {
  return { cardId: hoveredCardId, x: hoveredCardX, y: hoveredCardY };
}

// ── Status tooltip state ──────────────────────────────────────────────

let hoveredStatusId: string | null = null;
let hoveredStatusStacks: number = 0;
let hoveredStatusX: number = 0;
let hoveredStatusY: number = 0;

/**
 * Set the currently hovered status effect badge.
 * Returns true if the state actually changed.
 * @param statusId  Status ID, or null to clear
 * @param stacks    Current stack count / penalty value
 * @param x         X position of the badge center (for tooltip anchoring)
 * @param y         Y position of the badge top (for tooltip anchoring)
 */
export function setHoveredStatus(statusId: string | null, stacks: number = 0, x: number = 0, y: number = 0): boolean {
  if (hoveredStatusId === statusId) return false;
  hoveredStatusId = statusId;
  hoveredStatusStacks = stacks;
  hoveredStatusX = x;
  hoveredStatusY = y;
  return true;
}

/**
 * Get the currently hovered status info
 */
export function getHoveredStatus(): { statusId: string | null; stacks: number; x: number; y: number } {
  return { statusId: hoveredStatusId, stacks: hoveredStatusStacks, x: hoveredStatusX, y: hoveredStatusY };
}

// ── Global clear ─────────────────────────────────────────────────────

/**
 * Clear all hover states at once (e.g. on window blur / visibility change).
 * Returns true if anything was actually cleared.
 */
export function clearAllHoverStates(): boolean {
  const hadCard = hoveredCardId !== null;
  const hadStatus = hoveredStatusId !== null;

  hoveredCardId = null;
  hoveredCardX = 0;
  hoveredCardY = 0;

  hoveredStatusId = null;
  hoveredStatusStacks = 0;
  hoveredStatusX = 0;
  hoveredStatusY = 0;

  return hadCard || hadStatus;
}
