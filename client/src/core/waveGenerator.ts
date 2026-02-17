// Wave generator -- picks enemies for each wave based on a difficulty budget.
//
// Difficulty is computed JIT from CharacterDefinition stats so any YAML
// tweaks are immediately reflected in wave composition.

import type { Card, CharacterDefinition } from './types.js';
import { shuffleArray } from '../utils/shuffle.js';
import { getModifierRegistry } from './modifiers.js';

// ── Default tuning constants (overridable via modifier registry / dev panel) ──

/** Difficulty budget for wave 1. */
export const WAVE_BASE_BUDGET = 100;

/** Extra budget added per wave after the first. */
export const WAVE_BUDGET_INCREMENT = 20;

/** +/- jitter applied to the budget (fraction, e.g. 0.15 = 15%). */
export const WAVE_BUDGET_JITTER = 0.15;

/** Hard limits on enemies per wave. */
export const WAVE_MIN_ENEMIES = 2;
export const WAVE_MAX_ENEMIES = 4;

/** Rarity contribution to difficulty (higher = stronger cards). Unknown rarities default to 0. */
export const RARITY_WEIGHTS: Record<string, number> = {
  common: 0,
  rare: 0.3,
  epic: 0.6,
  legendary: 1,
  mythic: 1.3,
};

// ── Public API ───────────────────────────────────────────────────────

/**
 * Compute a numeric difficulty score for an enemy definition.
 * Higher = harder.  The formula weights HP heavily (survival time),
 * energy (action economy), speed (mobility), deck breadth, and card rarity.
 */
export function computeDifficulty(
  def: CharacterDefinition,
  cardLibrary?: Record<string, Card>,
): number {
  const s = def.stats;
  let base =
    s.maxHp * 0.5 +
    s.maxEnergy * 5 +
    (s.speed ?? 0) * 3 +
    (s.suppression ?? 0) * 2 +
    (s.suppressionResist ?? 0) * 1 +
    (def.startingDeck?.length ?? 2) * 2;

  const rarityScore = computeRarityScore(def, cardLibrary);
  return base + rarityScore;
}

/**
 * Sum of rarity weights for all cards in the character's deck (including copies).
 * Uses RARITY_WEIGHTS; unknown rarities default to 0.
 */
function computeRarityScore(
  def: CharacterDefinition,
  cardLibrary?: Record<string, Card>,
): number {
  if (!cardLibrary || !def.startingDeck?.length) return 0;
  let total = 0;
  for (const cardId of def.startingDeck) {
    const card = cardLibrary[cardId];
    if (!card) continue;
    const copies = card.copies ?? 1;
    const weight = RARITY_WEIGHTS[(card.rarity ?? 'common').toLowerCase()] ?? 0;
    total += weight * copies;
  }
  return total;
}

/**
 * Generate an enemy wave for the given wave number.
 *
 * @param waveNumber  Current wave (1-based).
 * @param enemyPool   All enemy CharacterDefinitions from the library.
 * @param previousIds Optional set of enemy IDs from the last wave (used to
 *                    avoid identical compositions back-to-back).
 * @param cardLibrary Optional card library for rarity-based difficulty (if omitted, rarity is ignored).
 * @returns Array of CharacterDefinitions to spawn (2-4 enemies).
 */
export function generateWave(
  waveNumber: number,
  enemyPool: CharacterDefinition[],
  previousIds?: string[],
  cardLibrary?: Record<string, Card>,
): CharacterDefinition[] {
  if (enemyPool.length === 0) return [];

  const reg = getModifierRegistry();

  // Resolve tuning constants through the modifier pipeline (dev panel overrides)
  const baseBudget = reg.resolve('wave_base_budget', WAVE_BASE_BUDGET);
  const increment = reg.resolve('wave_budget_increment', WAVE_BUDGET_INCREMENT);
  const jitterFrac = reg.resolve('wave_budget_jitter', WAVE_BUDGET_JITTER);
  const minEnemies = Math.round(reg.resolve('wave_min_enemies', WAVE_MIN_ENEMIES));
  const maxEnemies = Math.round(reg.resolve('wave_max_enemies', WAVE_MAX_ENEMIES));

  // Calculate budget with jitter
  const rawBudget = baseBudget + (waveNumber - 1) * increment;
  const jitter = 1 + (Math.random() * 2 - 1) * jitterFrac;
  const budget = Math.round(rawBudget * jitter);

  let picked = pickEnemies(enemyPool, budget, minEnemies, maxEnemies, cardLibrary);

  // Re-roll once if we got the exact same composition as last wave
  if (previousIds && isSameComposition(picked, previousIds) && enemyPool.length > 1) {
    picked = pickEnemies(enemyPool, budget, minEnemies, maxEnemies, cardLibrary);
  }

  return picked;
}

// ── Internal helpers ─────────────────────────────────────────────────

/**
 * Greedy enemy selection: shuffle the pool, then pick enemies one at a
 * time while the running difficulty total stays within budget.
 * Guarantees at least minEnemies and at most maxEnemies.
 */
function pickEnemies(
  pool: CharacterDefinition[],
  budget: number,
  minEnemies: number,
  maxEnemies: number,
  cardLibrary?: Record<string, Card>,
): CharacterDefinition[] {
  // Pre-compute difficulties (with rarity if cardLibrary provided)
  const scored = pool.map(def => ({
    def,
    diff: computeDifficulty(def, cardLibrary),
  }));

  // Sort ascending so we can always try to squeeze in one more
  scored.sort((a, b) => a.diff - b.diff);

  const candidates = shuffleArray(scored);
  const result: CharacterDefinition[] = [];
  let totalDiff = 0;

  for (const entry of candidates) {
    if (result.length >= maxEnemies) break;

    // Allow going over budget slightly for the minimum count
    if (result.length >= minEnemies && totalDiff + entry.diff > budget) {
      continue;
    }

    result.push(entry.def);
    totalDiff += entry.diff;
  }

  // If we didn't reach the minimum (very unlikely unless pool is tiny),
  // force-fill from the cheapest enemies.
  if (result.length < minEnemies) {
    const cheapest = [...scored]; // already sorted ascending
    for (const entry of cheapest) {
      if (result.length >= minEnemies) break;
      if (!result.includes(entry.def)) {
        result.push(entry.def);
      }
    }
    // If pool is smaller than minEnemies, allow duplicates
    if (result.length < minEnemies) {
      while (result.length < minEnemies && cheapest.length > 0) {
        result.push(cheapest[0].def);
      }
    }
  }

  return result;
}

/**
 * Check whether two compositions contain the same enemy IDs (order-independent).
 */
function isSameComposition(picked: CharacterDefinition[], previousIds: string[]): boolean {
  if (picked.length !== previousIds.length) return false;
  const a = [...picked.map(d => d.id)].sort();
  const b = [...previousIds].sort();
  return a.every((id, i) => id === b[i]);
}
