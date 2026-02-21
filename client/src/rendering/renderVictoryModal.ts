// Victory modal – two-phase overlay after all enemies are defeated.
//
// Phase 1 (pendingRewardChoices set): pick one reward and equip it.
// Phase 2 (pendingRewardChoices empty): Show wave summary + "Next Wave" button.

import type { Application } from 'pixi.js';
import { Container, Graphics, Text } from 'pixi.js';
import type { GameState, Character, GearDefinition, GearSlot } from '../core/types.js';
import { WIDTH, HEIGHT } from '../core/constants.js';
import { getModifierRegistry } from '../core/modifiers.js';
import { addToCombatLog } from '../core/gameState.js';
import { render } from './renderer.js';
import { startNextWave, WAVE_HEAL_FRACTION } from '../core/waveTransition.js';

// ── Rarity colours ──────────────────────────────────────────────────
const RARITY_COLORS: Record<string, number> = {
  common: 0x9ca3af,    // grey
  rare: 0xeab308,      // gold
  epic: 0xa855f7,      // purple
  legendary: 0xf97316, // orange
  mythic: 0xec4899,    // pink
};

const SLOT_LABELS: Record<GearSlot, string> = {
  weapon: 'Weapon',
  armor: 'Armor',
  accessory: 'Accessory',
};

/**
 * Render the victory modal overlay on top of the game scene.
 * Dispatches to phase 1 or phase 2 based on pendingReward state.
 */
export function renderVictoryModal(app: Application, gameState: GameState): void {
  const rewardChoices = gameState.pendingRewardChoices ?? [];
  const selectedReward = gameState.pendingReward ?? rewardChoices[0] ?? null;
  if (rewardChoices.length > 0 && selectedReward) {
    if (!gameState.pendingReward) {
      gameState.pendingReward = selectedReward;
    }
    renderGearRewardPhase(app, gameState, selectedReward, rewardChoices);
  } else {
    renderWaveCompletePhase(app, gameState);
  }
}

// ── Phase 1: Gear Reward ─────────────────────────────────────────────

function renderGearRewardPhase(
  app: Application,
  gameState: GameState,
  reward: GearDefinition,
  rewardChoices: GearDefinition[],
): void {
  const modal = createModalContainer();

  // ── Title ──────────────────────────────────────────────────────────
  const title = new Text({
    text: 'FIGHT WON!',
    style: {
      fill: 0xfbbf24,
      fontSize: 48,
      fontWeight: 'bold',
      fontFamily: 'monospace',
      dropShadow: { color: 0x000000, blur: 6, distance: 2 },
    },
  });
  title.anchor.set(0.5);
  title.x = WIDTH / 2;
  title.y = 100;
  title.zIndex = 1;
  modal.addChild(title);

  // ── Reward choice row ──────────────────────────────────────────────
  const choiceW = 230;
  const choiceH = 48;
  const choiceGap = 14;
  const choices = rewardChoices.slice(0, 3);
  const totalChoiceW = choices.length * choiceW + (choices.length - 1) * choiceGap;
  const choiceStartX = (WIDTH - totalChoiceW) / 2;
  const choiceY = 152;

  choices.forEach((choice, index) => {
    const x = choiceStartX + index * (choiceW + choiceGap);
    const isSelected = choice.id === reward.id;
    const choiceRarityColor = RARITY_COLORS[choice.rarity] ?? 0xffffff;

    const btn = new Graphics();
    btn.roundRect(x, choiceY, choiceW, choiceH, 8);
    btn.fill({ color: isSelected ? 0x1f2937 : 0x111827, alpha: 0.96 });
    btn.stroke({ width: isSelected ? 3 : 2, color: isSelected ? choiceRarityColor : 0x374151 });
    btn.zIndex = 2;
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.hitArea = new (makeHitRect())(x, choiceY, choiceW, choiceH);
    btn.on('pointerover', () => { btn.tint = 0xbbddff; });
    btn.on('pointerout', () => { btn.tint = 0xffffff; });
    btn.on('pointertap', () => {
      gameState.pendingReward = choice;
      render();
    });
    modal.addChild(btn);

    const label = new Text({
      text: `${choice.name} (${choice.rarity})`,
      style: { fill: isSelected ? choiceRarityColor : 0xe5e7eb, fontSize: 12, fontFamily: 'monospace' },
    });
    label.anchor.set(0.5, 0.5);
    label.x = x + choiceW / 2;
    label.y = choiceY + choiceH / 2;
    label.zIndex = 3;
    label.eventMode = 'none';
    modal.addChild(label);
  });

  // ── Gear card panel ────────────────────────────────────────────────
  const panelW = 360;
  const panelH = 240;
  const panelX = (WIDTH - panelW) / 2;
  const panelY = 220;

  const rarityCol = RARITY_COLORS[reward.rarity] ?? 0xffffff;

  const panel = new Graphics();
  panel.roundRect(panelX - 2, panelY - 2, panelW + 4, panelH + 4, 12);
  panel.fill({ color: rarityCol, alpha: 0.9 });
  panel.roundRect(panelX, panelY, panelW, panelH, 10);
  panel.fill({ color: 0x1e293b, alpha: 0.95 });
  panel.zIndex = 1;
  modal.addChild(panel);

  const gearName = new Text({
    text: reward.name,
    style: { fill: rarityCol, fontSize: 24, fontWeight: 'bold', fontFamily: 'monospace' },
  });
  gearName.anchor.set(0.5, 0);
  gearName.x = WIDTH / 2;
  gearName.y = panelY + 16;
  gearName.zIndex = 2;
  modal.addChild(gearName);

  const slotLine = new Text({
    text: `${SLOT_LABELS[reward.slot]} · ${reward.rarity.charAt(0).toUpperCase() + reward.rarity.slice(1)}`,
    style: { fill: 0x94a3b8, fontSize: 14, fontFamily: 'monospace' },
  });
  slotLine.anchor.set(0.5, 0);
  slotLine.x = WIDTH / 2;
  slotLine.y = panelY + 48;
  slotLine.zIndex = 2;
  modal.addChild(slotLine);

  const desc = new Text({
    text: reward.description,
    style: { fill: 0xe2e8f0, fontSize: 15, fontFamily: 'monospace', wordWrap: true, wordWrapWidth: panelW - 32 },
  });
  desc.anchor.set(0.5, 0);
  desc.x = WIDTH / 2;
  desc.y = panelY + 74;
  desc.zIndex = 2;
  modal.addChild(desc);

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
    text: 'Pick a reward, then click a character to equip',
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
    btn.hitArea = new (makeHitRect())(bx, btnY, btnW, btnH);

    btn.on('pointerover', () => { btn.tint = 0xbbddff; });
    btn.on('pointerout', () => { btn.tint = 0xffffff; });
    btn.on('pointertap', () => { equipGear(char, reward, gameState); });

    modal.addChild(btn);

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

    const currentGear = char.gear[reward.slot];
    const currentLabel = currentGear
      ? `[${SLOT_LABELS[reward.slot]}: ${currentGear.name}]`
      : `[${SLOT_LABELS[reward.slot]}: empty]`;
    const currentText = new Text({
      text: currentLabel,
      style: { fill: currentGear ? 0xfbbf24 : 0x64748b, fontSize: 12, fontFamily: 'monospace' },
    });
    currentText.anchor.set(0.5, 0);
    currentText.x = bx + btnW / 2;
    currentText.y = btnY + 34;
    currentText.zIndex = 3;
    currentText.eventMode = 'none';
    modal.addChild(currentText);

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

// ── Phase 2: Wave Complete + Next Wave ───────────────────────────────

function renderWaveCompletePhase(app: Application, gameState: GameState): void {
  const modal = createModalContainer();

  // ── Title ──────────────────────────────────────────────────────────
  const title = new Text({
    text: `WAVE ${gameState.waveNumber} COMPLETE!`,
    style: {
      fill: 0xfbbf24,
      fontSize: 44,
      fontWeight: 'bold',
      fontFamily: 'monospace',
      dropShadow: { color: 0x000000, blur: 6, distance: 2 },
    },
  });
  title.anchor.set(0.5);
  title.x = WIDTH / 2;
  title.y = 120;
  title.zIndex = 1;
  modal.addChild(title);

  // ── Summary panel ──────────────────────────────────────────────────
  const livingAllies = gameState.characters.filter(c => c.isPlayer && c.hp > 0);
  const totalHp = livingAllies.reduce((s, c) => s + c.hp, 0);
  const totalMaxHp = livingAllies.reduce((s, c) => s + c.maxHp, 0);
  const dmgDealt = gameState.stats.cumulativeDamage;

  const summaryLines = [
    `Allies alive: ${livingAllies.length}`,
    `Team HP: ${totalHp} / ${totalMaxHp}`,
    `Total damage dealt: ${dmgDealt}`,
  ];

  const panelW = 400;
  const panelH = 180;
  const panelX = (WIDTH - panelW) / 2;
  const panelY = 180;

  const panel = new Graphics();
  panel.roundRect(panelX, panelY, panelW, panelH, 10);
  panel.fill({ color: 0x1e293b, alpha: 0.95 });
  panel.stroke({ width: 2, color: 0x475569 });
  panel.zIndex = 1;
  modal.addChild(panel);

  summaryLines.forEach((line, i) => {
    const lineText = new Text({
      text: line,
      style: { fill: 0xe2e8f0, fontSize: 18, fontFamily: 'monospace' },
    });
    lineText.anchor.set(0.5, 0);
    lineText.x = WIDTH / 2;
    lineText.y = panelY + 24 + i * 34;
    lineText.zIndex = 2;
    lineText.eventMode = 'none';
    modal.addChild(lineText);
  });

  // Heal preview line
  const healPreview = new Text({
    text: `Allies will recover ${Math.round(getModifierRegistry().resolve('wave_heal_fraction', WAVE_HEAL_FRACTION) * 100)}% of missing HP`,
    style: { fill: 0x4ade80, fontSize: 14, fontFamily: 'monospace', fontStyle: 'italic' },
  });
  healPreview.anchor.set(0.5, 0);
  healPreview.x = WIDTH / 2;
  healPreview.y = panelY + panelH - 32;
  healPreview.zIndex = 2;
  healPreview.eventMode = 'none';
  modal.addChild(healPreview);

  // ── Next Wave button ───────────────────────────────────────────────
  const btnW = 260;
  const btnH = 60;
  const btnX = (WIDTH - btnW) / 2;
  const btnY = panelY + panelH + 40;

  const btn = new Graphics();
  btn.roundRect(btnX, btnY, btnW, btnH, 10);
  btn.fill({ color: 0x16a34a, alpha: 0.95 });
  btn.stroke({ width: 2, color: 0x22c55e });
  btn.zIndex = 2;
  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.hitArea = new (makeHitRect())(btnX, btnY, btnW, btnH);

  btn.on('pointerover', () => { btn.tint = 0xccffcc; });
  btn.on('pointerout', () => { btn.tint = 0xffffff; });
  btn.on('pointertap', () => { startNextWave(); });

  modal.addChild(btn);

  const btnLabel = new Text({
    text: `NEXT WAVE  >>`,
    style: { fill: 0xffffff, fontSize: 24, fontWeight: 'bold', fontFamily: 'monospace' },
  });
  btnLabel.anchor.set(0.5);
  btnLabel.x = btnX + btnW / 2;
  btnLabel.y = btnY + btnH / 2;
  btnLabel.zIndex = 3;
  btnLabel.eventMode = 'none';
  modal.addChild(btnLabel);

  app.stage.addChild(modal);
}

// ── Shared helpers ───────────────────────────────────────────────────

function createModalContainer(): Container {
  const modal = new Container();
  modal.zIndex = 8000;
  modal.sortableChildren = true;

  const overlay = new Graphics();
  overlay.rect(0, 0, WIDTH, HEIGHT);
  overlay.fill({ color: 0x000000, alpha: 0.75 });
  overlay.eventMode = 'static';
  overlay.zIndex = 0;
  modal.addChild(overlay);

  return modal;
}

function makeHitRect() {
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

function applyDirectAddModifier(character: Character, target: string, delta: number): void {
  if (target === 'maxHp') {
    character.maxHp += delta;
    if (delta > 0) {
      character.hp += delta; // Preserve current behavior: bonus max HP grants immediate HP.
    }
    character.hp = Math.min(character.hp, character.maxHp);
    return;
  }

  if (target === 'maxEnergy') {
    character.maxEnergy += delta;
    if (delta > 0) {
      character.energy += delta; // Preserve current behavior: bonus max energy grants immediate energy.
    }
    character.energy = Math.min(character.energy, character.maxEnergy);
    return;
  }

  const statBag = character as unknown as Record<string, unknown>;
  const currentValue = statBag[target];
  if (typeof currentValue !== 'number') return;
  (statBag as Record<string, number>)[target] = currentValue + delta;
}

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
        applyDirectAddModifier(character, mod.target, -mod.value);
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
      applyDirectAddModifier(character, mod.target, mod.value);
    }
  }

  // Dismiss modal
  gameState.pendingReward = null;
  gameState.pendingRewardChoices = [];
  // Keep combatResult as 'victory' (modal dismissed)

  render();
}
