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
import { clearAllHoverStates, getHoveredCard, getHoveredCharacter, getHoveredStatus } from './src/rendering/tooltipState.js';
import { setApp as setCombatApp } from './src/core/combat.js';
import { WIDTH, HEIGHT, ENEMY_SLOT_START, ALLY_SLOT_END, MAX_SLOTS } from './src/core/constants.js';
import { initDevPanel, restoreDevPanelOverridesFromStorage } from './src/rendering/devPanel.js';
import { getModifierRegistry } from './src/core/modifiers.js';
import { generateWave, computeDifficulty } from './src/core/waveGenerator.js';
import { beginPreFightSetup } from './src/core/preFight.js';

let currentApp: Application | null = null;
let initPromise: Promise<void> | null = null;

function getOccupiedSlotsForPlacement(slotIndex: number, slotSize: number): number[] {
  return Array.from({ length: slotSize }, (_, i) => slotIndex + i);
}

function findAvailableFrontSlot(characters: Character[], isPlayer: boolean, slotSize: number): number | null {
  const sideMin = isPlayer ? 0 : ENEMY_SLOT_START;
  const sideMax = isPlayer ? ALLY_SLOT_END : MAX_SLOTS - 1;
  const maxFrontSlot = sideMax - slotSize + 1;
  for (let frontSlot = sideMin; frontSlot <= maxFrontSlot; frontSlot++) {
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
  let lastHoverMoveLogAt = 0;
  let hoverMoveRenderQueued = false;
  canvas.addEventListener('pointermove', (ev: PointerEvent) => {
    const hovered = getHoveredCard();
    const hoveredCharacter = getHoveredCharacter();
    const hoveredStatus = getHoveredStatus();
    const anyHoverActive = !!hovered.cardId || !!hoveredCharacter.characterId || !!hoveredStatus.statusId;
    if (!anyHoverActive) return;
    const now = Date.now();
    if (now - lastHoverMoveLogAt < 120) return;
    lastHoverMoveLogAt = now;
    const rect = canvas.getBoundingClientRect();
    const canvasX = ev.clientX - rect.left;
    const canvasY = ev.clientY - rect.top;
    if (hovered.cardId) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre2',hypothesisId:'N2',location:'game.ts:canvas:pointermove',message:'pointermove_while_hover_active',data:{hoveredCardId:hovered.cardId,canvasX,canvasY},timestamp:now})}).catch(()=>{});
      // #endregion
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre3',hypothesisId:'N8',location:'game.ts:canvas:pointermove',message:'pointermove_noncard_hover_active',data:{hoveredCharacterId:hoveredCharacter.characterId,hoveredStatusId:hoveredStatus.statusId,canvasX,canvasY},timestamp:now})}).catch(()=>{});
      // #endregion
    }
    if (!hoverMoveRenderQueued) {
      hoverMoveRenderQueued = true;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-post3',hypothesisId:'N12',location:'game.ts:canvas:pointermove',message:'queue_render_for_any_hover_reconcile',data:{hoveredCardId:hovered.cardId,hoveredCharacterId:hoveredCharacter.characterId,hoveredStatusId:hoveredStatus.statusId},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      requestAnimationFrame(() => {
        hoverMoveRenderQueued = false;
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-post3',hypothesisId:'N12',location:'game.ts:requestAnimationFrame',message:'run_render_for_any_hover_reconcile',data:{},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        render();
      });
    }
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

  // Initialize characters from YAML — explicit party roster
  const partyIds = ['sharpshooter', 'tactician', 'corrupter', 'techblade'];
  const playerCharacters = partyIds
    .map(id => characters[id])
    .filter((c): c is typeof characters[string] => !!c && c.isPlayer);

  // Generate first wave of enemies via difficulty budget
  const enemyPool = Object.values(characters).filter(c => !c.isPlayer);
  const enemyCharacters = generateWave(1, enemyPool, undefined, gameState.cardLibrary);

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
      drawCount: 5,
      maxHandSize: 5,
      blockLayers: [],
      statuses: [],
      isPlayer: charDef.isPlayer,
      slotIndex,
      slotSize,
      speed: charDef.stats.speed ?? 0,
      moveCharges: 0,
      suppression: charDef.stats.suppression ?? 0,
      suppressionResist: charDef.stats.suppressionResist ?? 0,
      gear: { weapon: null, armor: null, accessory: null },
    };

    // Draw initial hand
    drawCards(character, character.drawCount);

    gameState.characters.push(character);
  });

  // Add enemy characters on enemy-side slots (from center-right).
  const usedEnemyIds = new Set<string>();
  enemyCharacters.forEach((charDef, i) => {
    const deck = shuffleArray(buildDeckFromDefinition(charDef));
    const slotSize = Math.max(1, Math.floor(charDef.slotSize ?? 1));
    const slotIndex = findAvailableFrontSlot(gameState.characters, false, slotSize);
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
      isPlayer: charDef.isPlayer,
      slotIndex,
      slotSize,
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
