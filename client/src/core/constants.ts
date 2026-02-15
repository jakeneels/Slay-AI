// Game constants

export const WIDTH = 1200;
export const HEIGHT = 800;

// Battlefield slots: 8 total, 4 per side
export const MAX_SLOTS = 8;
export const SLOTS_PER_SIDE = 4;
export const ALLY_SLOT_END = 3;   // Allies occupy slots 0-3
export const ENEMY_SLOT_START = 4; // Enemies occupy slots 4-7

// Range modifier constants
// At optimal range: full bonus. Each slot away from optimal reduces the bonus.
// The modifier is multiplied against damage effects.
export const RANGE_OPTIMAL_BONUS = 0.20;        // +20% damage at optimal range
export const RANGE_PENALTY_PER_SLOT = 0.10;     // -10% per slot away from optimal
export const RANGE_MODIFIER_MIN = 0.70;          // Floor: never less than 70% damage
export const RANGE_MODIFIER_MAX = 1.0 + RANGE_OPTIMAL_BONUS; // Cap: 120% at optimal

/**
 * Calculate the range-based damage modifier for a card.
 *
 * - If the card has no optimalRange, returns 1.0 (no modifier).
 * - At optimalRange distance: returns RANGE_MODIFIER_MAX (1.20).
 * - Each slot away from optimal: loses RANGE_PENALTY_PER_SLOT (0.10).
 * - Never drops below RANGE_MODIFIER_MIN (0.70).
 *
 * @param distance     Absolute slot distance between caster and target
 * @param optimalRange The card's ideal range (undefined = no modifier)
 * @returns            Multiplier to apply to damage (0.70 – 1.20)
 */
export function calculateRangeModifier(distance: number, optimalRange?: number): number {
  if (optimalRange === undefined || optimalRange === null) return 1.0;
  const slotsFromOptimal = Math.abs(distance - optimalRange);
  const modifier = RANGE_MODIFIER_MAX - slotsFromOptimal * RANGE_PENALTY_PER_SLOT;
  return Math.max(RANGE_MODIFIER_MIN, Math.min(RANGE_MODIFIER_MAX, modifier));
}

