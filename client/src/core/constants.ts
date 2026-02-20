// Game constants
//
// Hard-coded defaults live here. Combat code resolves live values through the
// ModifierRegistry (see modifiers.ts), falling back to these defaults when no
// modifier overrides them.

import { getModifierRegistry } from './modifiers.js';
import type { ModifierContext } from './types.js';

export const WIDTH = 1440;
export const HEIGHT = 800;

// Battlefield slots: 12 total, 6 per side
export const MAX_SLOTS = 12;
export const SLOTS_PER_SIDE = 6;
export const ALLY_SLOT_END = SLOTS_PER_SIDE - 1; // Allies occupy slots 0..SLOTS_PER_SIDE-1
export const ENEMY_SLOT_START = SLOTS_PER_SIDE;  // Enemies occupy slots SLOTS_PER_SIDE..MAX_SLOTS-1

// Character sprite layout: slot x is left edge, visual center = x + SPRITE_CENTER
export const SPRITE_CENTER = 125;

// ── Default values (used as base for modifier resolution) ───────────

// Range modifier defaults
export const RANGE_OPTIMAL_BONUS = 0.20;        // +20% damage at optimal range
export const RANGE_PENALTY_PER_SLOT = 0.10;     // -10% per slot away from optimal
export const RANGE_MODIFIER_MIN = 0.70;          // Floor: never less than 70% damage
export const RANGE_MODIFIER_MAX = 1.0 + RANGE_OPTIMAL_BONUS; // Cap: 120% at optimal

// Suppression defaults
export const SUPPRESSION_DISTANCE = 2;          // Max slot distance for auto-suppression
export const SUPPRESSION_RANGED_THRESHOLD = 4;  // Cards with maxRange >= this are "ranged"
export const SUPPRESSION_BASE_COST = 1;         // Extra energy from proximity alone
export const SUPPRESSION_STACK_COST = 1;        // Extra energy per 'suppressed' status stack

// Jump defaults
export const JUMP_MAX_DISTANCE = MAX_SLOTS;     // Default: can jump to any board slot
export const JUMP_OCCUPIED_SLOT_COST = 1;       // Extra energy per occupied slot crossed

// Spawn positioning defaults
export const ENEMY_OPTIMAL_SPAWN_CHANCE = 0.7; // 0..1 chance enemies spawn using optimal-range positioning

// ── Resolved accessors ──────────────────────────────────────────────
// These pull the live value through the modifier pipeline.

export function getSuppressionDistance(ctx: ModifierContext = {}): number {
  return getModifierRegistry().resolve('suppression_distance', SUPPRESSION_DISTANCE, ctx);
}

export function getSuppressionRangedThreshold(ctx: ModifierContext = {}): number {
  return getModifierRegistry().resolve('suppression_ranged_threshold', SUPPRESSION_RANGED_THRESHOLD, ctx);
}

export function getSuppressionBaseCost(ctx: ModifierContext = {}): number {
  return getModifierRegistry().resolve('suppression_base_cost', SUPPRESSION_BASE_COST, ctx);
}

export function getSuppressionStackCost(ctx: ModifierContext = {}): number {
  return getModifierRegistry().resolve('suppression_stack_cost', SUPPRESSION_STACK_COST, ctx);
}

export function getJumpMaxDistance(ctx: ModifierContext = {}): number {
  return getModifierRegistry().resolve('jump_max_distance', JUMP_MAX_DISTANCE, ctx);
}

export function getJumpOccupiedSlotCost(ctx: ModifierContext = {}): number {
  return getModifierRegistry().resolve('jump_occupied_slot_cost', JUMP_OCCUPIED_SLOT_COST, ctx);
}

/**
 * Calculate the range-based damage modifier for a card.
 *
 * All range constants are resolved through the modifier pipeline so they
 * can be tuned globally or per-character via balance.yaml / dev panel.
 *
 * - If the card has no optimalRange, returns 1.0 (no modifier).
 * - At optimalRange distance: returns resolved RANGE_MODIFIER_MAX (default 1.20).
 * - Each slot away from optimal: loses resolved RANGE_PENALTY_PER_SLOT (default 0.10).
 * - Never drops below resolved RANGE_MODIFIER_MIN (default 0.70).
 *
 * @param distance     Absolute slot distance between caster and target
 * @param optimalRange The card's ideal range (undefined = no modifier)
 * @param ctx          Modifier context for per-character overrides
 * @returns            Multiplier to apply to damage
 */
export function calculateRangeModifier(distance: number, optimalRange?: number, ctx: ModifierContext = {}): number {
  if (optimalRange === undefined || optimalRange === null) return 1.0;

  const reg = getModifierRegistry();
  const bonus    = reg.resolve('range_optimal_bonus', RANGE_OPTIMAL_BONUS, ctx);
  const penalty  = reg.resolve('range_penalty_per_slot', RANGE_PENALTY_PER_SLOT, ctx);
  const floor    = reg.resolve('range_modifier_min', RANGE_MODIFIER_MIN, ctx);
  const cap      = reg.resolve('range_modifier_max', 1.0 + bonus, ctx);

  const slotsFromOptimal = Math.abs(distance - optimalRange);
  const modifier = cap - slotsFromOptimal * penalty;
  return Math.max(floor, Math.min(cap, modifier));
}

