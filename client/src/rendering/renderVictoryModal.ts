// Victory modal – shown when all enemies are defeated.
// Displays the gear reward and lets the player click a character to equip it.

import type { Application } from 'pixi.js';
import { Container, Graphics, Text } from 'pixi.js';
import type { GameState, Character, GearDefinition, GearSlot } from '../core/types.js';
import { WIDTH, HEIGHT } from '../core/constants.js';
import { getModifierRegistry } from '../core/modifiers.js';
import { addToCombatLog } from '../core/gameState.js';
import { render } from './renderer.js';

// ── Rarity colours ──────────────────────────────────────────────────
const RARITY_COLORS: Record<string, number> = {
  common: 0x9ca3af,    // grey
  uncommon: 0x22c55e,  // green
  rare: 0xeab308,      // gold
};

const SLOT_LABELS: Record<GearSlot, string> = {
  weapon: 'Weapon',
  armor: 'Armor',
  accessory: 'Accessory',
};

/**
 * Render the victory modal overlay on top of the game scene.
 */
export function renderVictoryModal(app: Application, gameState: GameState): void {
  const reward = gameState.pendingReward;
  if (!reward) return;

  const modal = new Container();
  modal.zIndex = 8000;
  modal.sortableChildren = true;

  // ── Full-screen semi-transparent overlay ────────────────────────────
  const overlay = new Graphics();
  overlay.rect(0, 0, WIDTH, HEIGHT);
  overlay.fill({ color: 0x000000, alpha: 0.75 });
  overlay.eventMode = 'static'; // block clicks through to game
  overlay.zIndex = 0;
  modal.addChild(overlay);

  // ── Title ──────────────────────────────────────────────────────────
  const title = new Text({
    text: 'FIGHT WON!',
    style: {
      fill: 0xfbbf24,
      fontSize: 48,
      fontWeight: 'bold',
      fontFamily: 'monospace',
      dropShadow: {
        color: 0x000000,
        blur: 6,
        distance: 2,
      },
    },
  });
  title.anchor.set(0.5);
  title.x = WIDTH / 2;
  title.y = 100;
  title.zIndex = 1;
  modal.addChild(title);

  // ── Gear card panel ────────────────────────────────────────────────
  const panelW = 360;
  const panelH = 240;
  const panelX = (WIDTH - panelW) / 2;
  const panelY = 160;

  const rarityCol = RARITY_COLORS[reward.rarity] ?? 0xffffff;

  const panel = new Graphics();
  // Border
  panel.roundRect(panelX - 2, panelY - 2, panelW + 4, panelH + 4, 12);
  panel.fill({ color: rarityCol, alpha: 0.9 });
  // Inner fill
  panel.roundRect(panelX, panelY, panelW, panelH, 10);
  panel.fill({ color: 0x1e293b, alpha: 0.95 });
  panel.zIndex = 1;
  modal.addChild(panel);

  // Gear name
  const gearName = new Text({
    text: reward.name,
    style: { fill: rarityCol, fontSize: 24, fontWeight: 'bold', fontFamily: 'monospace' },
  });
  gearName.anchor.set(0.5, 0);
  gearName.x = WIDTH / 2;
  gearName.y = panelY + 16;
  gearName.zIndex = 2;
  modal.addChild(gearName);

  // Slot + rarity line
  const slotLine = new Text({
    text: `${SLOT_LABELS[reward.slot]} · ${reward.rarity.charAt(0).toUpperCase() + reward.rarity.slice(1)}`,
    style: { fill: 0x94a3b8, fontSize: 14, fontFamily: 'monospace' },
  });
  slotLine.anchor.set(0.5, 0);
  slotLine.x = WIDTH / 2;
  slotLine.y = panelY + 48;
  slotLine.zIndex = 2;
  modal.addChild(slotLine);

  // Description
  const desc = new Text({
    text: reward.description,
    style: { fill: 0xe2e8f0, fontSize: 15, fontFamily: 'monospace', wordWrap: true, wordWrapWidth: panelW - 32 },
  });
  desc.anchor.set(0.5, 0);
  desc.x = WIDTH / 2;
  desc.y = panelY + 74;
  desc.zIndex = 2;
  modal.addChild(desc);

  // Stat bonus lines
  const bonusLines = reward.modifiers.map(m => {
    const opLabel = m.op === 'add' ? (m.value >= 0 ? `+${m.value}` : `${m.value}`) : `×${m.value}`;
    return `${opLabel} ${m.target}`;
  }).join('\n');

  const bonusText = new Text({
    text: bonusLines,
    style: { fill: 0x4ade80, fontSize: 16, fontWeight: 'bold', fontFamily: 'monospace' },
  });
  bonusText.anchor.set(0.5, 0);
  bonusText.x = WIDTH / 2;
  bonusText.y = panelY + 140;
  bonusText.zIndex = 2;
  modal.addChild(bonusText);

  // ── Instruction ────────────────────────────────────────────────────
  const instruction = new Text({
    text: 'Click a character to equip',
    style: { fill: 0xfbbf24, fontSize: 18, fontFamily: 'monospace' },
  });
  instruction.anchor.set(0.5, 0);
  instruction.x = WIDTH / 2;
  instruction.y = panelY + panelH + 20;
  instruction.zIndex = 2;
  modal.addChild(instruction);

  // ── Character portrait buttons ─────────────────────────────────────
  const livingAllies = gameState.characters.filter(c => c.isPlayer && c.hp > 0);
  const btnW = 180;
  const btnH = 90;
  const gap = 20;
  const totalW = livingAllies.length * btnW + (livingAllies.length - 1) * gap;
  const startX = (WIDTH - totalW) / 2;
  const btnY = panelY + panelH + 60;

  livingAllies.forEach((char, i) => {
    const bx = startX + i * (btnW + gap);

    const btn = new Graphics();
    btn.roundRect(bx, btnY, btnW, btnH, 8);
    btn.fill({ color: 0x334155, alpha: 0.95 });
    btn.stroke({ width: 2, color: 0x64748b });
    btn.zIndex = 2;
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.hitArea = new (await_rect())(bx, btnY, btnW, btnH);

    // Hover effect
    btn.on('pointerover', () => {
      btn.tint = 0xbbddff;
    });
    btn.on('pointerout', () => {
      btn.tint = 0xffffff;
    });

    // Click handler — equip the gear
    btn.on('pointertap', () => {
      equipGear(char, reward, gameState);
    });

    modal.addChild(btn);

    // Character name
    const nameText = new Text({
      text: char.name,
      style: { fill: 0xffffff, fontSize: 16, fontWeight: 'bold', fontFamily: 'monospace' },
    });
    nameText.anchor.set(0.5, 0);
    nameText.x = bx + btnW / 2;
    nameText.y = btnY + 10;
    nameText.zIndex = 3;
    nameText.eventMode = 'none';
    modal.addChild(nameText);

    // Current gear in this slot
    const currentGear = char.gear[reward.slot];
    const currentLabel = currentGear ? `[${SLOT_LABELS[reward.slot]}: ${currentGear.name}]` : `[${SLOT_LABELS[reward.slot]}: empty]`;
    const currentText = new Text({
      text: currentLabel,
      style: {
        fill: currentGear ? 0xfbbf24 : 0x64748b,
        fontSize: 12,
        fontFamily: 'monospace',
      },
    });
    currentText.anchor.set(0.5, 0);
    currentText.x = bx + btnW / 2;
    currentText.y = btnY + 34;
    currentText.zIndex = 3;
    currentText.eventMode = 'none';
    modal.addChild(currentText);

    // HP indicator
    const hpText = new Text({
      text: `HP ${char.hp}/${char.maxHp}`,
      style: { fill: 0x4ade80, fontSize: 12, fontFamily: 'monospace' },
    });
    hpText.anchor.set(0.5, 0);
    hpText.x = bx + btnW / 2;
    hpText.y = btnY + 56;
    hpText.zIndex = 3;
    hpText.eventMode = 'none';
    modal.addChild(hpText);
  });

  app.stage.addChild(modal);
}

// ── Hit-area helper (avoids top-level await for Rectangle import) ───
function await_rect() {
  // Rectangle is already imported from pixi.js at the module scope if needed.
  // Since we import Graphics/Text etc., Rectangle is available from pixi.js.
  // But pixi v8 doesn't always export Rectangle from main barrel, so we
  // use a simple object that satisfies PIXI's hitArea interface.
  return class SimpleRect {
    x: number; y: number; width: number; height: number;
    constructor(x: number, y: number, w: number, h: number) {
      this.x = x; this.y = y; this.width = w; this.height = h;
    }
    contains(px: number, py: number): boolean {
      return px >= this.x && px <= this.x + this.width
        && py >= this.y && py <= this.y + this.height;
    }
  };
}

// ── Equip logic ─────────────────────────────────────────────────────

function equipGear(character: Character, gear: GearDefinition, gameState: GameState): void {
  const registry = getModifierRegistry();
  const slot = gear.slot;

  // Remove old gear modifiers if replacing
  const oldGear = character.gear[slot];
  if (oldGear) {
    registry.clearSource(`gear:${oldGear.id}:${character.id}`);
    addToCombatLog(`${character.name} unequips ${oldGear.name}`);

    // Revert direct stat changes from old gear
    for (const mod of oldGear.modifiers) {
      if (mod.op === 'add') {
        if (mod.target === 'maxHp') {
          character.maxHp -= mod.value;
          character.hp = Math.min(character.hp, character.maxHp);
        } else if (mod.target === 'maxEnergy') {
          character.maxEnergy -= mod.value;
          character.energy = Math.min(character.energy, character.maxEnergy);
        } else if (mod.target === 'speed') {
          character.speed -= mod.value;
        }
      }
    }
  }

  // Equip new gear
  character.gear[slot] = gear;
  addToCombatLog(`${character.name} equips ${gear.name}`);

  // Register new gear modifiers
  for (const mod of gear.modifiers) {
    const modId = `gear:${gear.id}:${character.id}:${mod.target}:${mod.op}`;
    registry.add({
      id: modId,
      target: mod.target,
      op: mod.op,
      value: mod.value,
      source: `gear:${gear.id}:${character.id}`,
      scope: { kind: 'character', characterId: character.id },
    });

    // Apply direct stat changes for add modifiers on base stats
    if (mod.op === 'add') {
      if (mod.target === 'maxHp') {
        character.maxHp += mod.value;
        character.hp += mod.value; // Also increase current HP
      } else if (mod.target === 'maxEnergy') {
        character.maxEnergy += mod.value;
        character.energy += mod.value; // Also increase current energy
      } else if (mod.target === 'speed') {
        character.speed += mod.value;
      }
    }
  }

  // Dismiss modal
  gameState.pendingReward = null;
  // Keep combatResult as 'victory' (modal dismissed)

  render();
}
