// Character rendering

import type { Application, Texture, Sprite } from 'pixi.js';
import { Assets, Text, Graphics, Sprite as SpriteImpl } from 'pixi.js';
import type { GameState, Character, CharacterDefinition } from '../core/types.js';
import { getSelectedCardId, getGameState } from '../core/gameState.js';
import { playCard, calculateAoeTargets, getOccupiedSlots, getCharacterSlotSize, isCharacterSuppressed, getNetSuppressionPenalty } from '../core/combat.js';
import { getSuppressionStackCost } from '../core/constants.js';
import { render as renderCallback } from './renderer.js';
import { registerCharacterSprite } from '../../animations.js';
import { getTotalBlock } from '../core/block.js';
import { MAX_SLOTS, WIDTH, HEIGHT, calculateRangeModifier } from '../core/constants.js';
import { createEnergyIcon } from './icons/energyIcon.js';
import { createHealIcon } from './icons/healIcon.js';
import { getStatusDisplay } from './statusConfig.js';
import {
  registerCharacterHoverRegion,
  registerStatusHoverRegion,
  setHoveredCharacter,
  setHoveredStatus,
} from './tooltipState.js';
import { getModifierRegistry } from '../core/modifiers.js';

const BATTLE_Y_OFFSET = 265;

/** Typical character sprite size (max width or height). */
const CHAR_SPRITE_SIZE = 250;
const CHAR_CENTER = CHAR_SPRITE_SIZE / 2;
const BATTLE_GROUND_OFFSET = 180;
const BATTLE_SIDE_OVERSCAN = 40;
const BATTLE_LEFT_BASE = -BATTLE_SIDE_OVERSCAN;
const BATTLE_RIGHT_BASE = WIDTH - CHAR_SPRITE_SIZE + BATTLE_SIDE_OVERSCAN;
const LANE_SELECTOR_WIDTH = 80;
const LANE_SELECTOR_HEIGHT = 200;
const LANE_SELECTOR_RADIUS = 8;
const DEBUG_POSITION_STORAGE_KEY = 'slayai:debug:char-position';

export const ENERGY_ICON_SIZE = 14;

// Shared bar layout constants
const BAR_ICON_SIZE = 13;
const BAR_ICON_GAP = 3;
const BAR_WIDTH = 80;
const BAR_HEIGHT = 14;
const BAR_RADIUS = 5;
const BAR_GAP = 4;

// HUD placement below characters
const HUD_BOTTOM_OFFSET = 14;
const HUD_SECTION_GAP = 6;
const STATUS_MAX_ROW_WIDTH = 130;
const MAX_VISIBLE_STATUS_BADGES = 4;

// Layering buckets
const Z_SPRITE = 100;
const Z_NAME = 180;
const Z_BARS = 220;
const Z_BLOCK = 230;
const Z_STATUS = 260;
const Z_ARROW = 280;

// Map to store character sprites for AOE highlighting
const characterSpriteMap = new Map<string, SpriteImpl>();
const TARGETING_FEEDBACK_DURATION_MS = 1400;

type TargetingFeedback = {
  message: string;
  expiresAt: number;
};

let activeTargetingFeedback: TargetingFeedback | null = null;
let targetingFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;

export type ResolvedVisualProfile = {
  scale: number;
  anchorX: number;
  anchorY: number;
  offsetX: number;
  offsetY: number;
};

function showTargetingFeedback(message: string): void {
  activeTargetingFeedback = {
    message,
    expiresAt: Date.now() + TARGETING_FEEDBACK_DURATION_MS,
  };
  if (targetingFeedbackTimeout) {
    clearTimeout(targetingFeedbackTimeout);
  }
  targetingFeedbackTimeout = setTimeout(() => {
    activeTargetingFeedback = null;
    renderCallback();
  }, TARGETING_FEEDBACK_DURATION_MS);
}

function getRangeError(card: { minRange?: number; maxRange?: number }, distance: number): string | null {
  if (card.maxRange && distance > card.maxRange) {
    return `Out of range! (${distance} slots, max ${card.maxRange})`;
  }
  if (card.minRange && distance < card.minRange) {
    return `Too close! (${distance} slots, min ${card.minRange})`;
  }
  return null;
}

function renderTargetingFeedback(app: Application): void {
  if (!activeTargetingFeedback) return;
  if (Date.now() > activeTargetingFeedback.expiresAt) {
    activeTargetingFeedback = null;
    return;
  }

  const padX = 14;
  const padY = 7;
  const text = new Text({
    text: activeTargetingFeedback.message,
    style: { fill: 0xfbbf24, fontSize: 14, fontWeight: 'bold' },
  });
  const bubbleW = text.width + padX * 2;
  const bubbleH = text.height + padY * 2;
  const bubbleX = (WIDTH - bubbleW) / 2;
  const bubbleY = 320;

  const bubble = new Graphics();
  bubble.roundRect(0, 0, bubbleW, bubbleH, 8)
    .fill({ color: 0x1c1917, alpha: 0.92 })
    .stroke({ width: 2, color: 0xb45309, alpha: 0.85 });
  bubble.x = bubbleX;
  bubble.y = bubbleY;
  bubble.eventMode = 'none';
  bubble.zIndex = 3001;
  app.stage.addChild(bubble);

  text.x = bubbleX + padX;
  text.y = bubbleY + padY;
  text.eventMode = 'none';
  text.zIndex = 3002;
  app.stage.addChild(text);
}

function clamp01(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function parseBoolFlag(value: string | null): boolean {
  return value === '1' || value === 'true' || value === 'on';
}

function shouldShowPositionDebugOverlay(): boolean {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('debugCharPos');
    if (fromQuery !== null) {
      return parseBoolFlag(fromQuery.toLowerCase());
    }
    return parseBoolFlag(window.localStorage.getItem(DEBUG_POSITION_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function resolveVisualProfile(charDef?: CharacterDefinition): ResolvedVisualProfile {
  const visual = charDef?.visual;
  const scale = visual?.scale ?? charDef?.spriteScale ?? 1;
  const anchorX = visual?.anchorX ?? charDef?.spriteAnchorX ?? 0.5;
  const anchorY = visual?.anchorY ?? charDef?.spriteAnchorY ?? 1;
  const offsetX = visual?.offsetX ?? charDef?.spriteOffsetX ?? 0;
  const offsetY = visual?.offsetY ?? charDef?.spriteOffsetY ?? 0;

  return {
    scale: Number.isFinite(scale) ? scale : 1,
    anchorX: clamp01(anchorX, 0.5),
    anchorY: clamp01(anchorY, 1),
    offsetX: Number.isFinite(offsetX) ? offsetX : 0,
    offsetY: Number.isFinite(offsetY) ? offsetY : 0,
  };
}

export function computeSpritePlacement(
  slotCenterX: number,
  groundY: number,
  spriteWidth: number,
  spriteHeight: number,
  profile: ResolvedVisualProfile
): { x: number; y: number } {
  return {
    x: slotCenterX + profile.offsetX + (profile.anchorX - 0.5) * spriteWidth,
    y: groundY + profile.offsetY - (1 - profile.anchorY) * spriteHeight,
  };
}

function drawPositionDebugOverlay(
  app: Application,
  slotCenterX: number,
  groundY: number,
  profile: ResolvedVisualProfile
): void {
  const overlay = new Graphics();
  overlay.moveTo(slotCenterX - 26, groundY).lineTo(slotCenterX + 26, groundY)
    .stroke({ width: 2, color: 0x00e5ff, alpha: 0.7 });
  overlay.moveTo(slotCenterX, groundY - 24).lineTo(slotCenterX, groundY + 24)
    .stroke({ width: 2, color: 0x00e5ff, alpha: 0.45 });
  overlay.circle(slotCenterX + profile.offsetX, groundY + profile.offsetY, 3)
    .fill({ color: 0xfff59d, alpha: 0.95 });
  overlay.eventMode = 'none';
  overlay.zIndex = Z_SPRITE - 1;
  app.stage.addChild(overlay);
}

function getSlotSpacing(): number {
  const availableWidth = BATTLE_RIGHT_BASE - BATTLE_LEFT_BASE;
  return MAX_SLOTS > 1 ? availableWidth / (MAX_SLOTS - 1) : 0;
}

function getSlotCenterX(slotIndex: number): number {
  return BATTLE_LEFT_BASE + slotIndex * getSlotSpacing() + CHAR_CENTER;
}

function getCharacterCenterSlotIndex(character: Character): number {
  const size = getCharacterSlotSize(character);
  return character.slotIndex + (size - 1) / 2;
}

function createLaneSelectorHighlight(
  slotCenterX: number,
  groundY: number,
  color: number,
  strokeAlpha = 0.9,
  fillAlpha = 0.12
): Graphics {
  const selector = new Graphics();
  selector.roundRect(
    slotCenterX - LANE_SELECTOR_WIDTH / 2,
    groundY - LANE_SELECTOR_HEIGHT,
    LANE_SELECTOR_WIDTH,
    LANE_SELECTOR_HEIGHT,
    LANE_SELECTOR_RADIUS
  )
    .fill({ color, alpha: fillAlpha })
    .stroke({ width: 3, color, alpha: strokeAlpha });
  selector.eventMode = 'none';
  selector.zIndex = Z_SPRITE - 1;
  return selector;
}

/**
 * Render all characters on the battlefield
 */
export function renderCharacters(app: Application, gameState: GameState): void {
  const selectedCardId = getSelectedCardId();
  const battleY = HEIGHT - BATTLE_Y_OFFSET; // Move characters down towards bottom
  const battleGroundY = battleY + BATTLE_GROUND_OFFSET;
  const showPositionDebug = shouldShowPositionDebugOverlay();
  const leftBase = BATTLE_LEFT_BASE;
  const rightBase = BATTLE_RIGHT_BASE;
  
  // Clear sprite map for this render cycle
  characterSpriteMap.clear();
  
  // Fixed lane grid: allies on low slots, enemies on high slots.
  const allies = gameState.characters.filter(c => c.isPlayer && c.hp > 0).sort((a, b) => a.slotIndex - b.slotIndex);
  const enemies = gameState.characters.filter(c => !c.isPlayer && c.hp > 0).sort((a, b) => a.slotIndex - b.slotIndex);
  const availableWidth = rightBase - leftBase;
  const slotSpacing = MAX_SLOTS > 1 ? availableWidth / (MAX_SLOTS - 1) : 0;
  
  allies.forEach((char) => {
    const centerSlot = getCharacterCenterSlotIndex(char);
    const x = leftBase + centerSlot * slotSpacing;
    renderCharacter(app, gameState, char, x, battleGroundY, showPositionDebug);
  });
  
  enemies.forEach((char) => {
    const centerSlot = getCharacterCenterSlotIndex(char);
    const x = leftBase + centerSlot * slotSpacing;
    renderCharacter(app, gameState, char, x, battleGroundY, showPositionDebug);
  });

  // --- Render clickable empty-slot hit areas for AOE cards ---
  const selectedCardIdForAoe = selectedCardId;
  if (selectedCardIdForAoe) {
    const gsForCard = getGameState();
    const card = gsForCard.cardLibrary[selectedCardIdForAoe] || (() => {
      const inst = gsForCard.cardInstances[selectedCardIdForAoe];
      return inst ? gsForCard.cardLibrary[inst.templateId] : null;
    })();

    if (card && card.targeting === 'aoe') {
      const caster = gsForCard.characters.find(c => c.id === gsForCard.currentPlayerId);
      if (caster) {
        // Collect occupied slot indices (any living character)
        const occupiedSlots = new Set<number>();
        gsForCard.characters.filter(c => c.hp > 0).forEach(c => {
          getOccupiedSlots(c).forEach(slot => occupiedSlots.add(slot));
        });

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
          const hitW = LANE_SELECTOR_WIDTH;
          const hitH = LANE_SELECTOR_HEIGHT;
          const hitX = slotX + CHAR_CENTER - hitW / 2;
          const hitY = battleGroundY - hitH;

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
                const hlW = tcSprite.width + padding * 2;
                const hlH = tcSprite.height + padding * 2;
                hl.roundRect(-padding, -padding, hlW, hlH, 8)
                  .stroke({ width: 4, color: highlightColor, alpha: 0.9 });
                // Rect drawn at (-padding,-padding); position so rect top-left = sprite top-left - padding
                hl.x = tcSprite.x - tcSprite.width / 2;
                hl.y = tcSprite.y - tcSprite.height / 2;
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
            await playCard(selectedCardIdForAoe, `slot:${slot}`, renderCallback);
          });

          app.stage.addChild(hitArea);
        }
      }
    }
  }

  // Keep warning above character layer, but below tooltips/modals.
  renderTargetingFeedback(app);
}

/**
 * Render a single character
 */
function renderCharacter(
  app: Application,
  gameState: GameState,
  char: Character,
  slotX: number,
  groundY: number,
  showPositionDebug: boolean
): void {
  const charDef = gameState.characterLibrary[char.id];
  const slotCenterX = slotX + CHAR_CENTER;
  const visual = resolveVisualProfile(charDef);
  
  // Character sprite as main entity
  if (charDef && charDef.sprite) {
      const base = import.meta.env.BASE_URL ?? '/';
      const spritePath = charDef.sprite.startsWith('/') ? `${base}${charDef.sprite.slice(1)}` : charDef.sprite;
      Assets.load(spritePath).then((texture: Texture) => {
      const sprite = new SpriteImpl(texture);
      sprite.roundPixels = false;

      // Maintain aspect ratio and make larger for better quality
      const baseSize = 200;
      const scale = visual.scale;
      const targetSize = baseSize * scale;
      const aspectRatio = texture.width / texture.height;
      if (aspectRatio > 1) {
        sprite.width = targetSize;
        sprite.height = targetSize / aspectRatio;
      } else {
        sprite.height = targetSize;
        sprite.width = targetSize * aspectRatio;
      }

      // Center anchor (with optional per-character override) so sprite stays centered when scaling
      const anchorX = visual.anchorX;
      const anchorY = visual.anchorY;
      sprite.anchor.set(anchorX, anchorY);
      // Keep visual center and foot contact stable, regardless of anchor changes.
      const placement = computeSpritePlacement(slotCenterX, groundY, sprite.width, sprite.height, visual);
      sprite.x = placement.x;
      sprite.y = placement.y;
      sprite.zIndex = Z_SPRITE;

      if (showPositionDebug) {
        drawPositionDebugOverlay(app, slotCenterX, groundY, visual);
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
          const matchesTargetType =
            (card.targeting === 'enemy' && !char.isPlayer) ||
            (card.targeting === 'ally' && char.isPlayer) ||
            (card.targeting === 'self' && char.id === gameStateForCard.currentPlayerId) ||
            (card.targeting === 'single' && !char.isPlayer) || // Default single target = enemy for backwards compat
            isAoe; // AOE can be centered on any character — blast hits everyone in radius
          let rangeError: string | null = null;
          if (matchesTargetType && (card.maxRange || card.minRange) && card.targeting !== 'self') {
            const caster = gameStateForCard.characters.find(c => c.id === gameStateForCard.currentPlayerId);
            if (caster) {
              const distance = Math.abs(caster.slotIndex - char.slotIndex);
              rangeError = getRangeError(card, distance);
            }
          }
          const canTarget = matchesTargetType && !rangeError;
          
          if (canTarget) {
            // Targetable sprites must be interactive; passive mode prevents pointer events.
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
            // With center anchor, sprite.x/sprite.y are the center; scaling stays centered automatically
            sprite.on('pointerenter', () => {
              const centerX = sprite.x;
              const centerY = sprite.y;

              sprite.scale.set(originalScaleX * 1.1, originalScaleY * 1.1);

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
              
              // Draw selector anchored to lane, independent of sprite visual offsets/scales.
              primaryHighlight = createLaneSelectorHighlight(slotCenterX, groundY, highlightColor);
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
                      const targetSlotCenterX = getSlotCenterX(getCharacterCenterSlotIndex(targetChar));
                      const highlight = createLaneSelectorHighlight(targetSlotCenterX, groundY, highlightColor);
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
                      const targetSlotCenterX = getSlotCenterX(getCharacterCenterSlotIndex(targetChar));
                      const highlight = createLaneSelectorHighlight(targetSlotCenterX, groundY, highlightColor);
                      app.stage.addChild(highlight);
                      highlightGraphics.push(highlight);
                    }
                  }
                });
              }
            });
            
            // Remove hover effects
            sprite.on('pointerleave', () => {
              sprite.scale.set(originalScaleX, originalScaleY);

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
          } else if (matchesTargetType && rangeError) {
            sprite.eventMode = 'static';
            sprite.cursor = 'not-allowed';
            sprite.on('pointerdown', () => {
              showTargetingFeedback(rangeError!);
              renderCallback();
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
  
  // --- Below-sprite HUD stack ---
  // Bars anchor below each character's ground point so core combat stats stay under the sprite.
  const hpBarY = groundY + HUD_BOTTOM_OFFSET;

  // --- Stat bars ---
  // Layout: [icon] [===bar===] aligned vertically, HP bar on top, energy bar below
  const totalBarRowW = BAR_ICON_SIZE + BAR_ICON_GAP + BAR_WIDTH;
  const barStartX = slotCenterX - totalBarRowW / 2;
  const barX = barStartX + BAR_ICON_SIZE + BAR_ICON_GAP;
  const bindCharacterHover = (target: Graphics): void => {
    target.eventMode = 'static';
    target.cursor = 'help';
    target.on('pointerenter', () => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre3',hypothesisId:'N7',location:'renderCharacters.ts:bindCharacterHover:pointerenter',message:'character_hover_pointerenter',data:{characterId:char.id},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const selectedCardId = getSelectedCardId();
      if (selectedCardId) {
        if (setHoveredCharacter(null, 0, 0)) {
          renderCallback();
        }
        return;
      }
      if (setHoveredCharacter(char.id, slotCenterX, hpBarY)) {
        renderCallback();
      }
    });
    // Use pointerout (instead of pointerleave) because these HUD elements are
    // recreated on every render; pointerleave can be missed when a hovered
    // object is replaced during a re-render.
    target.on('pointerout', () => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre3',hypothesisId:'N7',location:'renderCharacters.ts:bindCharacterHover:pointerout',message:'character_hover_pointerout',data:{characterId:char.id},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (setHoveredCharacter(null, 0, 0)) {
        renderCallback();
      }
    });
    target.on('pointerupoutside', () => {
      if (setHoveredCharacter(null, 0, 0)) {
        renderCallback();
      }
    });
    target.on('pointercancel', () => {
      if (setHoveredCharacter(null, 0, 0)) {
        renderCallback();
      }
    });
  };
  // --- HP bar ---
  {
    // Heal icon to the left of bar
    const hpIcon = createHealIcon(BAR_ICON_SIZE);
    hpIcon.x = barStartX;
    hpIcon.y = hpBarY + (BAR_HEIGHT - BAR_ICON_SIZE) / 2;
    hpIcon.eventMode = 'none';
    hpIcon.zIndex = Z_BARS;
    app.stage.addChild(hpIcon);

    // Outer shadow
    const shadow = new Graphics();
    shadow.roundRect(-1, -1, BAR_WIDTH + 2, BAR_HEIGHT + 2, BAR_RADIUS + 1)
      .fill({ color: 0x000000, alpha: 0.3 });
    shadow.x = barX; shadow.y = hpBarY;
    shadow.zIndex = Z_BARS;
    app.stage.addChild(shadow);

    // Background
    const bg = new Graphics();
    bg.roundRect(0, 0, BAR_WIDTH, BAR_HEIGHT, BAR_RADIUS)
      .fill(0x1a1a1a)
      .stroke({ width: 1.5, color: 0x000000 });
    bg.x = barX; bg.y = hpBarY;
    bg.zIndex = Z_BARS;
    app.stage.addChild(bg);

    // Inner bg
    const inner = new Graphics();
    inner.roundRect(1, 1, BAR_WIDTH - 2, BAR_HEIGHT - 2, BAR_RADIUS - 1)
      .fill(0x2a2a2a);
    inner.x = barX; inner.y = hpBarY;
    inner.zIndex = Z_BARS;
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
      fill.zIndex = Z_BARS;
      app.stage.addChild(fill);
      if (fillW > 2) {
        const highlight = new Graphics();
        highlight.roundRect(2, 2, fillW, (BAR_HEIGHT - 4) * 0.4, BAR_RADIUS - 1.5)
          .fill({ color: lighterColor, alpha: 0.6 });
        highlight.x = barX; highlight.y = hpBarY;
        highlight.zIndex = Z_BARS + 1;
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
    hpText.zIndex = Z_BARS + 2;
    app.stage.addChild(hpText);

    // Hover zone so details show on HP row hover.
    const hpHoverZone = new Graphics();
    hpHoverZone.roundRect(0, 0, totalBarRowW, BAR_HEIGHT, BAR_RADIUS).fill({ color: 0xffffff, alpha: 0.001 });
    hpHoverZone.x = barStartX;
    hpHoverZone.y = hpBarY;
    hpHoverZone.zIndex = Z_BARS + 3;
    registerCharacterHoverRegion(char.id, barStartX, hpBarY, totalBarRowW, BAR_HEIGHT);
    bindCharacterHover(hpHoverZone);
    app.stage.addChild(hpHoverZone);
  }

  // --- Energy bar ---
  const energyBarY = hpBarY + BAR_HEIGHT + BAR_GAP;
  {
    // Energy icon to the left of bar
    const enIcon = createEnergyIcon(BAR_ICON_SIZE);
    enIcon.x = barStartX;
    enIcon.y = energyBarY + (BAR_HEIGHT - BAR_ICON_SIZE) / 2;
    enIcon.eventMode = 'none';
    enIcon.zIndex = Z_BARS;
    app.stage.addChild(enIcon);

    // Outer shadow
    const shadow = new Graphics();
    shadow.roundRect(-1, -1, BAR_WIDTH + 2, BAR_HEIGHT + 2, BAR_RADIUS + 1)
      .fill({ color: 0x000000, alpha: 0.3 });
    shadow.x = barX; shadow.y = energyBarY;
    shadow.zIndex = Z_BARS;
    app.stage.addChild(shadow);

    // Background
    const bg = new Graphics();
    bg.roundRect(0, 0, BAR_WIDTH, BAR_HEIGHT, BAR_RADIUS)
      .fill(0x1a1a1a)
      .stroke({ width: 1.5, color: 0x000000 });
    bg.x = barX; bg.y = energyBarY;
    bg.zIndex = Z_BARS;
    app.stage.addChild(bg);

    // Inner bg
    const inner = new Graphics();
    inner.roundRect(1, 1, BAR_WIDTH - 2, BAR_HEIGHT - 2, BAR_RADIUS - 1)
      .fill(0x2a2a2a);
    inner.x = barX; inner.y = energyBarY;
    inner.zIndex = Z_BARS;
    app.stage.addChild(inner);

    // Energy fill
    const enPercent = char.maxEnergy > 0 ? char.energy / char.maxEnergy : 0;
    const fillW = (BAR_WIDTH - 4) * enPercent;
    if (fillW > 0) {
      const fill = new Graphics();
      fill.roundRect(2, 2, fillW, BAR_HEIGHT - 4, BAR_RADIUS - 1.5).fill(0x38bdf8);
      fill.x = barX; fill.y = energyBarY;
      fill.zIndex = Z_BARS;
      app.stage.addChild(fill);
      if (fillW > 2) {
        const highlight = new Graphics();
        highlight.roundRect(2, 2, fillW, (BAR_HEIGHT - 4) * 0.4, BAR_RADIUS - 1.5)
          .fill({ color: 0x7dd3fc, alpha: 0.6 });
        highlight.x = barX; highlight.y = energyBarY;
        highlight.zIndex = Z_BARS + 1;
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
    enText.zIndex = Z_BARS + 2;
    app.stage.addChild(enText);

    // Hover zone so details show on Energy row hover.
    const energyHoverZone = new Graphics();
    energyHoverZone.roundRect(0, 0, totalBarRowW, BAR_HEIGHT, BAR_RADIUS).fill({ color: 0xffffff, alpha: 0.001 });
    energyHoverZone.x = barStartX;
    energyHoverZone.y = energyBarY;
    energyHoverZone.zIndex = Z_BARS + 3;
    registerCharacterHoverRegion(char.id, barStartX, energyBarY, totalBarRowW, BAR_HEIGHT);
    bindCharacterHover(energyHoverZone);
    app.stage.addChild(energyHoverZone);
  }

  // Buff/debuff rows under the bars
  const statusTopY = energyBarY + BAR_HEIGHT + HUD_SECTION_GAP;
  const statusLayout = renderStatusBadges(app, char, slotCenterX, statusTopY, STATUS_MAX_ROW_WIDTH);

  // Block display - shield icon with number (like STS), positioned to the right of bars
  const totalBlock = getTotalBlock(char);

  if (totalBlock > 0) {
    const shieldX = slotCenterX + totalBarRowW / 2 + 14;
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
    shield.zIndex = Z_BLOCK;
    app.stage.addChild(shield);

    const blockText = new Text({
      text: totalBlock.toString(),
      style: { fill: 0xffffff, fontSize: 16, fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } }
    });
    blockText.x = shieldX - blockText.width / 2;
    blockText.y = shieldY - blockText.height / 2 + 2;
    blockText.eventMode = 'none';
    blockText.zIndex = Z_BLOCK + 1;
    app.stage.addChild(blockText);
  }

  // Keep the turn arrow near the character, above the sprite HUD.
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
    arrow.x = slotCenterX;
    arrow.y = hpBarY - 8;
    arrow.zIndex = Z_ARROW;
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
 * Render a row of status effect badges starting at a top edge.
 * Each badge is a small colored pill with icon(s) and optional stack/value text.
 * Badges are interactive: hovering shows a tooltip with the effect description.
 */
function renderStatusBadges(
  app: Application,
  char: Character,
  charCenterX: number,
  rowTopY: number,
  maxRowWidth: number,
): { topY: number; bottomY: number; rows: number } {
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

  // Inject virtual gear modifier badges (block_up, damage_up) from the modifier registry.
  {
    const registry = getModifierRegistry();
    const gearBadges: Array<{ id: string; target: string }> = [
      { id: 'block_up', target: 'block_amount' },
      { id: 'damage_up', target: 'damage_dealt' },
    ];
    for (const { id, target } of gearBadges) {
      const mods = registry.getByTarget(target)
        .filter(m => m.source.startsWith('gear:') && m.scope.kind === 'character' && m.scope.characterId === char.id);
      if (mods.length > 0) {
        const cfg = getStatusDisplay(id);
        if (cfg) {
          let totalPct = 0;
          for (const m of mods) {
            if (m.op === 'multiply') totalPct += Math.round((m.value - 1) * 100);
            else if (m.op === 'add') totalPct += m.value;
          }
          visible.push({
            status: { id, stacks: totalPct },
            config: cfg,
          });
        }
      }
    }
  }

  if (visible.length === 0) {
    return { topY: rowTopY, bottomY: rowTopY, rows: 0 };
  }

  // Pre-calculate badge widths and labels
  const badgeData = visible.map(({ status, config }) => {
    let labelText = '';
    if (status.id === 'suppressed') {
      labelText = `+${status.stacks}`;
    } else if (status.id === 'speed_up') {
      labelText = `+${status.stacks}`;
    } else if (status.id === 'speed_down') {
      labelText = `-${status.stacks}`;
    } else if (status.id === 'block_up' || status.id === 'damage_up') {
      labelText = `+${status.stacks}%`;
    } else if (status.stacks > 1) {
      labelText = `${status.stacks}`;
    }
    const iconCount = config.drawIcons.length;
    const badgeW = calcBadgeWidth(iconCount, labelText.length > 0);
    return { status, config, labelText, badgeW };
  });

  // Compact mode: keep statuses on one row, collapsing overflow into a +N badge.
  type BadgeEntry = (typeof badgeData)[number] & { isOverflow?: boolean };
  const compactRow: BadgeEntry[] = [];
  let rowWidth = 0;
  let hiddenCount = 0;

  for (const badge of badgeData) {
    if (compactRow.length >= MAX_VISIBLE_STATUS_BADGES) {
      hiddenCount += 1;
      continue;
    }
    const nextBadgeW = badge.badgeW + (compactRow.length > 0 ? BADGE_GAP : 0);
    if (compactRow.length > 0 && rowWidth + nextBadgeW > maxRowWidth) {
      hiddenCount += 1;
      continue;
    }
    compactRow.push(badge);
    rowWidth += nextBadgeW;
  }

  if (hiddenCount > 0) {
    let overflowW = calcBadgeWidth(0, true);
    while (compactRow.length > 0 && rowWidth + BADGE_GAP + overflowW > maxRowWidth) {
      const removed = compactRow.pop();
      if (!removed) break;
      hiddenCount += 1;
      rowWidth -= removed.badgeW + (compactRow.length > 0 ? BADGE_GAP : 0);
      overflowW = calcBadgeWidth(0, true);
    }
    compactRow.push({
      status: { id: '_overflow', stacks: hiddenCount },
      config: {
        label: 'More',
        description: '',
        iconColor: 0xe5e7eb,
        bgColor: 0x1f2937,
        borderColor: 0x4b5563,
        drawIcons: [],
      },
      labelText: `+${hiddenCount}`,
      badgeW: overflowW,
      isOverflow: true,
    });
  }
  const rows: BadgeEntry[][] = compactRow.length > 0 ? [compactRow] : [];

  rows.forEach((row, rowIndex) => {
    const totalWidth = row.reduce((sum, b) => sum + b.badgeW, 0) + Math.max(0, row.length - 1) * BADGE_GAP;
    let badgeX = charCenterX - totalWidth / 2;
    const currentRowTopY = rowTopY + rowIndex * (BADGE_H + BADGE_GAP);

    for (const { status, config, labelText, badgeW, isOverflow } of row) {
      // Badge background pill (interactive for tooltip)
      const bg = new Graphics();
      bg.roundRect(0, 0, badgeW, BADGE_H, BADGE_RADIUS)
        .fill({ color: config.bgColor, alpha: 0.9 })
        .stroke({ width: 1.2, color: config.borderColor, alpha: 0.85 });
      bg.x = badgeX;
      bg.y = currentRowTopY;
      bg.eventMode = isOverflow ? 'none' : 'static';
      bg.cursor = isOverflow ? 'default' : 'help';
      bg.zIndex = Z_STATUS;

      // Hover: show tooltip
      const tooltipX = badgeX + badgeW / 2;
      const tooltipY = currentRowTopY;
      const statusId = status.id;
      const stacks = status.stacks;
      if (!isOverflow) {
        registerStatusHoverRegion(statusId, badgeX, currentRowTopY, badgeW, BADGE_H);
        bg.on('pointerenter', () => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre3',hypothesisId:'N6',location:'renderCharacters.ts:statusBadge:pointerenter',message:'status_badge_pointerenter',data:{statusId,characterId:char.id},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          if (setHoveredStatus(statusId, stacks, tooltipX, tooltipY)) {
            renderCallback();
          }
        });
        bg.on('pointerout', () => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre3',hypothesisId:'N6',location:'renderCharacters.ts:statusBadge:pointerout',message:'status_badge_pointerout',data:{statusId,characterId:char.id},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          if (setHoveredStatus(null, 0)) {
            renderCallback();
          }
        });
      }

      app.stage.addChild(bg);

      // Draw icons (supports multiple per badge)
      let iconX = badgeX + BADGE_PAD_X;
      const iconY = currentRowTopY + (BADGE_H - BADGE_ICON_SIZE) / 2;
      for (const drawFn of config.drawIcons) {
        const icon = new Graphics();
        drawFn(icon, BADGE_ICON_SIZE);
        icon.x = iconX;
        icon.y = iconY;
        icon.eventMode = 'none';
        icon.zIndex = Z_STATUS + 1;
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
        stackText.y = currentRowTopY + BADGE_H / 2 - stackText.height / 2;
        stackText.eventMode = 'none';
        stackText.zIndex = Z_STATUS + 1;
        app.stage.addChild(stackText);
      }

      badgeX += badgeW + BADGE_GAP;
    }
  });

  const rowsCount = rows.length;
  const bottomY = rowTopY + rowsCount * BADGE_H + Math.max(0, rowsCount - 1) * BADGE_GAP;
  return {
    topY: rowTopY,
    bottomY,
    rows: rowsCount,
  }
}

