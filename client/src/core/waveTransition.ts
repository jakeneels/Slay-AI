// Wave transition -- handles the state reset between enemy waves.
//
// Called when the player clicks "Next Wave" after equipping gear.
// Preserves player characters (with partial heal) and spawns fresh enemies.

import type { Character, CharacterDefinition } from './types.js';
import { getGameState, addToCombatLog } from './gameState.js';
import { drawCards } from './deck.js';
import { shuffleArray } from '../utils/shuffle.js';
import { generateWave } from './waveGenerator.js';
import { getModifierRegistry } from './modifiers.js';
import { render } from '../rendering/renderer.js';
import { pickRandomMap } from '../rendering/renderBackground.js';

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
  gameState.currentMap = pickRandomMap(gameState.currentMap);
  addToCombatLog(`--- Wave ${gameState.waveNumber} ---`);

  // ── 2–4. Reset living allies ───────────────────────────────────────
  const livingAllies = gameState.characters.filter(c => c.isPlayer && c.hp > 0);

  const healFraction = getModifierRegistry().resolve('wave_heal_fraction', WAVE_HEAL_FRACTION);

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

    // Reset slot positions
    const allyIndex = livingAllies.indexOf(ally);
    ally.slotIndex = allyIndex;
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
  const waveDefs = generateWave(gameState.waveNumber, enemyPool, previousEnemyIds);

  const usedEnemyIds = new Set<string>();
  waveDefs.forEach((charDef, i) => {
    const deck = shuffleArray(buildDeckFromDefinition(charDef));

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
      slotIndex: 4 + i,
      speed: charDef.stats.speed ?? 0,
      moveCharges: 0,
      suppression: charDef.stats.suppression ?? 0,
      suppressionResist: charDef.stats.suppressionResist ?? 0,
      gear: { weapon: null, armor: null, accessory: null },
    };

    // Register cloned enemies in library so sprite lookup works
    if (character.id !== charDef.id) {
      gameState.characterLibrary[character.id] = charDef;
    }

    drawCards(character, character.drawCount);
    gameState.characters.push(character);

    addToCombatLog(`${character.name} appears!`);
  });

  // ── 7. Reset combat state ──────────────────────────────────────────
  gameState.combatResult = 'ongoing';
  gameState.pendingReward = null;
  gameState.isProcessingTurn = false;
  gameState.selectedCardId = null;
  gameState.turnIndex = 0;

  // Draw initial hands for allies
  for (const ally of livingAllies) {
    drawCards(ally, ally.drawCount);
  }

  // Set first living player as current
  const firstPlayer = gameState.characters.find(c => c.isPlayer && c.hp > 0);
  if (firstPlayer) {
    gameState.currentPlayerId = firstPlayer.id;
  }

  // ── 8. Re-render ───────────────────────────────────────────────────
  render();
}
