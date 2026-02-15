// Character rendering

import type { Application, Texture, Sprite } from 'pixi.js';
import { Assets, Text, Graphics, Sprite as SpriteImpl } from 'pixi.js';
import type { GameState, Character } from '../core/types.js';
import { getSelectedCardId, getGameState } from '../core/gameState.js';
import { playCard, calculateAoeTargets, getCharactersByPosition, resolveTargetSlot, isCharacterSuppressed, getNetSuppressionPenalty } from '../core/combat.js';
import { getSuppressionStackCost } from '../core/constants.js';
import { render as renderCallback } from './renderer.js';
import { registerCharacterSprite } from '../../animations.js';
import { getTotalBlock } from '../core/block.js';
import { MAX_SLOTS, calculateRangeModifier } from '../core/constants.js';
import { createEnergyIcon } from './icons/energyIcon.js';
import { createHealIcon } from './icons/healIcon.js';
import { getStatusDisplay } from './statusConfig.js';
import { setHoveredStatus } from './tooltipState.js';

const BATTLE_Y_OFFSET = 300;
const SPACING = 140;

export const ENERGY_ICON_SIZE = 14;

// Shared bar layout constants
const BAR_ICON_SIZE = 13;
const BAR_ICON_GAP = 3;
const BAR_WIDTH = 80;
const BAR_HEIGHT = 14;
const BAR_RADIUS = 5;

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

  // --- Render clickable empty-slot hit areas for AOE cards ---
  const selectedCardId = getSelectedCardId();
  if (selectedCardId) {
    const gsForCard = getGameState();
    const card = gsForCard.cardLibrary[selectedCardId] || (() => {
      const inst = gsForCard.cardInstances[selectedCardId];
      return inst ? gsForCard.cardLibrary[inst.templateId] : null;
    })();

    if (card && card.targeting === 'aoe') {
      const caster = gsForCard.characters.find(c => c.id === gsForCard.currentPlayerId);
      if (caster) {
        // Collect occupied slot indices (any living character)
        const occupiedSlots = new Set<number>();
        gsForCard.characters.filter(c => c.hp > 0).forEach(c => occupiedSlots.add(c.slotIndex));

        const highlightColor = 0xffaa00; // Same orange as AOE targeting

        // Scan all slots — AOE hits everyone in the blast radius (friendly fire).
        // Only show a hit area if the AOE from that slot would actually hit someone.
        for (let slot = 0; slot < MAX_SLOTS; slot++) {
          if (occupiedSlots.has(slot)) continue; // character already renders a clickable sprite

          // Range check
          if (card.maxRange || card.minRange) {
            const dist = Math.abs(caster.slotIndex - slot);
            if (card.maxRange && dist > card.maxRange) continue;
            if (card.minRange && dist < card.minRange) continue;
          }

          // Skip empty slots whose AOE wouldn't hit any characters
          const aoeCheck = card.aoeSlots ?? 3;
          let potentialTargets = calculateAoeTargets(slot, 'all', aoeCheck);
          if (card.maxRange) {
            potentialTargets = potentialTargets.filter(t => Math.abs(caster.slotIndex - t.slotIndex) <= card.maxRange!);
          }
          if (potentialTargets.length === 0) continue;

          const slotX = leftBase + slot * slotSpacing;
          const hitW = 80;
          const hitH = 200;
          const hitX = slotX + 100 - hitW / 2; // center in the slot (sprite center = slotX + 100)
          const hitY = battleY - 20;

          // Semi-transparent hit area so player can see it's clickable
          const hitArea = new Graphics();
          hitArea.roundRect(0, 0, hitW, hitH, 8)
            .fill({ color: highlightColor, alpha: 0.08 })
            .stroke({ width: 2, color: highlightColor, alpha: 0.25 });
          hitArea.x = hitX;
          hitArea.y = hitY;
          hitArea.eventMode = 'static';
          hitArea.cursor = 'pointer';
          hitArea.zIndex = -2;

          // Store highlights for cleanup on hover
          const hoverGraphics: Graphics[] = [];

          hitArea.on('pointerenter', () => {
            // Brighten the hit area
            hitArea.clear();
            hitArea.roundRect(0, 0, hitW, hitH, 8)
              .fill({ color: highlightColor, alpha: 0.18 })
              .stroke({ width: 3, color: highlightColor, alpha: 0.6 });

            // Preview: highlight characters that would be hit
            const aoeSlots = card.aoeSlots ?? 3;
            let previewTargets = calculateAoeTargets(slot, 'all', aoeSlots);
            // Filter splash targets by maxRange
            if (card.maxRange && caster) {
              previewTargets = previewTargets.filter(t => Math.abs(caster.slotIndex - t.slotIndex) <= card.maxRange!);
            }
            const padding = 8;
            previewTargets.forEach(tc => {
              const tcSprite = characterSpriteMap.get(tc.id);
              if (tcSprite) {
                const hl = new Graphics();
                hl.roundRect(
                  -padding, -padding,
                  tcSprite.width + padding * 2,
                  tcSprite.height + padding * 2,
                  8
                ).stroke({ width: 4, color: highlightColor, alpha: 0.9 });
                hl.x = tcSprite.x;
                hl.y = tcSprite.y;
                hl.zIndex = -1;
                hl.eventMode = 'none';
                app.stage.addChild(hl);
                hoverGraphics.push(hl);
              }
            });
          });

          hitArea.on('pointerleave', () => {
            // Restore subtle appearance
            hitArea.clear();
            hitArea.roundRect(0, 0, hitW, hitH, 8)
              .fill({ color: highlightColor, alpha: 0.08 })
              .stroke({ width: 2, color: highlightColor, alpha: 0.25 });

            // Remove preview highlights
            hoverGraphics.forEach(g => {
              if (g.parent) app.stage.removeChild(g);
            });
            hoverGraphics.length = 0;
          });

          hitArea.on('pointerdown', async () => {
            await playCard(selectedCardId, `slot:${slot}`, renderCallback);
          });

          app.stage.addChild(hitArea);
        }
      }
    }
  }
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
          let canTarget = 
            (card.targeting === 'enemy' && !char.isPlayer) ||
            (card.targeting === 'ally' && char.isPlayer) ||
            (card.targeting === 'self' && char.id === gameStateForCard.currentPlayerId) ||
            (card.targeting === 'single' && !char.isPlayer) || // Default single target = enemy for backwards compat
            isAoe; // AOE can be centered on any character — blast hits everyone in radius
          
          // Range check: if card has maxRange/minRange, verify target is within range of caster
          if (canTarget && (card.maxRange || card.minRange) && card.targeting !== 'self') {
            const caster = gameStateForCard.characters.find(c => c.id === gameStateForCard.currentPlayerId);
            if (caster) {
              const distance = Math.abs(caster.slotIndex - char.slotIndex);
              if (card.maxRange && distance > card.maxRange) {
                canTarget = false;
              }
              if (card.minRange && distance < card.minRange) {
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
              
              // AOE-specific: highlight all characters that will be hit (friendly fire included)
              if (isAoe) {
                const currentPlayer = gameStateForCard.characters.find(c => c.id === gameStateForCard.currentPlayerId);
                
                const aoeSlots = card.aoeSlots ?? 3;
                let targets = calculateAoeTargets(char.slotIndex, 'all', aoeSlots);
                // Filter splash targets by maxRange so preview matches actual hits
                if (card.maxRange && currentPlayer) {
                  targets = targets.filter(t => Math.abs(currentPlayer.slotIndex - t.slotIndex) <= card.maxRange!);
                }
                
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
  
  // --- Stat bars below name ---
  // Layout: [icon] [===bar===]  aligned vertically, HP bar on top, energy bar below
  const totalBarRowW = BAR_ICON_SIZE + BAR_ICON_GAP + BAR_WIDTH;
  const barStartX = x + 100 - totalBarRowW / 2;
  const barX = barStartX + BAR_ICON_SIZE + BAR_ICON_GAP;
  const hpBarY = y + 200;
  const barGap = 4; // vertical gap between bars

  // --- HP bar ---
  {
    // Heal icon to the left of bar
    const hpIcon = createHealIcon(BAR_ICON_SIZE);
    hpIcon.x = barStartX;
    hpIcon.y = hpBarY + (BAR_HEIGHT - BAR_ICON_SIZE) / 2;
    hpIcon.eventMode = 'none';
    app.stage.addChild(hpIcon);

    // Outer shadow
    const shadow = new Graphics();
    shadow.roundRect(-1, -1, BAR_WIDTH + 2, BAR_HEIGHT + 2, BAR_RADIUS + 1)
      .fill({ color: 0x000000, alpha: 0.3 });
    shadow.x = barX; shadow.y = hpBarY;
    app.stage.addChild(shadow);

    // Background
    const bg = new Graphics();
    bg.roundRect(0, 0, BAR_WIDTH, BAR_HEIGHT, BAR_RADIUS)
      .fill(0x1a1a1a)
      .stroke({ width: 1.5, color: 0x000000 });
    bg.x = barX; bg.y = hpBarY;
    app.stage.addChild(bg);

    // Inner bg
    const inner = new Graphics();
    inner.roundRect(1, 1, BAR_WIDTH - 2, BAR_HEIGHT - 2, BAR_RADIUS - 1)
      .fill(0x2a2a2a);
    inner.x = barX; inner.y = hpBarY;
    app.stage.addChild(inner);

    // HP fill
    const hpPercent = char.hp / char.maxHp;
    const fillW = (BAR_WIDTH - 4) * hpPercent;
    if (fillW > 0) {
      const fillColor = char.isPlayer ? 0x22c55e : 0xef4444;
      const lighterColor = char.isPlayer ? 0x4ade80 : 0xf87171;
      const fill = new Graphics();
      fill.roundRect(2, 2, fillW, BAR_HEIGHT - 4, BAR_RADIUS - 1.5).fill(fillColor);
      fill.x = barX; fill.y = hpBarY;
      app.stage.addChild(fill);
      if (fillW > 2) {
        const highlight = new Graphics();
        highlight.roundRect(2, 2, fillW, (BAR_HEIGHT - 4) * 0.4, BAR_RADIUS - 1.5)
          .fill({ color: lighterColor, alpha: 0.6 });
        highlight.x = barX; highlight.y = hpBarY;
        app.stage.addChild(highlight);
      }
    }

    // HP text centered in bar
    const hpText = new Text({
      text: `${char.hp}/${char.maxHp}`,
      style: { fill: 0xffffff, fontSize: 10, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 }, letterSpacing: 0.5 }
    });
    hpText.x = barX + BAR_WIDTH / 2 - hpText.width / 2;
    hpText.y = hpBarY + BAR_HEIGHT / 2 - hpText.height / 2;
    hpText.eventMode = 'none';
    app.stage.addChild(hpText);
  }

  // --- Energy bar ---
  const energyBarY = hpBarY + BAR_HEIGHT + barGap;
  {
    // Energy icon to the left of bar
    const enIcon = createEnergyIcon(BAR_ICON_SIZE);
    enIcon.x = barStartX;
    enIcon.y = energyBarY + (BAR_HEIGHT - BAR_ICON_SIZE) / 2;
    enIcon.eventMode = 'none';
    app.stage.addChild(enIcon);

    // Outer shadow
    const shadow = new Graphics();
    shadow.roundRect(-1, -1, BAR_WIDTH + 2, BAR_HEIGHT + 2, BAR_RADIUS + 1)
      .fill({ color: 0x000000, alpha: 0.3 });
    shadow.x = barX; shadow.y = energyBarY;
    app.stage.addChild(shadow);

    // Background
    const bg = new Graphics();
    bg.roundRect(0, 0, BAR_WIDTH, BAR_HEIGHT, BAR_RADIUS)
      .fill(0x1a1a1a)
      .stroke({ width: 1.5, color: 0x000000 });
    bg.x = barX; bg.y = energyBarY;
    app.stage.addChild(bg);

    // Inner bg
    const inner = new Graphics();
    inner.roundRect(1, 1, BAR_WIDTH - 2, BAR_HEIGHT - 2, BAR_RADIUS - 1)
      .fill(0x2a2a2a);
    inner.x = barX; inner.y = energyBarY;
    app.stage.addChild(inner);

    // Energy fill
    const enPercent = char.maxEnergy > 0 ? char.energy / char.maxEnergy : 0;
    const fillW = (BAR_WIDTH - 4) * enPercent;
    if (fillW > 0) {
      const fill = new Graphics();
      fill.roundRect(2, 2, fillW, BAR_HEIGHT - 4, BAR_RADIUS - 1.5).fill(0x38bdf8);
      fill.x = barX; fill.y = energyBarY;
      app.stage.addChild(fill);
      if (fillW > 2) {
        const highlight = new Graphics();
        highlight.roundRect(2, 2, fillW, (BAR_HEIGHT - 4) * 0.4, BAR_RADIUS - 1.5)
          .fill({ color: 0x7dd3fc, alpha: 0.6 });
        highlight.x = barX; highlight.y = energyBarY;
        app.stage.addChild(highlight);
      }
    }

    // Energy text centered in bar
    const enText = new Text({
      text: `${char.energy}/${char.maxEnergy}`,
      style: { fill: 0xffffff, fontSize: 10, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 }, letterSpacing: 0.5 }
    });
    enText.x = barX + BAR_WIDTH / 2 - enText.width / 2;
    enText.y = energyBarY + BAR_HEIGHT / 2 - enText.height / 2;
    enText.eventMode = 'none';
    app.stage.addChild(enText);
  }

  // Block display - shield icon with number (like STS), positioned to the right of bars
  const totalBlock = getTotalBlock(char);

  if (totalBlock > 0) {
    const shieldX = x + 100 + totalBarRowW / 2 + 14;
    const shieldY = hpBarY + BAR_HEIGHT / 2;
    const shieldWidth = 32;
    const shieldHeight = 38;

    const shield = new Graphics();
    const halfWidth = shieldWidth / 2;
    const topArcRadius = shieldWidth * 0.45;

    shield.moveTo(-halfWidth, -shieldHeight/2 + topArcRadius)
      .arc(0, -shieldHeight/2 + topArcRadius, topArcRadius, Math.PI, 0, false)
      .lineTo(halfWidth * 0.7, shieldHeight/2 * 0.5)
      .lineTo(halfWidth * 0.55, shieldHeight/2 * 0.75)
      .lineTo(0, shieldHeight/2)
      .lineTo(-halfWidth * 0.55, shieldHeight/2 * 0.75)
      .lineTo(-halfWidth * 0.7, shieldHeight/2 * 0.5)
      .closePath();

    shield.fill(0x60a5fa);
    shield.stroke({ width: 2.5, color: 0x1e40af });
    shield.x = shieldX; shield.y = shieldY;
    shield.eventMode = 'none';
    app.stage.addChild(shield);

    const blockText = new Text({
      text: totalBlock.toString(),
      style: { fill: 0xffffff, fontSize: 16, fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } }
    });
    blockText.x = shieldX - blockText.width / 2;
    blockText.y = shieldY - blockText.height / 2 + 2;
    blockText.eventMode = 'none';
    app.stage.addChild(blockText);
  }
  
  // --- Status effect badges above sprite ---
  const statusBadgeY = y - 45;
  renderStatusBadges(app, char, x, statusBadgeY);

  // Add turn indicator arrow if this is the current player (above badges)
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
    arrow.y = statusBadgeY - 10;
    app.stage.addChild(arrow);
  }
}

// ── Status effect badge rendering ─────────────────────────────────────

const BADGE_MIN_W = 28;
const BADGE_H = 16;
const BADGE_GAP = 3;
const BADGE_ICON_SIZE = 10;
const BADGE_ICON_GAP = 2;  // gap between multiple icons
const BADGE_RADIUS = 4;
const BADGE_PAD_X = 3;     // horizontal padding inside badge

/**
 * Calculate badge width based on number of icons and whether text label is present.
 */
function calcBadgeWidth(iconCount: number, hasLabel: boolean): number {
  const iconsW = iconCount * BADGE_ICON_SIZE + Math.max(0, iconCount - 1) * BADGE_ICON_GAP;
  const textW = hasLabel ? 18 : 0; // approximate space for "+N" or stack number
  return Math.max(BADGE_MIN_W, BADGE_PAD_X * 2 + iconsW + (hasLabel ? 3 : 0) + textW);
}

/**
 * Render a row of status effect badges above a character's sprite.
 * Each badge is a small colored pill with icon(s) and optional stack/value text.
 * Badges are interactive: hovering shows a tooltip with the effect description.
 */
function renderStatusBadges(
  app: Application,
  char: Character,
  charX: number,
  rowY: number,
): void {
  const statuses = char.statuses ?? [];

  // Filter to statuses that have a display config
  const visible = statuses
    .filter(s => s.id !== 'suppressed') // handle suppressed separately below
    .map(s => ({ status: s, config: getStatusDisplay(s.id) }))
    .filter((entry): entry is { status: typeof statuses[0]; config: NonNullable<ReturnType<typeof getStatusDisplay>> } => !!entry.config);

  // Inject virtual "suppressed" badge if character is proximity-suppressed.
  // Shows the total energy penalty (base + status stacks) as "+N".
  if (isCharacterSuppressed(char)) {
    const suppressedConfig = getStatusDisplay('suppressed');
    if (suppressedConfig) {
      const netPenalty = getNetSuppressionPenalty(char);
      const explicitStacks = (statuses.find(s => s.id === 'suppressed')?.stacks) ?? 0;
      const stackCost = getSuppressionStackCost({ character: char });
      const totalPenalty = netPenalty + explicitStacks * stackCost;
      visible.push({
        status: { id: 'suppressed', stacks: totalPenalty },
        config: suppressedConfig,
      });
    }
  }

  // Inject virtual speed badge if character's speed differs from baseline (0).
  if (char.speed !== 0) {
    const speedStatusId = char.speed > 0 ? 'speed_up' : 'speed_down';
    const speedConfig = getStatusDisplay(speedStatusId);
    if (speedConfig) {
      visible.push({
        status: { id: speedStatusId, stacks: Math.abs(char.speed) },
        config: speedConfig,
      });
    }
  }

  if (visible.length === 0) return;

  // Pre-calculate badge widths and labels
  const badgeData = visible.map(({ status, config }) => {
    let labelText = '';
    if (status.id === 'suppressed') {
      labelText = `+${status.stacks}`;
    } else if (status.id === 'speed_up') {
      labelText = `+${status.stacks}`;
    } else if (status.id === 'speed_down') {
      labelText = `-${status.stacks}`;
    } else if (status.stacks > 1) {
      labelText = `${status.stacks}`;
    }
    const iconCount = config.drawIcons.length;
    const badgeW = calcBadgeWidth(iconCount, labelText.length > 0);
    return { status, config, labelText, badgeW };
  });

  // Center the badge row above the character (character center = charX + 100)
  const totalWidth = badgeData.reduce((sum, b) => sum + b.badgeW, 0) + Math.max(0, badgeData.length - 1) * BADGE_GAP;
  const charCenterX = charX + 100;
  let badgeX = charCenterX - totalWidth / 2;

  for (const { status, config, labelText, badgeW } of badgeData) {
    // Badge background pill (interactive for tooltip)
    const bg = new Graphics();
    bg.roundRect(0, 0, badgeW, BADGE_H, BADGE_RADIUS)
      .fill({ color: config.bgColor, alpha: 0.9 })
      .stroke({ width: 1.2, color: config.borderColor, alpha: 0.85 });
    bg.x = badgeX;
    bg.y = rowY;
    bg.eventMode = 'static';
    bg.cursor = 'help';

    // Hover: show tooltip
    const tooltipX = badgeX + badgeW / 2;
    const tooltipY = rowY;
    const statusId = status.id;
    const stacks = status.stacks;
    bg.on('pointerenter', () => {
      if (setHoveredStatus(statusId, stacks, tooltipX, tooltipY)) {
        renderCallback();
      }
    });
    bg.on('pointerleave', () => {
      if (setHoveredStatus(null, 0)) {
        renderCallback();
      }
    });

    app.stage.addChild(bg);

    // Draw icons (supports multiple per badge)
    let iconX = badgeX + BADGE_PAD_X;
    const iconY = rowY + (BADGE_H - BADGE_ICON_SIZE) / 2;
    for (const drawFn of config.drawIcons) {
      const icon = new Graphics();
      drawFn(icon, BADGE_ICON_SIZE);
      icon.x = iconX;
      icon.y = iconY;
      icon.eventMode = 'none';
      app.stage.addChild(icon);
      iconX += BADGE_ICON_SIZE + BADGE_ICON_GAP;
    }

    // Stack / value text
    if (labelText) {
      const stackText = new Text({
        text: labelText,
        style: {
          fill: config.iconColor,
          fontSize: 9,
          fontWeight: 'bold',
          stroke: { color: 0x000000, width: 2 },
        },
      });
      stackText.x = iconX + 1;
      stackText.y = rowY + BADGE_H / 2 - stackText.height / 2;
      stackText.eventMode = 'none';
      app.stage.addChild(stackText);
    }

    badgeX += badgeW + BADGE_GAP;
  }
}

