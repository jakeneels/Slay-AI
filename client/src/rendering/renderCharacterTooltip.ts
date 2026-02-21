import type { Application } from 'pixi.js';
import { Graphics, Text } from 'pixi.js';
import { getHoveredCharacter } from './tooltipState.js';
import { getGameState, getSelectedCardId } from '../core/gameState.js';
import { getBlockDecaySchedule, getTotalBlock } from '../core/block.js';
import { getStatusDisplay } from './statusConfig.js';
import { WIDTH, HEIGHT } from '../core/constants.js';
import type { GearSlot } from '../core/types.js';

const SLOT_LABELS: Record<GearSlot, string> = {
  weapon: 'Weapon',
  armor: 'Armor',
  accessory: 'Accessory',
};

const TOOLTIP_W = 240;
const PAD = 10;
const Z_BASE = 5900;
const BG_COLOR = 0x111827;
const BG_ALPHA = 0.96;

function addLine(app: Application, text: string, x: number, y: number, color = 0xd1d5db, size = 11, bold = false): number {
  const line = new Text({
    text,
    style: {
      fill: color,
      fontSize: size,
      fontWeight: bold ? 'bold' : 'normal',
      wordWrap: true,
      wordWrapWidth: TOOLTIP_W - PAD * 2,
    },
  });
  line.x = x;
  line.y = y;
  line.eventMode = 'none';
  line.zIndex = Z_BASE + 1;
  app.stage.addChild(line);
  return y + line.height + 3;
}

export function renderCharacterTooltip(app: Application): void {
  // Disable character hover cards while a target is being selected.
  const selectedCardId = getSelectedCardId();
  const { characterId, x: anchorX, y: anchorY } = getHoveredCharacter();
  if (selectedCardId) return;
  if (!characterId) return;
  const gameState = getGameState();
  const character = gameState.characters.find((c) => c.id === characterId);
  if (!character || character.hp <= 0) return;

  const statusItems = (character.statuses ?? []).map((s) => {
    const cfg = getStatusDisplay(s.id);
    const label = cfg?.label ?? s.id.replaceAll('_', ' ');
    const value = s.stacks > 1 ? ` x${s.stacks}` : '';
    return `- ${label}${value}`;
  });

  const block = getTotalBlock(character);
  const blockDecaySchedule = getBlockDecaySchedule(character, gameState)
    .sort((a, b) => {
      const aTurns = a.turnsUntilDecay ?? Number.POSITIVE_INFINITY;
      const bTurns = b.turnsUntilDecay ?? Number.POSITIVE_INFINITY;
      return aTurns - bTurns;
    });

  const gearItems = (['weapon', 'armor', 'accessory'] as GearSlot[])
    .filter((slot) => character.gear[slot])
    .map((slot) => `${SLOT_LABELS[slot]}: ${character.gear[slot]!.name}`);

  const fortifyStacks = (character.statuses ?? []).find(s => s.id === 'fortify')?.stacks ?? 0;
  const fortifyReduction = fortifyStacks * 10;
  const blockDecayItems: string[] = [];
  for (const entry of blockDecaySchedule) {
    const ownerText = entry.ownerId === character.id
      ? 'owner turn'
      : `next: ${entry.ownerName}`;
    const effectiveDecayPercent = Math.max(10, entry.decayPercent - fortifyReduction);
    const decayAmountPerOwnerTurn = Math.max(1, Math.ceil(entry.baseAmount * (effectiveDecayPercent / 100)));
    const turnsUntilLayerExpires =
      entry.ownerTurnsUntilDecay
      + Math.max(0, Math.ceil(entry.amount / decayAmountPerOwnerTurn) - 1);
    blockDecayItems.push(`In ${turnsUntilLayerExpires} owner turn${turnsUntilLayerExpires === 1 ? '' : 's'}`);
    blockDecayItems.push(`  - ${entry.sourceLabel}: ${entry.amount} block (${ownerText})`);
  }

  let estimatedH = PAD + 20 + 4 * 16 + PAD;
  if (gearItems.length > 0) {
    estimatedH += 16 + gearItems.length * 14;
  }
  if (statusItems.length > 0) {
    estimatedH += 16 + statusItems.length * 14;
  }
  if (blockDecayItems.length > 0) {
    estimatedH += 16 + blockDecayItems.length * 14;
  }

  let tx = anchorX - TOOLTIP_W / 2;
  let ty = anchorY - estimatedH - 10;
  if (tx < 8) tx = 8;
  if (tx + TOOLTIP_W > WIDTH - 8) tx = WIDTH - 8 - TOOLTIP_W;
  if (ty < 8) ty = anchorY + 18;
  if (ty + estimatedH > HEIGHT - 8) ty = HEIGHT - 8 - estimatedH;

  const shadow = new Graphics();
  shadow.roundRect(2, 2, TOOLTIP_W, estimatedH, 8).fill({ color: 0x000000, alpha: 0.3 });
  shadow.x = tx;
  shadow.y = ty;
  shadow.zIndex = Z_BASE - 1;
  shadow.eventMode = 'none';
  app.stage.addChild(shadow);

  const borderColor = character.isPlayer ? 0x22c55e : 0xef4444;
  const bg = new Graphics();
  bg.roundRect(0, 0, TOOLTIP_W, estimatedH, 8)
    .fill({ color: BG_COLOR, alpha: BG_ALPHA })
    .stroke({ width: 1.5, color: borderColor, alpha: 0.9 });
  bg.x = tx;
  bg.y = ty;
  bg.zIndex = Z_BASE;
  bg.eventMode = 'none';
  app.stage.addChild(bg);

  let cy = ty + PAD;
  cy = addLine(app, character.name, tx + PAD, cy, 0xffffff, 13, true);
  cy = addLine(app, `HP ${character.hp}/${character.maxHp}`, tx + PAD, cy);
  cy = addLine(app, `Energy ${character.energy}/${character.maxEnergy}`, tx + PAD, cy);
  cy = addLine(app, `Block ${block}   Speed ${character.speed}`, tx + PAD, cy, 0x9ca3af);

  if (gearItems.length > 0) {
    cy = addLine(app, 'Equipped Gear', tx + PAD, cy + 2, 0x9ca3af, 10, true);
    for (const item of gearItems) {
      cy = addLine(app, `- ${item}`, tx + PAD, cy, 0xd1d5db, 10);
    }
  }

  if (blockDecayItems.length > 0) {
    cy = addLine(app, 'Block Decay Schedule', tx + PAD, cy + 2, 0x9ca3af, 10, true);
    for (const item of blockDecayItems) {
      cy = addLine(app, item, tx + PAD, cy, 0xd1d5db, 10);
    }
  }

  if (statusItems.length > 0) {
    cy = addLine(app, 'Statuses', tx + PAD, cy + 2, 0x9ca3af, 10, true);
    for (const item of statusItems) {
      cy = addLine(app, item, tx + PAD, cy, 0xd1d5db, 10);
    }
  }
}

