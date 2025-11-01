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

/**
 * Initialize and start the game
 */
async function initGame(): Promise<void> {
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
  
  container.appendChild(app.canvas);
  app.stage.eventMode = 'static';
  
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
  
  // Get all card IDs for testing - give each character one of each card
  const allCardIds = Object.keys(gameState.cardLibrary);
  console.log('All available cards:', allCardIds);
  
  // Build a deck with exactly one copy of each card (ignore copies field)
  const testDeck = [...allCardIds]; // One of each card
  
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

// Start the game when page loads
window.addEventListener('load', initGame);
