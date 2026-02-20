// Pure PIXI.js game - NO REACT
// Main entry point - coordinates all game modules

import { Application } from 'pixi.js';

// Core game modules
import type { Character } from './src/core/types.js';
import { getGameState, setGameState, addToCombatLog } from './src/core/gameState.js';
import { drawCards } from './src/core/deck.js';
import { shuffleArray } from './src/utils/shuffle.js';
import { loadContent } from './src/data/contentLoader.js';
import { render, setApp } from './src/rendering/renderer.js';
import {
  clearAllHoverStates,
  getHoveredCard,
  getHoveredCharacter,
  getHoveredStatus,
  setCardHoverPointerPosition,
} from './src/rendering/tooltipState.js';
import { getEnemyPreferredRangeDecisionForCardIds, setApp as setCombatApp } from './src/core/combat.js';
import { WIDTH, HEIGHT, ENEMY_SLOT_START, ALLY_SLOT_END, MAX_SLOTS, ENEMY_OPTIMAL_SPAWN_CHANCE } from './src/core/constants.js';
import { initDevPanel, restoreDevPanelOverridesFromStorage } from './src/rendering/devPanel.js';
import { getModifierRegistry } from './src/core/modifiers.js';
import { generateWave, computeDifficulty } from './src/core/waveGenerator.js';
import { beginPreFightSetup } from './src/core/preFight.js';

let currentApp: Application | null = null;
let initPromise: Promise<void> | null = null;
let responsiveLayoutCleanup: (() => void) | null = null;

function setupResponsiveCanvasScaling(app: Application, container: HTMLElement): () => void {
  const canvas = app.canvas as HTMLCanvasElement;
  let rafId: number | null = null;

  const applyScale = (): void => {
    rafId = null;
    const bounds = container.getBoundingClientRect();
    const availableWidth = Math.max(1, container.clientWidth);
    const availableHeight = Math.max(1, window.innerHeight - bounds.top);
    const scale = Math.min(availableWidth / WIDTH, availableHeight / HEIGHT);

    canvas.style.width = `${Math.round(WIDTH * scale)}px`;
    canvas.style.height = `${Math.round(HEIGHT * scale)}px`;
  };

  const queueScaleUpdate = (): void => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(applyScale);
  };

  const resizeObserver = new ResizeObserver(() => {
    queueScaleUpdate();
  });

  resizeObserver.observe(container);
  if (container.parentElement) {
    resizeObserver.observe(container.parentElement);
  }
  const devPanel = document.getElementById('devPanel');
  if (devPanel) {
    resizeObserver.observe(devPanel);
  }

  window.addEventListener('resize', queueScaleUpdate);
  queueScaleUpdate();

  return () => {
    window.removeEventListener('resize', queueScaleUpdate);
    resizeObserver.disconnect();
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}

function getOccupiedSlotsForPlacement(slotIndex: number, slotSize: number): number[] {
  return Array.from({ length: slotSize }, (_, i) => slotIndex + i);
}

function buildEnemyLaneCandidates(candidates: number[], desiredFrontSlot?: number): number[] {
  const primary = candidates.filter(slot => slot >= 8);
  const lane7 = candidates.filter(slot => slot === 7);
  const lane6 = candidates.filter(slot => slot === 6);
  if (primary.length === 0) {
    return [...lane7, ...lane6];
  }

  // Close-range intent gets a small chance to spawn in front lanes.
  // Otherwise, default to backline clustering in 8+.
  if (typeof desiredFrontSlot === 'number' && desiredFrontSlot <= 7) {
    const roll = Math.random();
    if (lane6.length > 0 && roll < 0.05) {
      return [...lane6, ...primary, ...lane7];
    }
    if (lane7.length > 0 && roll < 0.25) {
      return [...lane7, ...primary, ...lane6];
    }
  }

  return [...primary, ...lane7, ...lane6];
}

function findAvailableFrontSlot(
  characters: Character[],
  isPlayer: boolean,
  slotSize: number,
  desiredFrontSlot?: number,
): number | null {
  const sideMin = isPlayer ? 0 : ENEMY_SLOT_START;
  const sideMax = isPlayer ? ALLY_SLOT_END : MAX_SLOTS - 1;
  const maxFrontSlot = sideMax - slotSize + 1;
  // Allies place from the front, enemies place from the back.
  // This keeps enemies as far away from players as possible at combat start.
  const step = isPlayer ? 1 : -1;
  const start = isPlayer ? sideMin : maxFrontSlot;
  const endExclusive = isPlayer ? maxFrontSlot + 1 : sideMin - 1;
  const candidates: number[] = [];
  for (let frontSlot = start; frontSlot !== endExclusive; frontSlot += step) {
    candidates.push(frontSlot);
  }
  const orderedCandidates = isPlayer ? candidates : buildEnemyLaneCandidates(candidates, desiredFrontSlot);
  for (const frontSlot of orderedCandidates) {
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
      // Enemy tiebreak: prefer farther back. Ally tiebreak: prefer farther front.
      return isPlayer ? a - b : b - a;
    });

  const orderedCandidates = isPlayer ? candidates : buildEnemyLaneCandidates(candidates, clampedDesired);
  for (const frontSlot of orderedCandidates) {
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

/**
 * Clean up existing PIXI app
 */
function cleanup(): void {
  if (responsiveLayoutCleanup) {
    responsiveLayoutCleanup();
    responsiveLayoutCleanup = null;
  }

  if (currentApp) {
    // Destroy the PIXI app
    currentApp.destroy(true, { children: true, texture: true, baseTexture: true });
    currentApp = null;
  }
  
  // Remove any existing canvas from container
  const container = document.getElementById('gameCanvas');
  if (container) {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
  }
  
  // Clear app references
  setApp(null);
  setCombatApp(null);
}

/**
 * Initialize and start the game
 */
async function initGame(): Promise<void> {
  // Prevent concurrent init (e.g. from load + HMR racing)
  if (initPromise) {
    await initPromise;
    return;
  }
  
  initPromise = (async () => {
    try {
    // Clean up existing app if it exists (for hot reload)
    cleanup();
    
    const container = document.getElementById('gameCanvas');
    if (!container) {
      console.error('Game canvas container not found');
      return;
    }
    
    // Ensure container is empty before we append (guard against races)
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    
    // Initialize PIXI application
    const app = new Application();
    await app.init({
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: 0x1a1a1a,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  
  currentApp = app;
  const canvas = app.canvas as HTMLCanvasElement;
  canvas.style.pointerEvents = 'auto';
  container.appendChild(canvas);
  responsiveLayoutCleanup = setupResponsiveCanvasScaling(app, container);
  let lastHoverMoveLogAt = 0;
  let hoverMoveRenderQueued = false;
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const canvasX = rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * WIDTH : null;
    const canvasY = rect.height > 0 ? ((event.clientY - rect.top) / rect.height) * HEIGHT : null;
    setCardHoverPointerPosition(canvasX, canvasY);

    const hovered = getHoveredCard();
    const hoveredCharacter = getHoveredCharacter();
    const hoveredStatus = getHoveredStatus();
    const anyHoverActive = !!hovered.cardId || !!hoveredCharacter.characterId || !!hoveredStatus.statusId;
    if (!anyHoverActive) return;
    const now = Date.now();
    if (now - lastHoverMoveLogAt < 120) return;
    lastHoverMoveLogAt = now;
    if (!hoverMoveRenderQueued) {
      hoverMoveRenderQueued = true;
      requestAnimationFrame(() => {
        hoverMoveRenderQueued = false;
        render();
      });
    }
  });
  canvas.addEventListener('pointerleave', () => {
    setCardHoverPointerPosition(null, null);
  });
  // Use 'passive' so the stage passes events to children instead of capturing them
  app.stage.eventMode = 'passive';
  
  // Set app in modules that need it
  setApp(app);
  setCombatApp(app);
  
  // Clear modifier registry on re-init (HMR safety)
  getModifierRegistry().clearAll();
  // Restore persisted devpanel overrides before first wave generation.
  restoreDevPanelOverridesFromStorage();

  // Load content from YAML (also loads balance.yaml modifiers)
  const { cards, characters, gear, statuses } = await loadContent();
  const gameState = getGameState();
  gameState.cardLibrary = cards;
  gameState.characterLibrary = characters;
  gameState.gearLibrary = gear;
  gameState.statusLibrary = statuses;
  gameState.combatResult = 'ongoing';
  gameState.pendingReward = null;
  gameState.waveNumber = 1;
  setGameState(gameState);

  // Initialize characters from YAML — explicit party roster (back to front: Kael > Didi > Sable > Ted)
  const partyIds = ['tactician', 'corrupter', 'ashborn', 'techblade'];
  const playerCharacters = partyIds
    .map(id => characters[id])
    .filter((c): c is typeof characters[string] => !!c && c.isPlayer);

  // Generate first wave of enemies via difficulty budget
  const enemyPool = Object.values(characters).filter(c => !c.isPlayer);
  let enemyCharacters = generateWave(1, enemyPool, undefined, gameState.cardLibrary);
  // Kyle Wave 1 dev: spawn Actual Kyle first so his 3-slot footprint is placeable
  if (getModifierRegistry().resolve('acs_kyle_wave1', 0) >= 1) {
    enemyCharacters = [...enemyCharacters].sort((a, b) => {
      if (a.id === 'actual_kyle') return -1;
      if (b.id === 'actual_kyle') return 1;
      return 0;
    });
  }

  gameState.characters = [];

  /**
   * Build a deck from a character's startingDeck YAML definition.
   * Each card ID is expanded by its `copies` count from the card library.
   * Falls back to a basic ["strike", "defend"] deck if startingDeck is missing.
   */
  function buildDeckFromDefinition(charDef: any): string[] {
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

  // Add player characters on ally-side slots (from left).
  playerCharacters.forEach((charDef) => {
    const deck = shuffleArray(buildDeckFromDefinition(charDef));
    const slotSize = Math.max(1, Math.floor(charDef.slotSize ?? 1));
    const slotIndex = findAvailableFrontSlot(gameState.characters, true, slotSize);
    if (slotIndex === null) {
      console.warn(`No ally slot available for ${charDef.name} (slotSize ${slotSize}), skipping spawn`);
      return;
    }
    const character: Character = {
      id: charDef.id,
      name: charDef.name,
      hp: charDef.stats.hp,
      maxHp: charDef.stats.maxHp,
      energy: charDef.stats.energy,
      maxEnergy: charDef.stats.maxEnergy,
      deck,
      discardPile: [],
      hand: [],
      drawCount: 6,
      maxHandSize: 6,
      blockLayers: [],
      statuses: [],
      isPlayer: charDef.isPlayer,
      slotIndex,
      slotSize,
      speed: charDef.stats.speed ?? 0,
      moveCharges: 0,
      suppression: charDef.stats.suppression ?? 0,
      suppressionResist: charDef.stats.suppressionResist ?? 0,
      aggression: charDef.stats.aggression ?? 5,
      facing: 'right',
      gear: { weapon: null, armor: null, accessory: null },
    };

    // Draw initial hand
    drawCards(character, character.drawCount);

    gameState.characters.push(character);
  });

  // Add enemy characters on enemy-side slots (from backline first).
  // Larger enemies spawn first so multi-slot footprints can claim deep slots.
  gameState.enemyAiDebug.spawns = [];
  const enemyOptimalSpawnChance = Math.max(
    0,
    Math.min(1, getModifierRegistry().resolve('enemy_optimal_spawn_chance', ENEMY_OPTIMAL_SPAWN_CHANCE)),
  );
  const furthestAllyFrontSlot = gameState.characters
    .filter(c => c.isPlayer && c.hp > 0)
    .reduce((max, ally) => Math.max(max, ally.slotIndex), 0);
  const orderedEnemyCharacters = [...enemyCharacters].sort((a, b) => {
    if (a.id === 'actual_kyle') return -1;
    if (b.id === 'actual_kyle') return 1;
    const aSize = Math.max(1, Math.floor(a.slotSize ?? 1));
    const bSize = Math.max(1, Math.floor(b.slotSize ?? 1));
    return bSize - aSize;
  });
  const usedEnemyIds = new Set<string>();
  orderedEnemyCharacters.forEach((charDef, i) => {
    const deck = shuffleArray(buildDeckFromDefinition(charDef));
    const slotSize = Math.max(1, Math.floor(charDef.slotSize ?? 1));
    const shouldUseOptimalSpawn = Math.random() < enemyOptimalSpawnChance;
    let slotIndex: number | null = null;
    let desiredFrontSlot: number | null = null;
    let mode: 'forward_edge' | 'flexible' | 'max_optimal' = 'flexible';
    let targetRange = 1;
    const decision = getEnemyPreferredRangeDecisionForCardIds(
      charDef.startingDeck ?? [],
      charDef.stats.aggression ?? 5,
      gameState.cardLibrary,
    );
    mode = decision.mode;
    targetRange = decision.targetRange;
    desiredFrontSlot = furthestAllyFrontSlot + decision.targetRange;
    if (shouldUseOptimalSpawn) {
      slotIndex = findAvailableNearestSlot(gameState.characters, false, slotSize, desiredFrontSlot);
    }
    if (slotIndex === null) {
      slotIndex = findAvailableFrontSlot(gameState.characters, false, slotSize, desiredFrontSlot);
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
      drawCount: 6,
      maxHandSize: 6,
      blockLayers: [],
      statuses: [],
      isPlayer: charDef.isPlayer,
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

    // Draw initial hand
    drawCards(character, character.drawCount);

    gameState.characters.push(character);

    const enemyThreat = computeDifficulty(charDef, gameState.cardLibrary);
    addToCombatLog(`${character.name} appears! (Threat: ${Math.round(enemyThreat)})`);
  });
  
  const initialThreatScore = enemyCharacters.reduce(
    (sum, def) => sum + computeDifficulty(def, gameState.cardLibrary),
    0,
  );
  beginPreFightSetup({
    source: 'run_start',
    requiredLineupSize: 4,
    pendingThreatScore: initialThreatScore,
  });
  
  setGameState(gameState);
  
  // Initialize dev panel toggle
  initDevPanel();

  // Clear stuck hover states when the window/tab loses focus.
  // pointerleave won't fire if the user alt-tabs or clicks outside the browser,
  // so we listen for blur + visibilitychange and force a clean re-render.
  const clearHoverAndRender = () => {
    if (clearAllHoverStates()) render();
  };
  window.addEventListener('blur', clearHoverAndRender);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearHoverAndRender();
  });

  // Initial render
  render();

    } finally {
      initPromise = null;
    }
  })();
  
  await initPromise;
}

// Start the game
if (document.readyState === 'loading') {
  window.addEventListener('load', initGame);
} else {
  // DOM already loaded, run immediately
  initGame();
}

// Force full page reload on any change — cleaner than partial HMR for game state
if (import.meta.hot) {
  import.meta.hot.dispose(() => cleanup());
  import.meta.hot.invalidate();
}
