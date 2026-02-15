// Pure PIXI.js game - NO REACT
// Main entry point - coordinates all game modules

import { Application } from 'pixi.js';

// Core game modules
import type { Character } from './src/core/types.js';
import { getGameState, setGameState } from './src/core/gameState.js';
import { drawCards } from './src/core/deck.js';
import { shuffleArray } from './src/utils/shuffle.js';
import { loadContent } from './src/data/contentLoader.js';
import { render, setApp } from './src/rendering/renderer.js';
import { setApp as setCombatApp } from './src/core/combat.js';
import { WIDTH, HEIGHT } from './src/core/constants.js';
import { initDevPanel } from './src/rendering/devPanel.js';
import { getModifierRegistry } from './src/core/modifiers.js';

let currentApp: Application | null = null;
let initPromise: Promise<void> | null = null;

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
  // Use 'passive' so the stage passes events to children instead of capturing them
  app.stage.eventMode = 'passive';
  
  // Set app in modules that need it
  setApp(app);
  setCombatApp(app);
  
  // Clear modifier registry on re-init (HMR safety)
  getModifierRegistry().clearAll();

  // Load content from YAML (also loads balance.yaml modifiers)
  const { cards, characters, gear } = await loadContent();
  const gameState = getGameState();
  gameState.cardLibrary = cards;
  gameState.characterLibrary = characters;
  gameState.gearLibrary = gear;
  gameState.combatResult = 'ongoing';
  gameState.pendingReward = null;
  setGameState(gameState);

  // Initialize characters from YAML
  const playerCharacters = Object.values(characters).filter(c => c.isPlayer).slice(0, 2);
  const enemyCharacters = Object.values(characters).filter(c => !c.isPlayer).slice(0, 2);

  // Add scrapling swarm as a third enemy if available
  const scraplingDef = characters['scrapling_swarm'];
  if (scraplingDef && !enemyCharacters.includes(scraplingDef)) {
    enemyCharacters.push(scraplingDef);
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

  // Add player characters - slots 0-3 (ally side)
  playerCharacters.forEach((charDef, i) => {
    const deck = shuffleArray(buildDeckFromDefinition(charDef));
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
      slotIndex: i,
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

  // Add enemy characters - slots 4-7 (enemy side)
  const usedEnemyIds = new Set<string>();
  enemyCharacters.forEach((charDef, i) => {
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
      isPlayer: charDef.isPlayer,
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

    // Draw initial hand
    drawCards(character, character.drawCount);

    gameState.characters.push(character);
  });
  
  if (gameState.characters.length > 0) {
    gameState.currentPlayerId = gameState.characters.find(c => c.isPlayer)?.id || gameState.characters[0].id;
  }
  
  setGameState(gameState);
  
  // Initialize dev panel toggle
  initDevPanel();

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
