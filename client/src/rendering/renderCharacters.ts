// Character rendering

import type { Application, Texture } from 'pixi.js';
import { Assets, Text, Graphics, Sprite } from 'pixi.js';
import type { GameState, Character } from '../core/types.js';
import { getSelectedCardId, getGameState } from '../core/gameState.js';
import { playCard } from '../core/combat.js';
import { render as renderCallback } from './renderer.js';
import { registerCharacterSprite } from '../../animations.js';
import { getTotalBlock } from '../core/block.js';

const BATTLE_Y_OFFSET = 300;
const SPACING = 140;

/**
 * Render all characters on the battlefield
 */
export function renderCharacters(app: Application, gameState: GameState): void {
  const battleY = 800 - BATTLE_Y_OFFSET; // Move characters down towards bottom
  const width = 1200;
  
  // Separate players and enemies for positioning - only show living characters
  const players = gameState.characters.filter(c => c.isPlayer && c.hp > 0);
  const enemies = gameState.characters.filter(c => !c.isPlayer && c.hp > 0);
  
  // Draw players on the left side
  players.forEach((char, i) => {
    const x = 100 + i * SPACING; // Start from left side
    const y = battleY;
    renderCharacter(app, gameState, char, x, y);
  });
  
  // Draw enemies on the right side
  enemies.forEach((char, i) => {
    const x = width - 200 - i * SPACING; // Start from right side, work inward
    const y = battleY;
    renderCharacter(app, gameState, char, x, y);
  });
}

/**
 * Render a single character
 */
function renderCharacter(app: Application, gameState: GameState, char: Character, x: number, y: number): void {
  const charDef = gameState.characterLibrary[char.id];
  
  // Character sprite as main entity
  if (charDef && charDef.sprite) {
    Assets.load(charDef.sprite).then((texture: Texture) => {
      const sprite = new Sprite(texture);
      sprite.x = x;
      sprite.y = y - 20; // Move sprite up 20 pixels
      
      // Try setting anti-aliasing and smoothing
      sprite.roundPixels = false;
      
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
      
      // Make targetable based on card's targeting type
      const selectedCardId = getSelectedCardId();
      if (selectedCardId) {
        const gameStateForCard = getGameState();
        const card = gameStateForCard.cardLibrary[selectedCardId] || (() => {
          // Try to get card from instances if not in library
          const instance = gameStateForCard.cardInstances[selectedCardId];
          return instance ? gameStateForCard.cardLibrary[instance.templateId] : null;
        })();
        
        if (card) {
          const canTarget = 
            (card.targeting === 'enemy' && !char.isPlayer) ||
            (card.targeting === 'ally' && char.isPlayer) ||
            (card.targeting === 'self' && char.id === gameStateForCard.currentPlayerId) ||
            (card.targeting === 'single' && !char.isPlayer); // Default single target = enemy for backwards compat
          
          if (canTarget) {
            sprite.eventMode = 'static';
            sprite.cursor = 'pointer';
            sprite.on('pointerdown', async () => {
              console.log('Character clicked:', char.id, 'selected card:', selectedCardId, 'targeting:', card.targeting);
              // For self-targeting, don't need targetId (will be ignored)
              await playCard(selectedCardId, char.id, renderCallback);
            });
          }
        }
      }
      
      // Register sprite for animations
      registerCharacterSprite(char.id, sprite);
      
      app.stage.addChild(sprite);
    }).catch(err => {
      console.warn(`Failed to load sprite for ${char.id}:`, err);
    });
  }
  
  // Character name below sprite
  const name = new Text({
    text: char.name,
    style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' }
  });
  name.x = x + 100 - name.width/2; // Center under larger sprite
  name.y = y + 180; // Move down for larger sprites
  name.eventMode = 'none';
  app.stage.addChild(name);
  
  // HP bar below name
  const hpBarBg = new Graphics();
  hpBarBg.rect(0, 0, 120, 8).fill(0x374151);
  hpBarBg.x = x + 40;
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
  hpText.eventMode = 'none';
  app.stage.addChild(hpText);
  
  // Block display - shield icon with number (like STS), positioned to the right of HP bar
  const totalBlock = getTotalBlock(char);
  
  if (totalBlock > 0) {
    // Position shield to the right of HP bar, vertically aligned with HP area
    const shieldX = x + 165; // To the right of HP bar (x + 40 + 120 HP bar width + 5 spacing)
    const shieldY = y + 200; // Vertically centered with HP bar
    const shieldWidth = 32;
    const shieldHeight = 38;
    
    // Shield shape - classic rounded top, pointed bottom shield (like STS)
    const shield = new Graphics();
    
    // Draw shield: rounded top arc, straight sides tapering to pointed bottom
    const halfWidth = shieldWidth / 2;
    const topArcRadius = shieldWidth * 0.45;
    const topArcY = -shieldHeight/2 + topArcRadius;
    
    // Start from top-left of arc
    shield.moveTo(-halfWidth, topArcY)
      // Draw rounded top (arc from left to right)
      .arc(0, -shieldHeight/2 + topArcRadius, topArcRadius, Math.PI, 0, false)
      // Right side down to point
      .lineTo(halfWidth * 0.7, shieldHeight/2 * 0.5) // Right side, mid-way
      .lineTo(halfWidth * 0.55, shieldHeight/2 * 0.75) // Right side, lower
      .lineTo(0, shieldHeight/2) // Bottom point
      // Left side back up
      .lineTo(-halfWidth * 0.55, shieldHeight/2 * 0.75) // Left side, lower
      .lineTo(-halfWidth * 0.7, shieldHeight/2 * 0.5) // Left side, mid-way
      .closePath();
    
    // Fill and stroke shield
    shield.fill(0x60a5fa); // Bright blue shield color
    shield.stroke({ width: 2.5, color: 0x1e40af }); // Darker blue border
    
    // Position shield
    shield.x = shieldX;
    shield.y = shieldY;
    shield.eventMode = 'none';
    app.stage.addChild(shield);
    
    // Block number text centered in shield
    const blockText = new Text({
      text: totalBlock.toString(),
      style: { 
        fill: 0xffffff, 
        fontSize: 16, 
        fontWeight: 'bold',
        stroke: { color: 0x000000, width: 4 } // Thick black outline for visibility
      }
    });
    blockText.x = shieldX - blockText.width/2;
    blockText.y = shieldY - blockText.height/2 + 2; // Slight offset down for better centering
    blockText.eventMode = 'none';
    app.stage.addChild(blockText);
  }
  
  // Segmented energy bar below HP
  const energyBarY = y + 225;
  const segmentWidth = 120 / char.maxEnergy;
  const segmentSpacing = 2;
  const actualSegmentWidth = segmentWidth - segmentSpacing;
  
  for (let i = 0; i < char.maxEnergy; i++) {
    const segmentBg = new Graphics();
    segmentBg.rect(0, 0, actualSegmentWidth, 8).fill(0x374151);
    segmentBg.x = x + 40 + i * segmentWidth;
    segmentBg.y = energyBarY;
    app.stage.addChild(segmentBg);
    
    // Fill segment if we have energy for it
    if (i < char.energy) {
      const segmentFill = new Graphics();
      segmentFill.rect(0, 0, actualSegmentWidth, 8).fill(0x3b82f6);
      segmentFill.x = x + 40 + i * segmentWidth;
      segmentFill.y = energyBarY;
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
    arrow.x = x + 60;
    arrow.y = y - 30;
    app.stage.addChild(arrow);
  }
}

