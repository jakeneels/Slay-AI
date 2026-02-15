// Pure PIXI.js game - NO REACT
// Main entry point - coordinates all game modules

import { Application } from 'pixi.js';

// Core game modules
import type { Character } from './src/core/types.js';
import { getGameState, setGameState } from './src/core/gameState.js';
import { drawCards } from './src/core/deck.js';
import { shuffleArray } from './src/utils/shuffle.js';
import { loadContent } from './src/data/contentLoader.js';
import { render, setApp, getApp } from './src/rendering/renderer.js';
import { setApp as setCombatApp } from './src/core/combat.js';
import { WIDTH, HEIGHT } from './src/core/constants.js';

let currentApp: Application | null = null;

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
  // Clean up existing app if it exists (for hot reload)
  cleanup();
  
  const container = document.getElementById('gameCanvas');
  if (!container) {
    console.error('Game canvas container not found');
    return;
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
  
  // Load content from YAML
  const { cards, characters } = await loadContent();
  const gameState = getGameState();
  gameState.cardLibrary = cards;
  gameState.characterLibrary = characters;
  setGameState(gameState);
  
  // Initialize characters from YAML
  const playerCharacters = Object.values(characters).filter(c => c.isPlayer).slice(0, 2);
  const enemyCharacters = Object.values(characters).filter(c => !c.isPlayer).slice(0, 2);
  
  console.log('Player characters found:', playerCharacters.map(c => c.name));
  console.log('Enemy characters found:', enemyCharacters.map(c => c.name));
  
  gameState.characters = [];
  
  // Get AOE card IDs - only include AOE cards for testing
  const aoeCardIds = ['shockwave_common', 'fireball_uncommon', 'chain_lightning_rare'].filter(id => 
    gameState.cardLibrary[id]
  );
  
  console.log('AOE cards for testing:', aoeCardIds);

  // Build a deck with exactly one copy of each AOE card
  const testDeck = [...aoeCardIds]; // One of each AOE card
  
  // Add player characters
  playerCharacters.forEach(charDef => {
    // Give each character one copy of every card for testing
    const deck = shuffleArray([...testDeck]); // Shuffle a copy
    const character: Character = {
      id: charDef.id,
      name: charDef.name,
      hp: charDef.stats.hp,
      maxHp: charDef.stats.maxHp,
      energy: charDef.stats.energy,
      maxEnergy: charDef.stats.maxEnergy,
      deck: deck,
      discardPile: [],
      hand: [],
      drawCount: 3,
      maxHandSize: 5,
      blockLayers: [],
      statuses: [],
      isPlayer: charDef.isPlayer,
    };
    
    // Draw initial hand
    drawCards(character, character.drawCount);
    
    gameState.characters.push(character);
  });
  
  // Add enemy characters
  enemyCharacters.forEach(charDef => {
    // Give each character one copy of every card for testing
    const deck = shuffleArray([...testDeck]); // Shuffle a copy
    const character: Character = {
      id: charDef.id,
      name: charDef.name,
      hp: charDef.stats.hp,
      maxHp: charDef.stats.maxHp,
      energy: charDef.stats.energy,
      maxEnergy: charDef.stats.maxEnergy,
      deck: deck,
      discardPile: [],
      hand: [],
      drawCount: 3,
      maxHandSize: 5,
      blockLayers: [],
      statuses: [],
      isPlayer: charDef.isPlayer,
    };
    
    // Draw initial hand
    drawCards(character, character.drawCount);
    
    gameState.characters.push(character);
  });
  
  if (gameState.characters.length > 0) {
    gameState.currentPlayerId = gameState.characters.find(c => c.isPlayer)?.id || gameState.characters[0].id;
  }
  
  setGameState(gameState);
  
  // Initial render
  render();
}

// Start the game
if (document.readyState === 'loading') {
  window.addEventListener('load', initGame);
} else {
  // DOM already loaded, run immediately
  initGame();
}

// Handle HMR updates
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    cleanup();
  });
  
  // Accept self (game.ts changes) - full reinit
  import.meta.hot.accept(() => {
    console.log('[HMR] game.ts updated, re-initializing...');
    initGame();
  });
  
  // Accept updates from rendering modules - just re-render
  import.meta.hot.accept(['./src/rendering/renderer.ts', './src/rendering/renderCharacters.ts', './src/rendering/renderHand.ts', './src/rendering/renderUI.ts', './src/rendering/renderBackground.ts'], (modules) => {
    console.log('[HMR] Rendering module updated, re-rendering...');
    if (currentApp) {
      render();
    }
  });
  
  // Fallback: if any module updates and we have an app, try to re-render
  import.meta.hot.on('vite:beforeUpdate', () => {
    if (currentApp) {
      // Small delay to ensure modules are updated
      setTimeout(() => {
        render();
      }, 10);
    }
  });
}
