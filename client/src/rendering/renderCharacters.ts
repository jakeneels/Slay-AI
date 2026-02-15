// Character rendering

import type { Application, Texture, Sprite } from 'pixi.js';
import { Assets, Text, Graphics, Sprite as SpriteImpl } from 'pixi.js';
import type { GameState, Character } from '../core/types.js';
import { getSelectedCardId, getGameState } from '../core/gameState.js';
import { playCard, calculateAoeTargets, getCharactersByPosition } from '../core/combat.js';
import { render as renderCallback } from './renderer.js';
import { registerCharacterSprite } from '../../animations.js';
import { getTotalBlock } from '../core/block.js';
import { MAX_SLOTS, calculateRangeModifier } from '../core/constants.js';
import { createEnergyIcon } from './icons/energyIcon.js';

const BATTLE_Y_OFFSET = 300;
const SPACING = 140;

/** Threshold: energy 1–ENERGY_ICON_THRESHOLD shows individual icons; above shows "N × icon" text */
export const ENERGY_ICON_THRESHOLD = 6;
export const ENERGY_ICON_SIZE = 14;
export const ENERGY_ICON_GAP = 4;

/** Whether to render energy as individual icons (true) or as "N × icon" text (false) */
export function shouldUseEnergyIcons(energy: number): boolean {
  return energy <= ENERGY_ICON_THRESHOLD;
}

/** Calculate the pixel width of the energy icon row when using individual icons */
export function calculateEnergyIconRowWidth(energy: number, iconSize = ENERGY_ICON_SIZE, iconGap = ENERGY_ICON_GAP): number {
  return energy * iconSize + Math.max(0, energy - 1) * iconGap;
}

// Map to store character sprites for AOE highlighting
const characterSpriteMap = new Map<string, SpriteImpl>();

/**
 * Render all characters on the battlefield
 */
export function renderCharacters(app: Application, gameState: GameState): void {
  const battleY = 800 - BATTLE_Y_OFFSET; // Move characters down towards bottom
  const width = 1200;
  const leftBase = 100;
  const rightBase = width - 200;
  
  // Clear sprite map for this render cycle
  characterSpriteMap.clear();
  
  // Fixed 8 slots (0-7): allies 0-3, enemies 4-7
  const allies = gameState.characters.filter(c => c.isPlayer && c.hp > 0).sort((a, b) => a.slotIndex - b.slotIndex);
  const enemies = gameState.characters.filter(c => !c.isPlayer && c.hp > 0).sort((a, b) => a.slotIndex - b.slotIndex);
  const availableWidth = rightBase - leftBase;
  const slotSpacing = MAX_SLOTS > 1 ? availableWidth / (MAX_SLOTS - 1) : 0;
  
  allies.forEach((char) => {
    const x = leftBase + char.slotIndex * slotSpacing;
    const y = battleY;
    renderCharacter(app, gameState, char, x, y);
  });
  
  enemies.forEach((char) => {
    const x = leftBase + char.slotIndex * slotSpacing;
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
          let canTarget = 
            (card.targeting === 'enemy' && !char.isPlayer) ||
            (card.targeting === 'ally' && char.isPlayer) ||
            (card.targeting === 'self' && char.id === gameStateForCard.currentPlayerId) ||
            (card.targeting === 'single' && !char.isPlayer) || // Default single target = enemy for backwards compat
            (isAoe && ((targetSide === 'enemy' && !char.isPlayer) || (targetSide === 'ally' && char.isPlayer)));
          
          // Range check: if card has maxRange, verify target is within range of caster
          if (canTarget && card.maxRange && card.targeting !== 'self') {
            const caster = gameStateForCard.characters.find(c => c.id === gameStateForCard.currentPlayerId);
            if (caster) {
              const distance = Math.abs(caster.slotIndex - char.slotIndex);
              if (distance > card.maxRange) {
                canTarget = false;
              }
            }
          }
          
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

              // Range modifier badge (shows % damage when hovering target)
              if (card.optimalRange !== undefined && card.targeting !== 'self') {
                const caster = gameStateForCard.characters.find(c => c.id === gameStateForCard.currentPlayerId);
                if (caster) {
                  const distance = Math.abs(caster.slotIndex - char.slotIndex);
                  const modifier = calculateRangeModifier(distance, card.optimalRange);
                  const pct = Math.round(modifier * 100);
                  const isOptimal = distance === card.optimalRange;
                  const badgeColor = isOptimal ? 0x22c55e : modifier >= 1.0 ? 0xfbbf24 : 0xef4444;
                  const badgeTextColor = isOptimal ? 0x22c55e : modifier >= 1.0 ? 0xfbbf24 : 0xff6b6b;

                  const badge = new Graphics();
                  badge.roundRect(0, 0, 48, 20, 6)
                    .fill({ color: 0x111827, alpha: 0.85 })
                    .stroke({ width: 1.5, color: badgeColor, alpha: 0.8 });
                  badge.x = centerX - 24;
                  badge.y = centerY - originalSpriteHeight / 2 - 28;
                  badge.eventMode = 'none';
                  app.stage.addChild(badge);
                  highlightGraphics.push(badge);

                  const badgeText = new Text({
                    text: `${pct}%`,
                    style: { fill: badgeTextColor, fontSize: 12, fontWeight: 'bold' }
                  });
                  badgeText.x = badge.x + 24 - badgeText.width / 2;
                  badgeText.y = badge.y + 3;
                  badgeText.eventMode = 'none';
                  app.stage.addChild(badgeText);
                  highlightGraphics.push(badgeText as any);
                }
              }
              
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
  
  // Energy under HP bar: icon instances (1-ENERGY_ICON_THRESHOLD) or "N × [icon]" (above)
  const energyRowY = hpBarY + hpBarHeight + 6;
  const useIcons = shouldUseEnergyIcons(char.energy);
  const energyNumText = !useIcons
    ? new Text({ text: `${char.energy} ×`, style: { fill: 0xfbbf24, fontSize: 12, fontWeight: 'bold' } })
    : null;
  const energyRowWidth = useIcons
    ? calculateEnergyIconRowWidth(char.energy)
    : (energyNumText!.width + 4 + ENERGY_ICON_SIZE);
  let iconX = x + 100 - energyRowWidth / 2 + ENERGY_ICON_SIZE / 2;
  if (useIcons) {
    for (let i = 0; i < char.energy; i++) {
      const icon = createEnergyIcon(ENERGY_ICON_SIZE);
      icon.x = iconX;
      icon.y = energyRowY;
      app.stage.addChild(icon);
      iconX += ENERGY_ICON_SIZE + ENERGY_ICON_GAP;
    }
  } else {
    energyNumText!.x = iconX;
    energyNumText!.y = energyRowY;
    energyNumText!.eventMode = 'none';
    app.stage.addChild(energyNumText!);
    iconX += energyNumText!.width + 4;
    const icon = createEnergyIcon(ENERGY_ICON_SIZE);
    icon.x = iconX;
    icon.y = energyRowY;
    app.stage.addChild(icon);
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

