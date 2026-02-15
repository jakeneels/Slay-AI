// Character rendering

import type { Application, Texture, Sprite } from 'pixi.js';
import { Assets, Text, Graphics, Sprite as SpriteImpl } from 'pixi.js';
import type { GameState, Character } from '../core/types.js';
import { getSelectedCardId, getGameState } from '../core/gameState.js';
import { playCard, calculateAoeTargets, getCharactersByPosition } from '../core/combat.js';
import { render as renderCallback } from './renderer.js';
import { registerCharacterSprite } from '../../animations.js';
import { getTotalBlock } from '../core/block.js';

const BATTLE_Y_OFFSET = 300;
const SPACING = 140;

// Map to store character sprites for AOE highlighting
const characterSpriteMap = new Map<string, SpriteImpl>();

/**
 * Render all characters on the battlefield
 */
export function renderCharacters(app: Application, gameState: GameState): void {
  const battleY = 800 - BATTLE_Y_OFFSET; // Move characters down towards bottom
  const width = 1200;
  
  // Clear sprite map for this render cycle
  characterSpriteMap.clear();
  
  // Use full lists (including dead) so slot positions stay fixed when allies die
  const allPlayers = gameState.characters.filter(c => c.isPlayer);
  const allEnemies = gameState.characters.filter(c => !c.isPlayer);
  
  // Draw players on the left side - only living, but at fixed slot positions
  allPlayers.forEach((char, slotIndex) => {
    if (char.hp <= 0) return;
    const x = 100 + slotIndex * SPACING;
    const y = battleY;
    renderCharacter(app, gameState, char, x, y);
  });
  
  // Draw enemies on the right side - only living, but at fixed slot positions
  allEnemies.forEach((char, slotIndex) => {
    if (char.hp <= 0) return;
    const x = width - 200 - slotIndex * SPACING;
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
      const sprite = new SpriteImpl(texture);
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
          const isAoe = card.targeting === 'aoe';
          const targetSide = card.targetSide === 'ally' ? 'ally' : 'enemy';
          const canTarget = 
            (card.targeting === 'enemy' && !char.isPlayer) ||
            (card.targeting === 'ally' && char.isPlayer) ||
            (card.targeting === 'self' && char.id === gameStateForCard.currentPlayerId) ||
            (card.targeting === 'single' && !char.isPlayer) || // Default single target = enemy for backwards compat
            (isAoe && ((targetSide === 'enemy' && !char.isPlayer) || (targetSide === 'ally' && char.isPlayer)));
          
          if (canTarget) {
            sprite.eventMode = 'static';
            sprite.cursor = 'pointer';
            
            // Determine highlight color based on targeting type
            let highlightColor: number;
            if (card.targeting === 'ally' || card.targeting === 'allAllies') {
              highlightColor = 0x34d399; // Green for ally
            } else if (card.targeting === 'self') {
              highlightColor = 0x60a5fa; // Blue for self
            } else if (card.targeting === 'aoe') {
              highlightColor = 0xffaa00; // Orange/yellow for AOE
            } else {
              highlightColor = 0xff6b6b; // Red for enemy/single
            }
            
            // Store original scale and dimensions for zoom effect
            const originalScaleX = sprite.scale.x;
            const originalScaleY = sprite.scale.y;
            const originalSpriteWidth = sprite.width;
            const originalSpriteHeight = sprite.height;
            
            // Store highlights for cleanup
            const highlightGraphics: Graphics[] = [];
            let primaryHighlight: Graphics | null = null;
            
            // Universal hover effects for all targeting types
            sprite.on('pointerenter', () => {
              // Store original position (needed for restoring and highlight positioning)
              const originalX = sprite.x;
              const originalY = sprite.y;
              
              // Calculate center point of sprite (assuming top-left anchor)
              const centerX = originalX + originalSpriteWidth / 2;
              const centerY = originalY + originalSpriteHeight / 2;
              
              // Apply sprite zoom (1.1x scale)
              sprite.scale.set(originalScaleX * 1.1, originalScaleY * 1.1);
              
              // Adjust position to zoom from center
              const newWidth = originalSpriteWidth * 1.1;
              const newHeight = originalSpriteHeight * 1.1;
              sprite.x = centerX - newWidth / 2;
              sprite.y = centerY - newHeight / 2;
              
              // Add primary target highlight (based on original size, positioned at center)
              const padding = 8;
              primaryHighlight = new Graphics();
              primaryHighlight.roundRect(
                -padding, 
                -padding, 
                originalSpriteWidth + padding * 2, 
                originalSpriteHeight + padding * 2, 
                8
              )
                .stroke({ width: 4, color: highlightColor, alpha: 0.9 });
              // Position highlight at the center point (where sprite is zooming from)
              primaryHighlight.x = centerX - (originalSpriteWidth + padding * 2) / 2;
              primaryHighlight.y = centerY - (originalSpriteHeight + padding * 2) / 2;
              primaryHighlight.zIndex = -1;
              app.stage.addChild(primaryHighlight);
              highlightGraphics.push(primaryHighlight);
              
              // AOE-specific: highlight all characters that will be hit
              if (isAoe) {
                const currentPlayer = gameStateForCard.characters.find(c => c.id === gameStateForCard.currentPlayerId);
                const effectiveTargetSide: 'enemy' | 'ally' = card.targetSide === 'ally' 
                  ? 'ally' 
                  : (currentPlayer?.isPlayer ? 'enemy' : 'ally');
                
                const aoeSlots = card.aoeSlots ?? 3;
                const targets = calculateAoeTargets(char.id, effectiveTargetSide, aoeSlots);
                
                // Highlight all AOE targets (excluding primary, which is already highlighted)
                targets.forEach(targetChar => {
                  if (targetChar.id !== char.id) {
                    const targetSprite = characterSpriteMap.get(targetChar.id);
                    if (targetSprite) {
                      const highlight = new Graphics();
                      highlight.roundRect(
                        -padding, 
                        -padding, 
                        targetSprite.width + padding * 2, 
                        targetSprite.height + padding * 2, 
                        8
                      )
                        .stroke({ width: 4, color: highlightColor, alpha: 0.9 });
                      highlight.x = targetSprite.x;
                      highlight.y = targetSprite.y;
                      highlight.zIndex = -1;
                      app.stage.addChild(highlight);
                      highlightGraphics.push(highlight);
                    }
                  }
                });
              }
              
              // allEnemies/allAllies: highlight all valid targets
              if (card.targeting === 'allEnemies' || card.targeting === 'allAllies') {
                const allTargets = card.targeting === 'allEnemies'
                  ? gameStateForCard.characters.filter(c => !c.isPlayer && c.hp > 0)
                  : gameStateForCard.characters.filter(c => c.isPlayer && c.hp > 0);
                
                allTargets.forEach(targetChar => {
                  if (targetChar.id !== char.id) {
                    const targetSprite = characterSpriteMap.get(targetChar.id);
                    if (targetSprite) {
                      const highlight = new Graphics();
                      const padding = 8;
                      highlight.roundRect(
                        -padding, 
                        -padding, 
                        targetSprite.width + padding * 2, 
                        targetSprite.height + padding * 2, 
                        8
                      )
                        .stroke({ width: 4, color: highlightColor, alpha: 0.9 });
                      highlight.x = targetSprite.x;
                      highlight.y = targetSprite.y;
                      highlight.zIndex = -1;
                      app.stage.addChild(highlight);
                      highlightGraphics.push(highlight);
                    }
                  }
                });
              }
            });
            
            // Remove hover effects
            sprite.on('pointerleave', () => {
              // Store current center point before resetting
              const currentWidth = sprite.width;
              const currentHeight = sprite.height;
              const centerX = sprite.x + currentWidth / 2;
              const centerY = sprite.y + currentHeight / 2;
              
              // Reset sprite scale
              sprite.scale.set(originalScaleX, originalScaleY);
              
              // Restore original position (center-based)
              sprite.x = centerX - originalSpriteWidth / 2;
              sprite.y = centerY - originalSpriteHeight / 2;
              
              // Remove all highlight graphics
              highlightGraphics.forEach(highlight => {
                if (highlight.parent) {
                  app.stage.removeChild(highlight);
                }
              });
              highlightGraphics.length = 0;
              primaryHighlight = null;
            });
            
            sprite.on('pointerdown', async () => {
              console.log('Character clicked:', char.id, 'selected card:', selectedCardId, 'targeting:', card.targeting);
              // For self-targeting, don't need targetId (will be ignored)
              await playCard(selectedCardId, char.id, renderCallback);
            });
          }
        }
      }
      
      // Store sprite for AOE highlighting
      characterSpriteMap.set(char.id, sprite);
      
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
  
  // HP bar below name - polished with rounded corners, border, and gradient
  const hpBarWidth = 90;
  const hpBarHeight = 16;
  const hpBarRadius = 6;
  const hpBarX = x + 100 - hpBarWidth / 2;
  const hpBarY = y + 200;
  
  // Outer shadow/glow
  const hpBarShadow = new Graphics();
  hpBarShadow.roundRect(-1, -1, hpBarWidth + 2, hpBarHeight + 2, hpBarRadius + 1)
    .fill({ color: 0x000000, alpha: 0.3 });
  hpBarShadow.x = hpBarX;
  hpBarShadow.y = hpBarY;
  app.stage.addChild(hpBarShadow);
  
  // Background with border
  const hpBarBg = new Graphics();
  hpBarBg.roundRect(0, 0, hpBarWidth, hpBarHeight, hpBarRadius)
    .fill(0x1a1a1a)
    .stroke({ width: 1.5, color: 0x000000 });
  hpBarBg.x = hpBarX;
  hpBarBg.y = hpBarY;
  app.stage.addChild(hpBarBg);
  
  // Inner dark border
  const hpBarInnerBg = new Graphics();
  hpBarInnerBg.roundRect(1, 1, hpBarWidth - 2, hpBarHeight - 2, hpBarRadius - 1)
    .fill(0x2a2a2a);
  hpBarInnerBg.x = hpBarX;
  hpBarInnerBg.y = hpBarY;
  app.stage.addChild(hpBarInnerBg);
  
  // HP fill with gradient effect (simulated with lighter top and darker bottom)
  const hpPercent = char.hp / char.maxHp;
  const fillWidth = (hpBarWidth - 4) * hpPercent;
  
  if (fillWidth > 0) {
    const hpBarFill = new Graphics();
    const fillColor = char.isPlayer ? 0x22c55e : 0xef4444;
    const lighterColor = char.isPlayer ? 0x4ade80 : 0xf87171;
    
    // Main fill
    hpBarFill.roundRect(2, 2, fillWidth, hpBarHeight - 4, hpBarRadius - 1.5)
      .fill(fillColor);
    hpBarFill.x = hpBarX;
    hpBarFill.y = hpBarY;
    app.stage.addChild(hpBarFill);
    
    // Highlight gradient effect (lighter top portion)
    if (fillWidth > 2) {
      const hpBarHighlight = new Graphics();
      hpBarHighlight.roundRect(2, 2, fillWidth, (hpBarHeight - 4) * 0.4, hpBarRadius - 1.5)
        .fill({ color: lighterColor, alpha: 0.6 });
      hpBarHighlight.x = hpBarX;
      hpBarHighlight.y = hpBarY;
      app.stage.addChild(hpBarHighlight);
    }
  }
  
  // HP text with better styling - positioned inside the bar
  const hpText = new Text({
    text: `${char.hp}/${char.maxHp}`,
    style: { 
      fill: 0xffffff, 
      fontSize: 11,
      fontWeight: 'bold',
      stroke: { color: 0x000000, width: 3 },
      letterSpacing: 0.5
    }
  });
  hpText.x = x + 100 - hpText.width/2; // Center horizontally
  hpText.y = hpBarY + hpBarHeight/2 - hpText.height/2; // Center vertically in bar
  hpText.eventMode = 'none';
  app.stage.addChild(hpText);
  
  // Block display - shield icon with number (like STS), positioned to the right of HP bar
  const totalBlock = getTotalBlock(char);
  
  if (totalBlock > 0) {
    // Position shield to the right of HP bar, vertically aligned with HP area
    const shieldX = x + 152; // To the right of HP bar (x + 100 + 45 half bar width + 7 spacing)
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
  
  // Segmented energy bar below HP - polished design
  const energyBarY = y + 222; // Adjusted for taller HP bar
  const energyBarHeight = 16;
  const energyBarWidth = 90;
  const energyBarX = x + 100 - energyBarWidth / 2;
  const segmentWidth = energyBarWidth / char.maxEnergy;
  const segmentSpacing = 3;
  const actualSegmentWidth = segmentWidth - segmentSpacing;
  const segmentRadius = 4;
  
  for (let i = 0; i < char.maxEnergy; i++) {
    const segmentX = energyBarX + i * segmentWidth;
    
    // Shadow for each segment
    const segmentShadow = new Graphics();
    segmentShadow.roundRect(-0.5, -0.5, actualSegmentWidth + 1, energyBarHeight + 1, segmentRadius + 0.5)
      .fill({ color: 0x000000, alpha: 0.3 });
    segmentShadow.x = segmentX;
    segmentShadow.y = energyBarY;
    app.stage.addChild(segmentShadow);
    
    // Background segment
    const segmentBg = new Graphics();
    segmentBg.roundRect(0, 0, actualSegmentWidth, energyBarHeight, segmentRadius)
      .fill(0x1a1a1a)
      .stroke({ width: 1, color: 0x000000 });
    segmentBg.x = segmentX;
    segmentBg.y = energyBarY;
    app.stage.addChild(segmentBg);
    
    // Inner dark border
    const segmentInner = new Graphics();
    segmentInner.roundRect(1, 1, actualSegmentWidth - 2, energyBarHeight - 2, segmentRadius - 1)
      .fill(0x2a2a2a);
    segmentInner.x = segmentX;
    segmentInner.y = energyBarY;
    app.stage.addChild(segmentInner);
    
    // Fill segment if we have energy for it
    if (i < char.energy) {
      // Main fill with vibrant blue
      const segmentFill = new Graphics();
      segmentFill.roundRect(1.5, 1.5, actualSegmentWidth - 3, energyBarHeight - 3, segmentRadius - 1)
        .fill(0x3b82f6);
      segmentFill.x = segmentX;
      segmentFill.y = energyBarY;
      app.stage.addChild(segmentFill);
      
      // Highlight gradient effect (lighter top portion)
      const segmentHighlight = new Graphics();
      segmentHighlight.roundRect(1.5, 1.5, actualSegmentWidth - 3, (energyBarHeight - 3) * 0.4, segmentRadius - 1)
        .fill({ color: 0x60a5fa, alpha: 0.7 });
      segmentHighlight.x = segmentX;
      segmentHighlight.y = energyBarY;
      app.stage.addChild(segmentHighlight);
      
      // Subtle glow effect
      const segmentGlow = new Graphics();
      segmentGlow.roundRect(0.5, 0.5, actualSegmentWidth - 1, energyBarHeight - 1, segmentRadius - 0.5)
        .stroke({ width: 1, color: 0x60a5fa, alpha: 0.4 });
      segmentGlow.x = segmentX;
      segmentGlow.y = energyBarY;
      app.stage.addChild(segmentGlow);
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

