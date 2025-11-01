// Hand rendering (player and enemy hands)

import type { Application } from 'pixi.js';
import { Graphics, Text, Rectangle } from 'pixi.js';
import type { GameState, Character } from '../core/types.js';
import { WIDTH } from '../core/constants.js';
import { getCard } from '../core/card.js';
import { getSelectedCardId, setSelectedCardId } from '../core/gameState.js';
import { getRarityColor } from '../utils/cardUtils.js';
import { render as renderCallback } from './renderer.js';
import { playCard } from '../core/combat.js';

/**
 * Render the current player's hand
 */
export function renderHand(app: Application, gameState: GameState): void {
  const currentPlayer = gameState.characters.find(c => c.id === gameState.currentPlayerId);
  if (!currentPlayer) return;
  
  // Always show player hands, but also show enemy hands when it's their turn
  if (currentPlayer.isPlayer) {
    renderPlayerHand(app, gameState, currentPlayer);
  } else {
    renderEnemyHand(app, gameState, currentPlayer);
  }
}

/**
 * Render player hand (interactive)
 */
function renderPlayerHand(app: Application, _gameState: GameState, currentPlayer: Character): void {
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
    const selectedCardId = getSelectedCardId();
    const isSelected = selectedCardId === cardId;
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
    
    bg.on('pointerdown', async () => {
      // If card is already selected and it's self-targeting, play it directly
      if (isSelected && card.targeting === 'self') {
        // Play self-targeting card directly (no target needed)
        await playCard(cardId, undefined, renderCallback);
        setSelectedCardId(null);
      } else {
        // Otherwise, select/deselect the card
        setSelectedCardId(isSelected ? null : cardId);
        renderCallback();
      }
    });
    
    app.stage.addChild(bg);
    
    // Card name
    const name = new Text({
      text: card.name,
      style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' }
    });
    name.x = x + 10;
    name.y = y + 10;
    name.eventMode = 'none';
    app.stage.addChild(name);
    
    // Cost
    const cost = new Text({
      text: `Cost: ${card.cost.energy}`,
      style: { fill: 0x60a5fa, fontSize: 12 }
    });
    cost.x = x + 10;
    cost.y = y + 30;
    cost.eventMode = 'none';
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
    effectText.eventMode = 'none';
    app.stage.addChild(effectText);
    
    // Add rarity indicator in top right corner
    if (card.rarity) {
      const rarityColor = getRarityColor(card.rarity);
      const rarityIcon = new Graphics();
      
      // Draw a diamond shape for rarity
      const iconSize = 8;
      const iconX = x + cardW - 15;
      const iconY = y + 8;
      
      rarityIcon.moveTo(iconX, iconY - iconSize)
               .lineTo(iconX + iconSize, iconY)
               .lineTo(iconX, iconY + iconSize)
               .lineTo(iconX - iconSize, iconY)
               .lineTo(iconX, iconY - iconSize)
               .fill(rarityColor);
      
      app.stage.addChild(rarityIcon);
    }
  });
}

/**
 * Render enemy hand (read-only)
 */
function renderEnemyHand(app: Application, _gameState: GameState, currentPlayer: Character): void {
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
  label.y = y - 20;
  label.eventMode = 'none';
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
    name.eventMode = 'none';
    app.stage.addChild(name);
    
    // Cost
    const cost = new Text({
      text: `Cost: ${card.cost.energy}`,
      style: { fill: 0x60a5fa, fontSize: 10 }
    });
    cost.x = x + 8;
    cost.y = y + 25;
    cost.eventMode = 'none';
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
    effectText.eventMode = 'none';
    app.stage.addChild(effectText);
    
    // Add rarity indicator in top right corner
    if (card.rarity) {
      const rarityColor = getRarityColor(card.rarity);
      const rarityIcon = new Graphics();
      
      // Draw a smaller diamond shape for enemy cards
      const iconSize = 6;
      const iconX = x + cardW - 12;
      const iconY = y + 6;
      
      rarityIcon.moveTo(iconX, iconY - iconSize)
               .lineTo(iconX + iconSize, iconY)
               .lineTo(iconX, iconY + iconSize)
               .lineTo(iconX - iconSize, iconY)
               .lineTo(iconX, iconY - iconSize)
               .fill(rarityColor);
      
      app.stage.addChild(rarityIcon);
    }
  });
}

