// Pure PIXI.js game - NO REACT
const { Application, Graphics, Text, Rectangle } = PIXI;

// Import animations
import { registerCharacterSprite, playAttackAnimation } from './animations.js';

const WIDTH = 1200;
const HEIGHT = 800;

// Game state
let gameState = {
  characters: [],
  cardLibrary: {},
  characterLibrary: {},
  cardInstances: {}, // Store unique card instances
  selectedCardId: null,
  currentPlayerId: '',
  turnIndex: 0,
  combatLog: [],
  isProcessingTurn: false,
  nextCardInstanceId: 1
};

let app = null;

// Create a unique card instance from a template
function createCardInstance(templateId) {
  const template = gameState.cardLibrary[templateId];
  if (!template) {
    console.error('Card template not found:', templateId);
    return null;
  }
  
  const instanceId = `card_${gameState.nextCardInstanceId++}`;
  const instance = {
    instanceId: instanceId,
    templateId: templateId,
    ...template // Copy all properties from template
  };
  
  gameState.cardInstances[instanceId] = instance;
  return instanceId;
}

// Get card instance (falls back to template for backwards compatibility)
function getCard(cardId) {
  return gameState.cardInstances[cardId] || gameState.cardLibrary[cardId];
}

// Load YAML content
async function loadContent() {
  try {
    // Load cards
    const cardFiles = [
      'content/core/cards/defend_common.yaml',
      'content/core/cards/blast_rare.yaml', 
      'content/core/cards/strike_common.yaml',
      'content/core/cards/overclock_mythic.yaml'
    ];
    
    const characterFiles = [
      'content/core/characters/jacob_techblade.yaml',
      'content/core/characters/lira_sharpshooter.yaml',
      'content/core/characters/kael_tactician.yaml',
      'content/core/characters/nyx_corrupter.yaml'
    ];
    
    const enemyFiles = [
      'content/core/enemies/scrapling_swarm.yaml',
      'content/core/enemies/fanatic_zealot.yaml',
      'content/core/enemies/rustbeast_quadruped.yaml',
      'content/core/enemies/neural_stalker.yaml'
    ];
    
    console.log('Enemy files to load:', enemyFiles);
    
    // Load all files
    const cards = {};
    const characters = {};
    
    for (const file of cardFiles) {
      try {
        const response = await fetch(file);
        const yamlText = await response.text();
        const cardData = jsyaml.load(yamlText);
        cards[cardData.id] = {
          id: cardData.id,
          name: cardData.name,
          cost: { energy: cardData.cost },
          effects: cardData.effects,
          targetSide: cardData.targeting === 'self' ? 'self' : cardData.targeting === 'ally' ? 'ally' : 'enemy',
          targeting: 'single'
        };
      } catch (e) {
        console.warn(`Failed to load ${file}:`, e);
      }
    }
    
    for (const file of characterFiles) {
      try {
        const response = await fetch(file);
        const yamlText = await response.text();
        const charData = jsyaml.load(yamlText);
        characters[charData.id] = charData;
      } catch (e) {
        console.warn(`Failed to load ${file}:`, e);
      }
    }
    
    console.log('Starting enemy file loading...');
    for (const file of enemyFiles) {
      try {
        console.log(`Loading enemy file: ${file}`);
        const response = await fetch(file);
        if (!response.ok) {
          console.error(`Failed to fetch ${file}: ${response.status} ${response.statusText}`);
          continue;
        }
        const yamlText = await response.text();
        const charData = jsyaml.load(yamlText);
        console.log(`Loaded enemy: ${charData.name} (${charData.id})`);
        characters[charData.id] = charData;
      } catch (e) {
        console.warn(`Failed to load ${file}:`, e);
      }
    }
    
    console.log('Loaded cards:', Object.keys(cards));
    console.log('Loaded characters:', Object.keys(characters));
    console.error('Starting CHAD CAHHH file loading...');

    
    return { cards, characters };
  } catch (error) {
    console.error('Failed to load content:', error);
    return { cards: {}, characters: {} };
  }
}

// Initialize PIXI app
async function initGame() {
  const container = document.getElementById('gameCanvas');
  
  app = new Application();
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
  
  // Load content
  const { cards, characters } = await loadContent();
  gameState.cardLibrary = cards;
  gameState.characterLibrary = characters;
  
  // Initialize characters from YAML
  const playerCharacters = Object.values(characters).filter(c => c.isPlayer).slice(0, 2);
  const enemyCharacters = Object.values(characters).filter(c => !c.isPlayer).slice(0, 2);
  
  console.log('Player characters found:', playerCharacters.map(c => c.name));
  console.log('Enemy characters found:', enemyCharacters.map(c => c.name));
  
  gameState.characters = [];
  
  // Add player characters
  playerCharacters.forEach(charDef => {
    gameState.characters.push({
      id: charDef.id,
      name: charDef.name,
      hp: charDef.stats.hp,
      maxHp: charDef.stats.maxHp,
      energy: charDef.stats.energy,
      maxEnergy: charDef.stats.maxEnergy,
      hand: (charDef.startingDeck || ['defend_common', 'strike_common']).map(createCardInstance),
      isPlayer: charDef.isPlayer,
    });
  });
  
  // Add enemy characters
  enemyCharacters.forEach(charDef => {
    gameState.characters.push({
      id: charDef.id,
      name: charDef.name,
      hp: charDef.stats.hp,
      maxHp: charDef.stats.maxHp,
      energy: charDef.stats.energy,
      maxEnergy: charDef.stats.maxEnergy,
      hand: (charDef.startingDeck || ['strike_common']).map(createCardInstance),
      isPlayer: charDef.isPlayer,
    });
  });
  
  if (gameState.characters.length > 0) {
    gameState.currentPlayerId = gameState.characters.find(c => c.isPlayer)?.id || gameState.characters[0].id;
  }
  
  render();
}

// Render the entire scene
function render() {
  app.stage.removeChildren();
  
  // Check if current player is dead and advance turn if needed
  const currentPlayer = gameState.characters.find(c => c.id === gameState.currentPlayerId);
  if (!currentPlayer || currentPlayer.hp <= 0) {
    const livingCharacters = gameState.characters.filter(c => c.hp > 0);
    if (livingCharacters.length > 0) {
      gameState.currentPlayerId = livingCharacters[0].id;
      console.log(`Dead player detected, switching to: ${livingCharacters[0].name}`);
    }
  }
  
  drawBackground();
  drawCharacters();
  drawHand();
  drawTurnInfo();
  drawCombatLog();
}

function drawBackground() {
  // Load and display the map background
  PIXI.Assets.load('/assets/game/maps/overtaken-city.png').then((texture) => {
    // Set texture to use nearest neighbor for crisp pixel art
    texture.source.scaleMode = 'nearest';
    const bgSprite = new PIXI.Sprite(texture);
    bgSprite.x = 0;
    bgSprite.y = 0;
    bgSprite.width = WIDTH;
    bgSprite.height = HEIGHT;
    app.stage.addChildAt(bgSprite, 0); // Add at bottom layer
  }).catch(err => {
    console.warn('Failed to load background map:', err);
    // Fallback to solid color
    const bg = new Graphics();
    bg.rect(0, 0, WIDTH, HEIGHT).fill(0x0f0f0f);
    app.stage.addChild(bg);
  });
}

function drawCharacters() {
  const battleY = HEIGHT - 300; // Move characters down towards bottom
  const spacing = 140; // Space between characters
  
  // Separate players and enemies for positioning - only show living characters
  const players = gameState.characters.filter(c => c.isPlayer && c.hp > 0);
  const enemies = gameState.characters.filter(c => !c.isPlayer && c.hp > 0);
  
  // Draw players on the left side
  players.forEach((char, i) => {
    const x = 100 + i * spacing; // Start from left side
    const y = battleY;
    drawCharacter(char, x, y);
  });
  
  // Draw enemies on the right side
  enemies.forEach((char, i) => {
    const x = WIDTH - 200 - i * spacing; // Start from right side, work inward
    const y = battleY;
    drawCharacter(char, x, y);
  });
}

function drawCharacter(char, x, y) {
    const charDef = gameState.characterLibrary[char.id];
    
    // Character sprite as main entity
    if (charDef && charDef.sprite) {
      PIXI.Assets.load(charDef.sprite).then((texture) => {
        const sprite = new PIXI.Sprite(texture);
        sprite.x = x;
        sprite.y = y - 20; // Move sprite up 20 pixels
        
        // Try setting anti-aliasing and smoothing
        sprite.roundPixels = false;
        sprite.texture.source.antialias = true;
        
        // Maintain aspect ratio and make larger for better quality
        const aspectRatio = texture.width / texture.height;
        if (aspectRatio > 1) {
          // Wider than tall
          sprite.width = 200;
          sprite.height = 200 / aspectRatio;
        } else {
          // Taller than wide
          sprite.height = 200;
          sprite.width = 200 * aspectRatio;
        }
        
        console.log(`Loaded sprite for ${char.id}: ${texture.width}x${texture.height} -> ${sprite.width}x${sprite.height}`);
        
        // Make targetable if enemy and card selected
        if (!char.isPlayer && gameState.selectedCardId) {
          sprite.eventMode = 'static';
          sprite.cursor = 'pointer';
          sprite.on('pointerdown', async () => {
            console.log('Enemy clicked:', char.id, 'selected card:', gameState.selectedCardId);
            await playCard(gameState.selectedCardId, char.id);
          });
        }
        
        // Register sprite for animations
        registerCharacterSprite(char.id, sprite);
        
        app.stage.addChild(sprite);
      }).catch(err => {
        console.warn(`Failed to load sprite for ${char.id}:`, err);
      });
    }
    
    // Character name below sprite - adjusted for larger sprites
    const displayName = char.name;
    const name = new Text({
      text: displayName,
      style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' }
    });
    name.x = x + 100 - name.width/2; // Center under larger sprite
    name.y = y + 180; // Move down for larger sprites
    name.eventMode = 'none'; // Make text non-interactive
    app.stage.addChild(name);
    
    // HP bar below name - wider and better positioned
    const hpBarBg = new Graphics();
    hpBarBg.rect(0, 0, 120, 8).fill(0x374151);
    hpBarBg.x = x + 40; // Center under sprite
    hpBarBg.y = y + 200;
    app.stage.addChild(hpBarBg);
    
    const hpBarFill = new Graphics();
    const hpPercent = char.hp / char.maxHp;
    hpBarFill.rect(0, 0, 120 * hpPercent, 8).fill(char.isPlayer ? 0x22c55e : 0xef4444);
    hpBarFill.x = x + 40;
    hpBarFill.y = y + 200;
    app.stage.addChild(hpBarFill);
    
    // HP text
    const hpText = new Text({
      text: `${char.hp}/${char.maxHp}`,
      style: { fill: 0xffffff, fontSize: 10 }
    });
    hpText.x = x + 100 - hpText.width/2;
    hpText.y = y + 210;
    hpText.eventMode = 'none'; // Make text non-interactive
    app.stage.addChild(hpText);
    
    // Segmented energy bar below HP
    const segmentWidth = 120 / char.maxEnergy; // Divide total width by max energy
    const segmentSpacing = 2;
    const actualSegmentWidth = segmentWidth - segmentSpacing;
    
    for (let i = 0; i < char.maxEnergy; i++) {
      const segmentBg = new Graphics();
      segmentBg.rect(0, 0, actualSegmentWidth, 8).fill(0x374151);
      segmentBg.x = x + 40 + i * segmentWidth;
      segmentBg.y = y + 225;
      app.stage.addChild(segmentBg);
      
      // Fill segment if we have energy for it
      if (i < char.energy) {
        const segmentFill = new Graphics();
        segmentFill.rect(0, 0, actualSegmentWidth, 8).fill(0x3b82f6);
        segmentFill.x = x + 40 + i * segmentWidth;
        segmentFill.y = y + 225;
        app.stage.addChild(segmentFill);
      }
    }
    
    // Add turn indicator arrow if this is the current player
    if (char.id === gameState.currentPlayerId) {
      const arrow = new Graphics();
      arrow.moveTo(0, 0)
           .lineTo(-10, -15)
           .lineTo(-5, -15)
           .lineTo(-5, -25)
           .lineTo(5, -25)
           .lineTo(5, -15)
           .lineTo(10, -15)
           .closePath()
           .fill(0xffeb3b); // Bright yellow arrow
      arrow.x = x + 60; // Center above character
      arrow.y = y - 10; // Above the character
      app.stage.addChild(arrow);
    }
}

function drawHand() {
  const currentPlayer = gameState.characters.find(c => c.id === gameState.currentPlayerId);
  if (!currentPlayer) return;
  
  // Always show player hands, but also show enemy hands when it's their turn
  if (currentPlayer.isPlayer) {
    drawPlayerHand(currentPlayer);
  } else {
    drawEnemyHand(currentPlayer);
  }
}

function drawPlayerHand(currentPlayer) {
  
  const cards = currentPlayer.hand;
  const cardW = 140;
  const cardH = 80;
  const spacing = 10;
  const totalW = cards.length * cardW + Math.max(0, cards.length - 1) * spacing;
  const startX = (WIDTH - totalW) / 2;
  const y = 60; // Move player cards to top area
  
  cards.forEach((cardId, i) => {
    const card = getCard(cardId);
    if (!card) return;
    
    const x = startX + i * (cardW + spacing);
    const isSelected = gameState.selectedCardId === cardId;
    const canAfford = currentPlayer.energy >= card.cost.energy;
    
    // Card background
    const bg = new Graphics();
    bg.roundRect(0, 0, cardW, cardH, 8);
    bg.fill(0x1f2937);
    bg.stroke({ 
      width: isSelected ? 3 : 1, 
      color: isSelected ? 0x22c55e : 0x374151 
    });
    
    if (!canAfford) bg.alpha = 0.5;
    
    bg.x = x;
    bg.y = y;
    bg.eventMode = 'static';
    bg.cursor = 'pointer';
    bg.hitArea = new Rectangle(0, 0, cardW, cardH);
    
    bg.on('pointerdown', () => {
      console.log('Card clicked:', cardId, 'was selected:', isSelected);
      gameState.selectedCardId = isSelected ? null : cardId;
      console.log('New selection:', gameState.selectedCardId);
      render();
    });
    
    app.stage.addChild(bg);
    
    // Card name
    const name = new Text({
      text: card.name,
      style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' }
    });
    name.x = x + 10;
    name.y = y + 10;
    name.eventMode = 'none'; // Make text non-interactive
    app.stage.addChild(name);
    
    // Cost
    const cost = new Text({
      text: `Cost: ${card.cost.energy}`,
      style: { fill: 0x60a5fa, fontSize: 12 }
    });
    cost.x = x + 10;
    cost.y = y + 30;
    cost.eventMode = 'none'; // Make text non-interactive
    app.stage.addChild(cost);
    
    // Effects
    const effectsText = card.effects.map(effect => {
      switch (effect.kind) {
        case 'damage': return `Damage: ${effect.amount}`;
        case 'heal': return `Heal: ${effect.amount}`;
        case 'energy': return `Energy: +${effect.amount}`;
        case 'speed': return `Speed: +${effect.amount}`;
        default: return '';
      }
    }).join(', ');
    
    const effectText = new Text({
      text: effectsText,
      style: { 
        fill: card.effects.some(e => e.kind === 'damage') ? 0xff6b6b : 0x34d399, 
        fontSize: 12 
      }
    });
    effectText.x = x + 10;
    effectText.y = y + 50;
    effectText.eventMode = 'none'; // Make text non-interactive
    app.stage.addChild(effectText);
  });
}

function drawEnemyHand(currentPlayer) {
  const cards = currentPlayer.hand;
  const cardW = 120;
  const cardH = 60;
  const spacing = 8;
  const totalW = cards.length * cardW + Math.max(0, cards.length - 1) * spacing;
  const startX = (WIDTH - totalW) / 2;
  const y = 60; // Move enemy cards to top area too
  
  // Enemy hand label
  const label = new Text({
    text: `${currentPlayer.name}'s Hand:`,
    style: { fill: 0xff6b6b, fontSize: 14, fontWeight: 'bold' }
  });
  label.x = startX;
  label.y = y - 20; // Adjust label position for top area
  label.eventMode = 'none'; // Make text non-interactive
  app.stage.addChild(label);
  
  cards.forEach((cardId, i) => {
    const card = getCard(cardId);
    if (!card) return;
    
    const x = startX + i * (cardW + spacing);
    const canAfford = currentPlayer.energy >= card.cost.energy;
    
    // Card background - smaller for enemies
    const bg = new Graphics();
    bg.roundRect(0, 0, cardW, cardH, 6);
    bg.fill(0x1f2937);
    bg.stroke({ width: 1, color: 0x991b1b });
    
    if (!canAfford) bg.alpha = 0.5;
    
    bg.x = x;
    bg.y = y;
    app.stage.addChild(bg);
    
    // Card name
    const name = new Text({
      text: card.name,
      style: { fill: 0xffffff, fontSize: 11, fontWeight: 'bold' }
    });
    name.x = x + 8;
    name.y = y + 8;
    name.eventMode = 'none'; // Make text non-interactive
    app.stage.addChild(name);
    
    // Cost
    const cost = new Text({
      text: `Cost: ${card.cost.energy}`,
      style: { fill: 0x60a5fa, fontSize: 10 }
    });
    cost.x = x + 8;
    cost.y = y + 25;
    cost.eventMode = 'none'; // Make text non-interactive
    app.stage.addChild(cost);
    
    // Effects
    const effectsText = card.effects.map(effect => {
      switch (effect.kind) {
        case 'damage': return `Damage: ${effect.amount}`;
        case 'heal': return `Heal: ${effect.amount}`;
        case 'energy': return `Energy: +${effect.amount}`;
        case 'speed': return `Speed: +${effect.amount}`;
        default: return '';
      }
    }).join(', ');
    
    const effectText = new Text({
      text: effectsText,
      style: { 
        fill: card.effects.some(e => e.kind === 'damage') ? 0xff6b6b : 0x34d399, 
        fontSize: 9 
      }
    });
    effectText.x = x + 8;
    effectText.y = y + 40;
    effectText.eventMode = 'none'; // Make text non-interactive
    app.stage.addChild(effectText);
  });
}

function drawTurnInfo() {
  const currentPlayer = gameState.characters.find(c => c.id === gameState.currentPlayerId);
  const turnText = new Text({
    text: `Turn ${gameState.turnIndex + 1} - ${currentPlayer?.name}'s turn`,
    style: { fill: 0xffffff, fontSize: 18, fontWeight: 'bold' }
  });
  turnText.x = 20;
  turnText.y = 20;
  turnText.eventMode = 'none'; // Make text non-interactive
  app.stage.addChild(turnText);
  
  if (gameState.selectedCardId) {
            const card = getCard(gameState.selectedCardId);
    const selectedText = new Text({
      text: `Selected: ${card.name} - Click enemy to attack!`,
      style: { fill: 0x22c55e, fontSize: 14 }
    });
    selectedText.x = 20;
    selectedText.y = 50;
    selectedText.eventMode = 'none'; // Make text non-interactive
    app.stage.addChild(selectedText);
  }
  
  // End turn button
  const btnW = 120;
  const btnH = 40;
  const btn = new Graphics();
  btn.roundRect(0, 0, btnW, btnH, 8).fill(0x3b82f6);
  btn.x = WIDTH - btnW - 20;
  btn.y = 20;
  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.on('pointerdown', () => {
    endTurn();
  });
  app.stage.addChild(btn);
  
  const btnText = new Text({
    text: 'End Turn',
    style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' }
  });
  btnText.x = WIDTH - btnW - 20 + (btnW - btnText.width) / 2;
  btnText.y = 20 + (btnH - btnText.height) / 2;
  btnText.eventMode = 'none'; // Make text non-interactive
  app.stage.addChild(btnText);
}

function drawCombatLog() {
  // Combat log in top right
  const logX = WIDTH - 300;
  const logY = 80;
  const maxEntries = 8;
  
  const logTitle = new Text({
    text: 'Combat Log:',
    style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' }
  });
  logTitle.x = logX;
  logTitle.y = logY;
  logTitle.eventMode = 'none'; // Make text non-interactive
  app.stage.addChild(logTitle);
  
  // Show recent log entries
  const recentEntries = gameState.combatLog.slice(-maxEntries);
  recentEntries.forEach((entry, i) => {
    const logEntry = new Text({
      text: entry,
      style: { fill: 0x9ca3af, fontSize: 11 }
    });
    logEntry.x = logX;
    logEntry.y = logY + 20 + i * 15;
    logEntry.eventMode = 'none'; // Make text non-interactive
    app.stage.addChild(logEntry);
  });
}

function addToCombatLog(message) {
  gameState.combatLog.push(message);
  console.log('Combat Log:', message);
}

async function playCard(cardId, targetId) {
  const currentPlayer = gameState.characters.find(c => c.id === gameState.currentPlayerId);
  const target = gameState.characters.find(c => c.id === targetId);
  const card = getCard(cardId);
  
  if (!currentPlayer || !target || !card) return;
  if (currentPlayer.energy < card.cost.energy) return;
  if (!currentPlayer.hand.includes(cardId)) return;
  
  addToCombatLog(`${currentPlayer.name} plays ${card.name}`);
  
  // Check if this is a damage attack to trigger animations
  const isDamageCard = card.effects.some(effect => effect.kind === 'damage');
  
  // Play attack animation if it's a damage card
  if (isDamageCard) {
    await playAttackAnimation(currentPlayer.id, target.id, app);
  }
  
  // Apply card effects
  card.effects.forEach(effect => {
    switch (effect.kind) {
      case 'damage':
        target.hp = Math.max(0, target.hp - effect.amount);
        addToCombatLog(`${target.name} takes ${effect.amount} damage`);
        if (target.hp <= 0) {
          addToCombatLog(`${target.name} is defeated!`);
        }
        break;
      case 'heal':
        const healTarget = card.targetSide === 'self' ? currentPlayer : target;
        healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + effect.amount);
        addToCombatLog(`${healTarget.name} heals ${effect.amount} HP`);
        break;
      case 'energy':
        currentPlayer.energy = Math.min(currentPlayer.maxEnergy, currentPlayer.energy + effect.amount);
        addToCombatLog(`${currentPlayer.name} gains ${effect.amount} energy`);
        break;
      case 'speed':
        addToCombatLog(`${currentPlayer.name} gains ${effect.amount} speed`);
        break;
    }
  });
  
  // Consume energy and remove card from hand
  currentPlayer.energy -= card.cost.energy;
  currentPlayer.hand = currentPlayer.hand.filter(id => id !== cardId);
  
  // Clear selection
  gameState.selectedCardId = null;
  
  render();
}

function endTurn() {
  gameState.turnIndex++;
  
  // Filter to only living characters
  const livingCharacters = gameState.characters.filter(c => c.hp > 0);
  
  if (livingCharacters.length === 0) {
    console.log('No living characters left!');
    return;
  }
  
  // Find next living player
  const currentIndex = livingCharacters.findIndex(c => c.id === gameState.currentPlayerId);
  let nextIndex = (currentIndex + 1) % livingCharacters.length;
  
  // If current player is dead, start from beginning of living characters
  if (currentIndex === -1) {
    nextIndex = 0;
  }
  
  gameState.currentPlayerId = livingCharacters[nextIndex].id;
  
  // Restore energy
  const nextPlayer = livingCharacters[nextIndex];
  nextPlayer.energy = nextPlayer.maxEnergy;
  
  // Clear selection
  gameState.selectedCardId = null;
  
  console.log(`Turn passed to: ${nextPlayer.name}`);
  render();
  
  // If it's an enemy turn, trigger AI after a delay
  if (!nextPlayer.isPlayer) {
    setTimeout(() => {
      processEnemyTurn(nextPlayer);
    }, 1000); // 1 second delay to show enemy hand
  }
}

async function processEnemyTurn(enemy) {
  if (gameState.isProcessingTurn) return;
  gameState.isProcessingTurn = true;
  
  addToCombatLog(`${enemy.name} is thinking...`);
  render();
  
  // Find valid targets (living player characters)
  const playerTargets = gameState.characters.filter(c => c.isPlayer && c.hp > 0);
  
  if (playerTargets.length === 0) {
    addToCombatLog(`${enemy.name} has no targets!`);
    gameState.isProcessingTurn = false;
    endTurn();
    return;
  }
  
  // Find playable cards
  const playableCards = enemy.hand.filter(cardId => {
    const card = getCard(cardId);
    return card && enemy.energy >= card.cost.energy;
  });
  
  if (playableCards.length === 0) {
    addToCombatLog(`${enemy.name} has no playable cards`);
    gameState.isProcessingTurn = false;
    setTimeout(() => endTurn(), 1500);
    return;
  }
  
  // Simple AI: pick a random playable card and random player target
  const chosenCardId = playableCards[Math.floor(Math.random() * playableCards.length)];
  const chosenTarget = playerTargets[Math.floor(Math.random() * playerTargets.length)];
  
  addToCombatLog(`${enemy.name} selects ${getCard(chosenCardId).name}...`);
  render();
  
  // Wait a bit then play the card
  setTimeout(async () => {
    await playCard(chosenCardId, chosenTarget.id);
    render();
    
    // Wait a bit then end turn
    setTimeout(() => {
      gameState.isProcessingTurn = false;
      endTurn();
    }, 2000);
  }, 1500);
}

// Start the game when page loads
window.addEventListener('load', initGame);
