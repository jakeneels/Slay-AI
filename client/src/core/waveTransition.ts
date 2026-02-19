// Wave transition -- handles the state reset between enemy waves.
//
// Called when the player clicks "Next Wave" after equipping gear.
// Preserves player characters (with partial heal) and spawns fresh enemies.

import type { Character, CharacterDefinition } from './types.js';
import { getGameState, addToCombatLog } from './gameState.js';
import { drawCards } from './deck.js';
import { shuffleArray } from '../utils/shuffle.js';
import { generateWave, computeDifficulty } from './waveGenerator.js';
import { getModifierRegistry } from './modifiers.js';
import { render } from '../rendering/renderer.js';
import { pickRandomMap } from '../rendering/renderBackground.js';
import { ENEMY_SLOT_START, ALLY_SLOT_END, MAX_SLOTS, ENEMY_OPTIMAL_SPAWN_CHANCE } from './constants.js';
import { buildTurnQueue, getEnemyPreferredRangeDecisionForCardIds, processEnemyTurn } from './combat.js';

// ── Default tuning (overridable via modifier registry / dev panel) ───

/** Fraction of missing HP recovered between waves (0-1). */
export const WAVE_HEAL_FRACTION = 0.5;

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Build a deck from a character's startingDeck definition.
 * Each card ID is expanded by its `copies` count from the card library.
 */
function buildDeckFromDefinition(charDef: CharacterDefinition): string[] {
  const gameState = getGameState();
  const startingDeck: string[] = charDef.startingDeck ?? ['strike', 'defend'];
  const deck: string[] = [];
  for (const id of startingDeck) {
    const card = gameState.cardLibrary[id];
    if (!card) {
      console.warn(`Card "${id}" in startingDeck for ${charDef.name} not found in library, skipping`);
      continue;
    }
    const copies = card.copies ?? 1;
    for (let c = 0; c < copies; c++) {
      deck.push(id);
    }
  }
  return deck;
}

/**
 * Clean up card instances that belong to a set of instance IDs.
 */
function cleanupCardInstances(instanceIds: string[]): void {
  const gameState = getGameState();
  for (const id of instanceIds) {
    delete gameState.cardInstances[id];
  }
}

function getOccupiedSlotsForPlacement(slotIndex: number, slotSize: number): number[] {
  return Array.from({ length: slotSize }, (_, i) => slotIndex + i);
}

function findAvailableFrontSlot(characters: Character[], isPlayer: boolean, slotSize: number): number | null {
  const sideMin = isPlayer ? 0 : ENEMY_SLOT_START;
  const sideMax = isPlayer ? ALLY_SLOT_END : MAX_SLOTS - 1;
  const maxFrontSlot = sideMax - slotSize + 1;
  // Allies place from the front, enemies place from the back.
  // This keeps enemies as far away from players as possible at wave start.
  const step = isPlayer ? 1 : -1;
  const start = isPlayer ? sideMin : maxFrontSlot;
  const endExclusive = isPlayer ? maxFrontSlot + 1 : sideMin - 1;
  for (let frontSlot = start; frontSlot !== endExclusive; frontSlot += step) {
    const candidateSlots = getOccupiedSlotsForPlacement(frontSlot, slotSize);
    const blocked = characters.some(existing => {
      if (existing.hp <= 0 || existing.isPlayer !== isPlayer) return false;
      const existingSize = Math.max(1, Math.floor(existing.slotSize ?? 1));
      const existingSlots = getOccupiedSlotsForPlacement(existing.slotIndex, existingSize);
      return existingSlots.some(slot => candidateSlots.includes(slot));
    });
    if (!blocked) return frontSlot;
  }
  return null;
}

function findAvailableNearestSlot(
  characters: Character[],
  isPlayer: boolean,
  slotSize: number,
  desiredFrontSlot: number,
): number | null {
  const sideMin = isPlayer ? 0 : ENEMY_SLOT_START;
  const sideMax = isPlayer ? ALLY_SLOT_END : MAX_SLOTS - 1;
  const maxFrontSlot = sideMax - slotSize + 1;
  const clampedDesired = Math.max(sideMin, Math.min(maxFrontSlot, desiredFrontSlot));
  const candidates = Array.from({ length: maxFrontSlot - sideMin + 1 }, (_, i) => sideMin + i)
    .sort((a, b) => {
      const aDist = Math.abs(a - clampedDesired);
      const bDist = Math.abs(b - clampedDesired);
      if (aDist !== bDist) return aDist - bDist;
      return isPlayer ? a - b : b - a;
    });

  for (const frontSlot of candidates) {
    const candidateSlots = getOccupiedSlotsForPlacement(frontSlot, slotSize);
    const blocked = characters.some(existing => {
      if (existing.hp <= 0 || existing.isPlayer !== isPlayer) return false;
      const existingSize = Math.max(1, Math.floor(existing.slotSize ?? 1));
      const existingSlots = getOccupiedSlotsForPlacement(existing.slotIndex, existingSize);
      return existingSlots.some(slot => candidateSlots.includes(slot));
    });
    if (!blocked) return frontSlot;
  }
  return null;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Transition to the next wave:
 *  1. Increment wave counter
 *  2. Partially heal living allies (50% of missing HP)
 *  3. Clear ally combat state (statuses, block, energy)
 *  4. Reshuffle ally decks (hand + discard -> deck, shuffle)
 *  5. Remove all enemy characters
 *  6. Generate a new enemy wave via difficulty budget
 *  7. Reset combat state and draw initial hands
 *  8. Re-render
 */
export function startNextWave(): void {
  const gameState = getGameState();

  // ── 1. Increment wave number & rotate map ─────────────────────────
  gameState.waveNumber++;
  gameState.currentMap = pickRandomMap(gameState.currentMap, gameState.waveNumber);

  // ── 2–4. Reset living allies ───────────────────────────────────────
  const livingAllies = gameState.characters.filter(c => c.isPlayer && c.hp > 0);

  const healFraction = getModifierRegistry().resolve('wave_heal_fraction', WAVE_HEAL_FRACTION);

  const slottedAllies: Character[] = [];
  for (const ally of livingAllies) {
    // Partial heal based on configured fraction of missing HP
    const missingHp = ally.maxHp - ally.hp;
    const healAmount = Math.floor(missingHp * healFraction);
    if (healAmount > 0) {
      ally.hp += healAmount;
      addToCombatLog(`${ally.name} recovers ${healAmount} HP (${ally.hp}/${ally.maxHp})`);
    }

    // Clear combat state
    ally.blockLayers = [];
    ally.statuses = [];
    ally.moveCharges = 0;
    ally.energy = ally.maxEnergy;

    // Collect template IDs from hand instances before cleanup
    const handInstanceIds = [...ally.hand];
    const handTemplateIds = handInstanceIds
      .map(id => gameState.cardInstances[id]?.templateId)
      .filter((id): id is string => !!id);

    // Clean up card instances
    cleanupCardInstances(handInstanceIds);

    const allTemplateIds = [...ally.discardPile, ...handTemplateIds];

    // Reset hand and discard
    ally.hand = [];
    ally.discardPile = [];

    // Rebuild full deck from character definition (cleaner than partial merge)
    const charDef = gameState.characterLibrary[ally.id];
    if (charDef) {
      ally.deck = shuffleArray(buildDeckFromDefinition(charDef));
    } else {
      // Fallback: merge what we have and shuffle
      ally.deck = shuffleArray([...ally.deck, ...allTemplateIds]);
    }

    const slotSize = Math.max(1, Math.floor(ally.slotSize ?? 1));
    ally.slotSize = slotSize;
    const allySlot = findAvailableFrontSlot(slottedAllies, true, slotSize);
    if (allySlot !== null) {
      ally.slotIndex = allySlot;
      slottedAllies.push(ally);
    } else {
      console.warn(`No ally slot available for ${ally.name} (slotSize ${slotSize}), keeping previous slot`);
    }
  }

  // ── 5. Remove all enemies ──────────────────────────────────────────
  // Clean up enemy card instances
  const enemies = gameState.characters.filter(c => !c.isPlayer);
  for (const enemy of enemies) {
    cleanupCardInstances([...enemy.hand]);
  }

  // Keep only living allies
  gameState.characters = gameState.characters.filter(c => c.isPlayer && c.hp > 0);

  // ── 6. Generate new enemy wave ─────────────────────────────────────
  const enemyPool = Object.values(gameState.characterLibrary).filter(
    c => !c.isPlayer,
  );
  const previousEnemyIds = enemies.map(e => e.id);
  const waveDefs = generateWave(
    gameState.waveNumber,
    enemyPool,
    previousEnemyIds,
    gameState.cardLibrary,
  );
  const acsWave4BossEnabled =
    getModifierRegistry().resolve('acs_wave4_boss', 0) >= 1 &&
    gameState.waveNumber === 4;
  const acsKyleWave1Enabled =
    getModifierRegistry().resolve('acs_kyle_wave1', 0) >= 1 &&
    gameState.waveNumber === 1;
  // Place larger enemies first so 2- and 3-slot footprints can claim the deepest slots.
  // Keep Kyle first when his dev toggles are active.
  const orderedWaveDefs = [...waveDefs].sort((a, b) => {
    if (acsWave4BossEnabled || acsKyleWave1Enabled) {
      if (a.id === 'actual_kyle') return -1;
      if (b.id === 'actual_kyle') return 1;
    }
    const aSize = Math.max(1, Math.floor(a.slotSize ?? 1));
    const bSize = Math.max(1, Math.floor(b.slotSize ?? 1));
    return bSize - aSize;
  });
  const threatScore = waveDefs.reduce(
    (sum, def) => sum + computeDifficulty(def, gameState.cardLibrary),
    0,
  );
  addToCombatLog(`--- Wave ${gameState.waveNumber} --- (Threat: ${Math.round(threatScore)})`);

  gameState.enemyAiDebug.spawns = [];
  const enemyOptimalSpawnChance = Math.max(
    0,
    Math.min(1, getModifierRegistry().resolve('enemy_optimal_spawn_chance', ENEMY_OPTIMAL_SPAWN_CHANCE)),
  );
  const furthestAllyFrontSlot = gameState.characters
    .filter(c => c.isPlayer && c.hp > 0)
    .reduce((max, ally) => Math.max(max, ally.slotIndex), 0);
  const usedEnemyIds = new Set<string>();
  orderedWaveDefs.forEach((charDef, i) => {
    const deck = shuffleArray(buildDeckFromDefinition(charDef));
    const slotSize = Math.max(1, Math.floor(charDef.slotSize ?? 1));
    const shouldUseOptimalSpawn = Math.random() < enemyOptimalSpawnChance;
    let slotIndex: number | null = null;
    let desiredFrontSlot: number | null = null;
    let mode: 'forward_edge' | 'flexible' | 'max_optimal' = 'flexible';
    let targetRange = 1;
    if (shouldUseOptimalSpawn) {
      const decision = getEnemyPreferredRangeDecisionForCardIds(
        charDef.startingDeck ?? [],
        charDef.stats.aggression ?? 5,
        gameState.cardLibrary,
      );
      mode = decision.mode;
      targetRange = decision.targetRange;
      desiredFrontSlot = furthestAllyFrontSlot + decision.targetRange;
      slotIndex = findAvailableNearestSlot(gameState.characters, false, slotSize, desiredFrontSlot);
    }
    if (slotIndex === null) {
      slotIndex = findAvailableFrontSlot(gameState.characters, false, slotSize);
      if (!shouldUseOptimalSpawn) {
        const decision = getEnemyPreferredRangeDecisionForCardIds(
          charDef.startingDeck ?? [],
          charDef.stats.aggression ?? 5,
          gameState.cardLibrary,
        );
        mode = decision.mode;
        targetRange = decision.targetRange;
      }
    }
    if (slotIndex === null) {
      console.warn(`No enemy slot available for ${charDef.name} (slotSize ${slotSize}), skipping spawn`);
      return;
    }

    // Ensure unique IDs when the same enemy type appears more than once
    let id = charDef.id;
    if (usedEnemyIds.has(id)) {
      id = `${charDef.id}_${i}`;
    }
    usedEnemyIds.add(id);

    const character: Character = {
      id,
      name: charDef.name,
      hp: charDef.stats.hp,
      maxHp: charDef.stats.maxHp,
      energy: charDef.stats.energy,
      maxEnergy: charDef.stats.maxEnergy,
      deck,
      discardPile: [],
      hand: [],
      drawCount: 5,
      maxHandSize: 5,
      blockLayers: [],
      statuses: [],
      isPlayer: false,
      slotIndex,
      slotSize,
      speed: charDef.stats.speed ?? 0,
      moveCharges: 0,
      suppression: charDef.stats.suppression ?? 0,
      suppressionResist: charDef.stats.suppressionResist ?? 0,
      aggression: charDef.stats.aggression ?? 5,
      facing: 'left',
      gear: { weapon: null, armor: null, accessory: null },
    };

    // Register cloned enemies in library so sprite lookup works
    if (character.id !== charDef.id) {
      gameState.characterLibrary[character.id] = charDef;
    }

    gameState.enemyAiDebug.spawns.push({
      enemyId: character.id,
      enemyName: character.name,
      waveNumber: gameState.waveNumber,
      aggression: character.aggression,
      mode,
      targetRange,
      usedOptimalSpawn: shouldUseOptimalSpawn,
      desiredFrontSlot,
      finalFrontSlot: character.slotIndex,
    });

    drawCards(character, character.drawCount);
    gameState.characters.push(character);

    const enemyThreat = computeDifficulty(charDef, gameState.cardLibrary);
    addToCombatLog(`${character.name} appears! (Threat: ${Math.round(enemyThreat)})`);
  });

  // ── 7. Reset combat state ──────────────────────────────────────────
  gameState.combatResult = 'ongoing';
  gameState.pendingReward = null;
  gameState.isProcessingTurn = false;
  gameState.selectedCardId = null;
  gameState.turnIndex = 0;
  gameState.roundNumber = 0;
  gameState.playedCardsStack = [];
  // Stage transition should fully clear lingering lane hazards (fire, etc.).
  gameState.laneHazards = [];

  // Draw initial hands for allies
  for (const ally of livingAllies) {
    drawCards(ally, ally.drawCount);
  }

  // Build initial speed-based turn queue
  gameState.turnQueue = buildTurnQueue();
  gameState.turnQueueIndex = 0;
  gameState.roundNumber = 1;
  addToCombatLog(`── Round 1 ── (Threat: ${Math.round(threatScore)})`);

  // Set first character in queue as current player
  if (gameState.turnQueue.length > 0) {
    gameState.currentPlayerId = gameState.turnQueue[0];
  }

  // ── 8. Re-render ───────────────────────────────────────────────────
  render();

  // If the first character in the queue is an enemy, trigger their AI
  if (gameState.turnQueue.length > 0) {
    const firstChar = gameState.characters.find(c => c.id === gameState.turnQueue[0]);
    if (firstChar && !firstChar.isPlayer) {
      setTimeout(() => processEnemyTurn(firstChar, render), 1000);
    }
  }
}
