import type { Application } from 'pixi.js';
import { Container, Graphics, Text } from 'pixi.js';
import type { Character, GameState } from '../core/types.js';
import { HEIGHT, WIDTH } from '../core/constants.js';
import {
  canAdvanceToCardSelection,
  canStartPreFight,
  assignPreFightCardToActiveSlot,
  confirmPreFightLineup,
  getPreFightCardPoolSortedByRarity,
  getPreFightCurrentThreat,
  movePreFightAlly,
  setPreFightCardCatalogScroll,
  setPreFightPage,
  setPreFightActiveCardEditor,
  setPreFightActiveCardSlot,
  setPreFightUseDefaultCards,
  togglePreFightAllySelection,
} from '../core/preFight.js';
import { render } from './renderer.js';
import { createEnergyIcon } from './icons/energyIcon.js';
import { createRarityIcon } from './icons/rarityIcon.js';
import { createDamageIcon } from './icons/damageIcon.js';
import { createSpeedIcon } from './icons/speedIcon.js';
import { createHealIcon } from './icons/healIcon.js';
import { createShieldIcon } from './icons/shieldIcon.js';
import { createKnockbackIcon } from './icons/knockbackIcon.js';
import { createRangeIcon } from './icons/rangeIcon.js';
import { createExhaustIcon } from './icons/exhaustIcon.js';

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

function getCandidateAllies(gameState: GameState): Character[] {
  const allyById = new Map(
    gameState.characters
      .filter(c => c.isPlayer && c.hp > 0)
      .map(c => [c.id, c] as const),
  );
  return gameState.preFight.candidateAllyIds
    .map(id => allyById.get(id))
    .filter((c): c is Character => !!c);
}

function summarizeCardEffects(card: NonNullable<GameState['cardLibrary'][string]>): string {
  const parts: string[] = [];
  for (const effect of card.effects.slice(0, 2)) {
    if (effect.kind === 'modifier' || effect.kind === 'deck_inject') continue;
    const amount = 'amount' in effect ? `${effect.amount}` : '';
    parts.push(`${effect.kind}${amount ? ` ${amount}` : ''}`);
  }
  if (parts.length === 0) return 'No direct effect';
  return parts.join(' | ');
}

function createEffectIcon(kind: string, size: number): Graphics | null {
  switch (kind) {
    case 'damage':
    case 'aoe_damage':
      return createDamageIcon(size);
    case 'heal':
      return createHealIcon(size);
    case 'speed':
      return createSpeedIcon(size);
    case 'grant_block_layer':
      return createShieldIcon(size);
    case 'knockback':
      return createKnockbackIcon(size);
    default:
      return null;
  }
}

export function renderPreFightModal(app: Application, gameState: GameState): void {
  if (!gameState.preFight.active) return;

  const modal = createModalContainer();
  const selectedIds = gameState.preFight.selectedAllyIds;
  const requiredSize = gameState.preFight.requiredLineupSize;
  const isCardsPage = gameState.preFight.page === 'cards';
  const useDefaultCards = gameState.preFight.useDefaultCards;
  const canStart = canStartPreFight();
  const canAdvanceToCards = canAdvanceToCardSelection();
  const candidates = getCandidateAllies(gameState);
  const currentThreat = getPreFightCurrentThreat();
  const threatBudget = gameState.preFight.threatBudget;
  const threatWithinBudget = currentThreat <= threatBudget;
  const cardPoolOrdered = getPreFightCardPoolSortedByRarity();

  const title = new Text({
    text: 'PRE-FIGHT SETUP',
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
  title.y = 84;
  title.zIndex = 1;
  modal.addChild(title);

  const subtitle = new Text({
    text: isCardsPage
      ? 'Card Selection'
      : `Select ${requiredSize} operatives and arrange their order`,
    style: { fill: 0xe2e8f0, fontSize: 18, fontFamily: 'monospace' },
  });
  subtitle.anchor.set(0.5, 0);
  subtitle.x = WIDTH / 2;
  subtitle.y = 128;
  subtitle.zIndex = 1;
  modal.addChild(subtitle);

  const selectedCounter = new Text({
    text: `Selected: ${selectedIds.length}/${requiredSize}`,
    style: {
      fill: selectedIds.length === requiredSize ? 0x4ade80 : 0xf87171,
      fontSize: 16,
      fontWeight: 'bold',
      fontFamily: 'monospace',
    },
  });
  selectedCounter.anchor.set(0.5, 0);
  selectedCounter.x = WIDTH / 2;
  selectedCounter.y = 156;
  selectedCounter.zIndex = 1;
  modal.addChild(selectedCounter);

  const threatCounter = new Text({
    text: `Lineup Threat: ${currentThreat.toFixed(1)} / ${threatBudget.toFixed(1)}`,
    style: {
      fill: threatWithinBudget ? 0x4ade80 : 0xf87171,
      fontSize: 16,
      fontWeight: 'bold',
      fontFamily: 'monospace',
    },
  });
  threatCounter.anchor.set(0.5, 0);
  threatCounter.x = WIDTH / 2;
  threatCounter.y = 178;
  threatCounter.zIndex = 1;
  modal.addChild(threatCounter);

  if (!isCardsPage) {
    const rosterPanel = new Graphics();
    const panelW = 1080;
    const panelH = 210;
    const panelX = (WIDTH - panelW) / 2;
    const panelY = 200;
    rosterPanel.roundRect(panelX, panelY, panelW, panelH, 10);
    rosterPanel.fill({ color: 0x1e293b, alpha: 0.95 });
    rosterPanel.stroke({ width: 2, color: 0x475569 });
    rosterPanel.zIndex = 1;
    modal.addChild(rosterPanel);

    const cardW = 240;
    const cardH = 148;
    const gap = 16;
    const totalW = candidates.length * cardW + Math.max(0, candidates.length - 1) * gap;
    const startX = (WIDTH - totalW) / 2;
    const startY = panelY + 32;

    candidates.forEach((ally, i) => {
      const x = startX + i * (cardW + gap);
      const isSelected = selectedIds.includes(ally.id);
      const selectedOrder = isSelected ? selectedIds.indexOf(ally.id) + 1 : null;

      const card = new Graphics();
      card.roundRect(x, startY, cardW, cardH, 8);
      card.fill({ color: isSelected ? 0x0f766e : 0x334155, alpha: 0.98 });
      card.stroke({ width: 2, color: isSelected ? 0x2dd4bf : 0x64748b });
      card.zIndex = 2;
      card.eventMode = 'static';
      card.cursor = 'pointer';
      card.hitArea = new (makeHitRect())(x, startY, cardW, cardH);
      card.on('pointertap', () => {
        togglePreFightAllySelection(ally.id);
        render();
      });
      modal.addChild(card);

      const name = new Text({
        text: ally.name,
        style: { fill: 0xffffff, fontSize: 18, fontWeight: 'bold', fontFamily: 'monospace' },
      });
      name.anchor.set(0.5, 0);
      name.x = x + cardW / 2;
      name.y = startY + 12;
      name.zIndex = 3;
      name.eventMode = 'none';
      modal.addChild(name);

      const hp = new Text({
        text: `HP ${ally.hp}/${ally.maxHp}`,
        style: { fill: 0x4ade80, fontSize: 14, fontFamily: 'monospace' },
      });
      hp.anchor.set(0.5, 0);
      hp.x = x + cardW / 2;
      hp.y = startY + 46;
      hp.zIndex = 3;
      hp.eventMode = 'none';
      modal.addChild(hp);

      const speed = new Text({
        text: `Speed ${ally.speed}`,
        style: { fill: 0x93c5fd, fontSize: 14, fontFamily: 'monospace' },
      });
      speed.anchor.set(0.5, 0);
      speed.x = x + cardW / 2;
      speed.y = startY + 68;
      speed.zIndex = 3;
      speed.eventMode = 'none';
      modal.addChild(speed);

      const slotSize = new Text({
        text: `Size ${Math.max(1, Math.floor(ally.slotSize ?? 1))}`,
        style: { fill: 0xcbd5e1, fontSize: 13, fontFamily: 'monospace' },
      });
      slotSize.anchor.set(0.5, 0);
      slotSize.x = x + cardW / 2;
      slotSize.y = startY + 90;
      slotSize.zIndex = 3;
      slotSize.eventMode = 'none';
      modal.addChild(slotSize);

      const status = new Text({
        text: isSelected ? `SELECTED #${selectedOrder}` : 'NOT SELECTED',
        style: {
          fill: isSelected ? 0x2dd4bf : 0x94a3b8,
          fontSize: 13,
          fontWeight: 'bold',
          fontFamily: 'monospace',
        },
      });
      status.anchor.set(0.5, 0);
      status.x = x + cardW / 2;
      status.y = startY + 116;
      status.zIndex = 3;
      status.eventMode = 'none';
      modal.addChild(status);
    });
  }

  const lineupPanel = new Graphics();
  const lineupW = 980;
  const lineupH = isCardsPage ? 112 : 170;
  const lineupX = (WIDTH - lineupW) / 2;
  const lineupY = isCardsPage ? 196 : 430;
  lineupPanel.roundRect(lineupX, lineupY, lineupW, lineupH, 10);
  lineupPanel.fill({ color: 0x111827, alpha: 0.95 });
  lineupPanel.stroke({ width: 2, color: 0x374151 });
  lineupPanel.zIndex = 1;
  modal.addChild(lineupPanel);

  const lineupTitle = new Text({
    text: 'Lineup Order (left to right in ally slots)',
    style: { fill: 0xf8fafc, fontSize: 16, fontWeight: 'bold', fontFamily: 'monospace' },
  });
  lineupTitle.anchor.set(0.5, 0);
  lineupTitle.x = WIDTH / 2;
  lineupTitle.y = lineupY + 12;
  lineupTitle.zIndex = 2;
  modal.addChild(lineupTitle);

  const selectedAllies = selectedIds
    .map(id => candidates.find(c => c.id === id))
    .filter((c): c is Character => !!c);
  const chipW = isCardsPage ? 214 : 220;
  const chipH = isCardsPage ? 56 : 84;
  const chipGap = 16;
  const chipsTotalW = selectedAllies.length * chipW + Math.max(0, selectedAllies.length - 1) * chipGap;
  const chipsStartX = (WIDTH - chipsTotalW) / 2;
  const chipsY = lineupY + (isCardsPage ? 40 : 48);

  selectedAllies.forEach((ally, i) => {
    const x = chipsStartX + i * (chipW + chipGap);

    const chip = new Graphics();
    chip.roundRect(x, chipsY, chipW, chipH, 8);
    const isActiveEditor = gameState.preFight.activeCardEditorAllyId === ally.id;
    chip.fill({ color: isActiveEditor ? 0x0f766e : 0x065f46, alpha: 0.98 });
    chip.stroke({ width: 2, color: isActiveEditor ? 0x2dd4bf : 0x10b981 });
    chip.zIndex = 2;
    chip.eventMode = 'static';
    chip.cursor = 'pointer';
    chip.hitArea = new (makeHitRect())(x, chipsY, chipW, chipH);
    chip.on('pointertap', () => {
      setPreFightActiveCardEditor(ally.id);
      render();
    });
    modal.addChild(chip);

    const slotLabel = new Text({
      text: `Slot ${i + 1}`,
      style: { fill: 0x99f6e4, fontSize: 12, fontFamily: 'monospace' },
    });
    slotLabel.anchor.set(0.5, 0);
    slotLabel.x = x + chipW / 2;
    slotLabel.y = chipsY + (isCardsPage ? 4 : 6);
    slotLabel.zIndex = 3;
    slotLabel.eventMode = 'none';
    modal.addChild(slotLabel);

    const name = new Text({
      text: ally.name,
      style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold', fontFamily: 'monospace' },
    });
    name.anchor.set(0.5);
    name.x = x + chipW / 2;
    name.y = chipsY + (isCardsPage ? 30 : 42);
    name.zIndex = 3;
    name.eventMode = 'none';
    modal.addChild(name);

    const arrowW = 24;
    const arrowH = isCardsPage ? 18 : 24;
    const leftX = x + 10;
    const rightX = x + chipW - arrowW - 10;
    const arrowY = chipsY + chipH - arrowH - (isCardsPage ? 4 : 8);

    const left = new Graphics();
    left.roundRect(leftX, arrowY, arrowW, arrowH, 5);
    left.fill({ color: i > 0 ? 0x1d4ed8 : 0x334155, alpha: 0.95 });
    left.stroke({ width: 1, color: i > 0 ? 0x60a5fa : 0x475569 });
    left.zIndex = 3;
    if (i > 0) {
      left.eventMode = 'static';
      left.cursor = 'pointer';
      left.hitArea = new (makeHitRect())(leftX, arrowY, arrowW, arrowH);
      left.on('pointertap', () => {
        movePreFightAlly(ally.id, 'left');
        render();
      });
    }
    modal.addChild(left);

    const leftLabel = new Text({
      text: '<',
      style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold', fontFamily: 'monospace' },
    });
    leftLabel.anchor.set(0.5);
    leftLabel.x = leftX + arrowW / 2;
    leftLabel.y = arrowY + arrowH / 2;
    leftLabel.zIndex = 4;
    leftLabel.eventMode = 'none';
    modal.addChild(leftLabel);

    const right = new Graphics();
    right.roundRect(rightX, arrowY, arrowW, arrowH, 5);
    right.fill({ color: i < selectedAllies.length - 1 ? 0x1d4ed8 : 0x334155, alpha: 0.95 });
    right.stroke({ width: 1, color: i < selectedAllies.length - 1 ? 0x60a5fa : 0x475569 });
    right.zIndex = 3;
    if (i < selectedAllies.length - 1) {
      right.eventMode = 'static';
      right.cursor = 'pointer';
      right.hitArea = new (makeHitRect())(rightX, arrowY, arrowW, arrowH);
      right.on('pointertap', () => {
        movePreFightAlly(ally.id, 'right');
        render();
      });
    }
    modal.addChild(right);

    const rightLabel = new Text({
      text: '>',
      style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold', fontFamily: 'monospace' },
    });
    rightLabel.anchor.set(0.5);
    rightLabel.x = rightX + arrowW / 2;
    rightLabel.y = arrowY + arrowH / 2;
    rightLabel.zIndex = 4;
    rightLabel.eventMode = 'none';
    modal.addChild(rightLabel);
  });

  if (!isCardsPage) {
    const defaultCardsToggle = new Graphics();
    const toggleX = (WIDTH - 420) / 2;
    const toggleY = lineupY + lineupH + 14;
    defaultCardsToggle.roundRect(toggleX, toggleY, 420, 52, 8);
    defaultCardsToggle.fill({ color: 0x1f2937, alpha: 0.95 });
    defaultCardsToggle.stroke({ width: 2, color: 0x475569 });
    defaultCardsToggle.zIndex = 2;
    defaultCardsToggle.eventMode = 'static';
    defaultCardsToggle.cursor = 'pointer';
    defaultCardsToggle.hitArea = new (makeHitRect())(toggleX, toggleY, 420, 52);
    defaultCardsToggle.on('pointertap', () => {
      setPreFightUseDefaultCards(!useDefaultCards);
      render();
    });
    modal.addChild(defaultCardsToggle);

    const box = new Graphics();
    box.roundRect(toggleX + 12, toggleY + 12, 26, 26, 4);
    box.fill({ color: useDefaultCards ? 0x16a34a : 0x334155, alpha: 0.95 });
    box.stroke({ width: 1, color: useDefaultCards ? 0x22c55e : 0x64748b });
    box.zIndex = 3;
    modal.addChild(box);

    const toggleLabel = new Text({
      text: useDefaultCards ? 'Use default cards for all characters [ON]' : 'Use default cards for all characters [OFF]',
      style: { fill: 0xe2e8f0, fontSize: 15, fontWeight: 'bold', fontFamily: 'monospace' },
    });
    toggleLabel.anchor.set(0, 0.5);
    toggleLabel.x = toggleX + 50;
    toggleLabel.y = toggleY + 26;
    toggleLabel.zIndex = 3;
    toggleLabel.eventMode = 'none';
    modal.addChild(toggleLabel);
  }

  if (isCardsPage) {
    const editorPanel = new Graphics();
    const editorW = 1120;
    const editorH = 110;
    const editorX = (WIDTH - editorW) / 2;
    const editorY = lineupY + lineupH + 14;
    editorPanel.roundRect(editorX, editorY, editorW, editorH, 10);
    editorPanel.fill({ color: 0x0b1220, alpha: 0.95 });
    editorPanel.stroke({ width: 2, color: 0x334155 });
    editorPanel.zIndex = 1;
    modal.addChild(editorPanel);

    const activeAlly = selectedAllies.find(c => c.id === gameState.preFight.activeCardEditorAllyId) ?? selectedAllies[0];
    if (activeAlly) {
      const editorTitle = new Text({
        text: `Card Loadout: ${activeAlly.name} (click a slot, then pick a card below)`,
        style: { fill: 0xe2e8f0, fontSize: 15, fontWeight: 'bold', fontFamily: 'monospace' },
      });
      editorTitle.anchor.set(0.5, 0);
      editorTitle.x = WIDTH / 2;
      editorTitle.y = editorY + 10;
      editorTitle.zIndex = 2;
      modal.addChild(editorTitle);

    const selectedDeck = gameState.preFight.cardsByAlly[activeAlly.id] ?? [];
    const slotW = 128;
    const slotH = 62;
    const slotGap = 8;
    const maxVisibleSlots = Math.min(selectedDeck.length, 8);
    const totalSlotsW = maxVisibleSlots * slotW + Math.max(0, maxVisibleSlots - 1) * slotGap;
    const slotsStartX = (WIDTH - totalSlotsW) / 2;
    const slotsY = editorY + 38;

      for (let slotIndex = 0; slotIndex < maxVisibleSlots; slotIndex++) {
        const cardId = selectedDeck[slotIndex];
        const card = gameState.cardLibrary[cardId];
        const x = slotsStartX + slotIndex * (slotW + slotGap);
        const isActiveSlot = gameState.preFight.activeCardSlotIndex === slotIndex;

        const slotBg = new Graphics();
        slotBg.roundRect(x, slotsY, slotW, slotH, 8);
        slotBg.fill({ color: isActiveSlot ? 0x0f766e : 0x1e293b, alpha: 0.97 });
        slotBg.stroke({ width: 2, color: isActiveSlot ? 0x2dd4bf : 0x475569 });
        slotBg.zIndex = 2;
        slotBg.eventMode = 'static';
        slotBg.cursor = 'pointer';
        slotBg.hitArea = new (makeHitRect())(x, slotsY, slotW, slotH);
        slotBg.on('pointertap', () => {
          setPreFightActiveCardSlot(slotIndex);
          render();
        });
        modal.addChild(slotBg);

        const slotLabel = new Text({
          text: `#${slotIndex + 1}`,
          style: { fill: 0x93c5fd, fontSize: 11, fontFamily: 'monospace' },
        });
        slotLabel.anchor.set(0.5, 0);
        slotLabel.x = x + slotW / 2;
        slotLabel.y = slotsY + 6;
        slotLabel.zIndex = 3;
        slotLabel.eventMode = 'none';
        modal.addChild(slotLabel);

        const cardName = new Text({
          text: card?.name ?? cardId,
          style: { fill: 0xffffff, fontSize: 11, fontWeight: 'bold', fontFamily: 'monospace', align: 'center', wordWrap: true, wordWrapWidth: slotW - 12 },
        });
        cardName.anchor.set(0.5, 0);
        cardName.x = x + slotW / 2;
        cardName.y = slotsY + 20;
        cardName.zIndex = 3;
        cardName.eventMode = 'none';
        modal.addChild(cardName);

        const rarity = (card?.rarity ?? 'common').toUpperCase();
        const rarityLabel = new Text({
          text: rarity,
          style: { fill: 0xfbbf24, fontSize: 10, fontFamily: 'monospace' },
        });
        rarityLabel.anchor.set(0.5, 0);
        rarityLabel.x = x + slotW / 2;
        rarityLabel.y = slotsY + slotH - 20;
        rarityLabel.zIndex = 3;
        rarityLabel.eventMode = 'none';
        modal.addChild(rarityLabel);

        const chooseLabel = new Text({
          text: isActiveSlot ? 'SELECTING...' : 'CLICK TO SELECT',
          style: { fill: isActiveSlot ? 0x34d399 : 0x94a3b8, fontSize: 10, fontWeight: 'bold', fontFamily: 'monospace' },
        });
        chooseLabel.anchor.set(0.5);
        chooseLabel.x = x + slotW / 2;
        chooseLabel.y = slotsY + slotH - 8;
        chooseLabel.zIndex = 4;
        chooseLabel.eventMode = 'none';
        modal.addChild(chooseLabel);
      }

      const galleryPanel = new Graphics();
      const galleryX = 120;
      const galleryY = editorY + editorH + 10;
      const galleryW = WIDTH - 240;
      const galleryH = 262;
      galleryPanel.roundRect(galleryX, galleryY, galleryW, galleryH, 10);
      galleryPanel.fill({ color: 0x111827, alpha: 0.95 });
      galleryPanel.stroke({ width: 2, color: 0x374151 });
      galleryPanel.zIndex = 1;
      modal.addChild(galleryPanel);

      const galleryTitle = new Text({
        text: 'All Cards (ordered by rarity)',
        style: { fill: 0xe2e8f0, fontSize: 15, fontWeight: 'bold', fontFamily: 'monospace' },
      });
      galleryTitle.anchor.set(0.5, 0);
      galleryTitle.x = WIDTH / 2;
      galleryTitle.y = galleryY + 8;
      galleryTitle.zIndex = 2;
      modal.addChild(galleryTitle);

      const viewportX = galleryX + 10;
      const viewportY = galleryY + 30;
      const viewportW = galleryW - 44;
      const viewportH = galleryH - 52;
      const cardSizeW = 125;
      const cardSizeH = 155;
      const cardGapX = 8;
      const cardGapY = 8;
      const cols = 8;

      const totalRows = Math.max(1, Math.ceil(cardPoolOrdered.length / cols));
      const contentHeight = totalRows * cardSizeH + Math.max(0, totalRows - 1) * cardGapY;
      const maxScroll = Math.max(0, contentHeight - viewportH);
      const scroll = Math.max(0, Math.min(gameState.preFight.cardCatalogScroll, maxScroll));
      if (scroll !== gameState.preFight.cardCatalogScroll) {
        setPreFightCardCatalogScroll(scroll);
      }

      const galleryCards = new Container();
      galleryCards.zIndex = 2;
      modal.addChild(galleryCards);

      const galleryMask = new Graphics();
      galleryMask.rect(viewportX, viewportY, viewportW, viewportH);
      galleryMask.fill({ color: 0x000000, alpha: 1 });
      galleryMask.alpha = 0.001;
      galleryMask.zIndex = 2;
      modal.addChild(galleryMask);
      galleryCards.mask = galleryMask;

      galleryPanel.eventMode = 'static';
      galleryPanel.hitArea = new (makeHitRect())(viewportX, viewportY, viewportW, viewportH);
      galleryPanel.on('wheel', (event: any) => {
        const deltaY = Number(event?.deltaY ?? 0);
        setPreFightCardCatalogScroll(Math.max(0, Math.min(maxScroll, scroll + deltaY * 0.6)));
        render();
      });

      const rowStart = Math.max(0, Math.floor(scroll / (cardSizeH + cardGapY)));
      const rowEnd = Math.min(totalRows - 1, Math.ceil((scroll + viewportH) / (cardSizeH + cardGapY)));
      const firstIndex = rowStart * cols;
      const lastIndex = Math.min(cardPoolOrdered.length - 1, (rowEnd + 1) * cols - 1);

      for (let idx = firstIndex; idx <= lastIndex; idx++) {
        const cardId = cardPoolOrdered[idx];
        const card = gameState.cardLibrary[cardId];
        if (!card) continue;
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = viewportX + 4 + col * (cardSizeW + cardGapX);
        const y = viewportY + row * (cardSizeH + cardGapY) - scroll;
        const activeSlotIndex = gameState.preFight.activeCardSlotIndex;
        const activeDeck = gameState.preFight.cardsByAlly[activeAlly.id] ?? [];
        const isCurrent = activeSlotIndex !== null && activeDeck[activeSlotIndex] === cardId;

        const bg = new Graphics();
        bg.roundRect(x, y, cardSizeW, cardSizeH, 8);
        bg.fill(0x1f2937);
        bg.stroke({ width: isCurrent ? 3 : 1, color: isCurrent ? 0x22c55e : 0x374151 });
        bg.zIndex = 1;
        bg.eventMode = 'static';
        bg.cursor = 'pointer';
        bg.hitArea = new (makeHitRect())(x, y, cardSizeW, cardSizeH);
        bg.on('pointertap', () => {
          assignPreFightCardToActiveSlot(cardId);
          render();
        });
        galleryCards.addChild(bg);

        const name = new Text({
          text: card.name,
          style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold', fontFamily: 'monospace', wordWrap: true, wordWrapWidth: cardSizeW - 20 },
        });
        name.x = x + 10;
        name.y = y + 8;
        name.zIndex = 2;
        name.eventMode = 'none';
        galleryCards.addChild(name);

        const rarityIcon = createRarityIcon(card.rarity ?? 'common', 7);
        rarityIcon.x = x + cardSizeW - 16;
        rarityIcon.y = y + 8;
        rarityIcon.zIndex = 2;
        rarityIcon.eventMode = 'none';
        galleryCards.addChild(rarityIcon);

        const energy = createEnergyIcon(11);
        energy.x = x + 10;
        energy.y = y + 30;
        energy.zIndex = 2;
        energy.eventMode = 'none';
        galleryCards.addChild(energy);

        const cost = new Text({
          text: `${card.cost.energy}`,
          style: { fill: 0x38bdf8, fontSize: 12, fontWeight: 'bold', fontFamily: 'monospace' },
        });
        cost.x = x + 23;
        cost.y = y + 30;
        cost.zIndex = 2;
        cost.eventMode = 'none';
        galleryCards.addChild(cost);

        const divider = new Graphics();
        divider.moveTo(0, 0).lineTo(cardSizeW - 16, 0);
        divider.stroke({ width: 1, color: 0x374151 });
        divider.alpha = 0.5;
        divider.x = x + 8;
        divider.y = y + 46;
        divider.zIndex = 2;
        divider.eventMode = 'none';
        galleryCards.addChild(divider);

        const effectText = new Text({
          text: summarizeCardEffects(card),
          style: { fill: 0xd1d5db, fontSize: 9, fontFamily: 'monospace', wordWrap: true, wordWrapWidth: cardSizeW - 16 },
        });
        effectText.x = x + 8;
        effectText.y = y + 52;
        effectText.zIndex = 2;
        effectText.eventMode = 'none';
        galleryCards.addChild(effectText);

        const firstEffect = card.effects.find(e => e.kind !== 'modifier' && e.kind !== 'deck_inject');
        if (firstEffect) {
          const icon = createEffectIcon(firstEffect.kind, 10);
          if (icon) {
            icon.x = x + 8;
            icon.y = y + cardSizeH - 24;
            icon.zIndex = 2;
            icon.eventMode = 'none';
            galleryCards.addChild(icon);
          }
        }

        if (card.maxRange || card.minRange || card.optimalRange !== undefined) {
          const rangeIcon = createRangeIcon(9);
          rangeIcon.x = x + cardSizeW - 32;
          rangeIcon.y = y + cardSizeH - 22;
          rangeIcon.zIndex = 2;
          rangeIcon.eventMode = 'none';
          galleryCards.addChild(rangeIcon);
        }

        if (card.exhaust) {
          const exhaustIcon = createExhaustIcon(9);
          exhaustIcon.x = x + 20;
          exhaustIcon.y = y + cardSizeH - 22;
          exhaustIcon.zIndex = 2;
          exhaustIcon.eventMode = 'none';
          galleryCards.addChild(exhaustIcon);
        }

        const rarityText = new Text({
          text: (card.rarity ?? 'common').toUpperCase(),
          style: { fill: 0xfbbf24, fontSize: 9, fontFamily: 'monospace' },
        });
        rarityText.anchor.set(0.5);
        rarityText.x = x + cardSizeW / 2;
        rarityText.y = y + cardSizeH - 10;
        rarityText.zIndex = 2;
        rarityText.eventMode = 'none';
        galleryCards.addChild(rarityText);
      }

      const railX = galleryX + galleryW - 24;
      const rail = new Graphics();
      rail.roundRect(railX, viewportY, 10, viewportH, 5);
      rail.fill({ color: 0x1f2937, alpha: 0.95 });
      rail.stroke({ width: 1, color: 0x475569 });
      rail.zIndex = 3;
      modal.addChild(rail);

      const thumbH = Math.max(24, (viewportH / Math.max(contentHeight, 1)) * viewportH);
      const thumbY = viewportY + (maxScroll > 0 ? (scroll / maxScroll) * (viewportH - thumbH) : 0);
      const thumb = new Graphics();
      thumb.roundRect(railX + 1, thumbY, 8, thumbH, 4);
      thumb.fill({ color: 0x22c55e, alpha: 0.95 });
      thumb.zIndex = 4;
      modal.addChild(thumb);

      const upBtn = new Graphics();
      upBtn.roundRect(railX, viewportY - 18, 10, 14, 3);
      upBtn.fill({ color: 0x1d4ed8, alpha: 0.95 });
      upBtn.stroke({ width: 1, color: 0x60a5fa });
      upBtn.zIndex = 4;
      upBtn.eventMode = 'static';
      upBtn.cursor = 'pointer';
      upBtn.hitArea = new (makeHitRect())(railX, viewportY - 18, 10, 14);
      upBtn.on('pointertap', () => {
        setPreFightCardCatalogScroll(Math.max(0, scroll - 80));
        render();
      });
      modal.addChild(upBtn);

      const downBtn = new Graphics();
      downBtn.roundRect(railX, viewportY + viewportH + 4, 10, 14, 3);
      downBtn.fill({ color: 0x1d4ed8, alpha: 0.95 });
      downBtn.stroke({ width: 1, color: 0x60a5fa });
      downBtn.zIndex = 4;
      downBtn.eventMode = 'static';
      downBtn.cursor = 'pointer';
      downBtn.hitArea = new (makeHitRect())(railX, viewportY + viewportH + 4, 10, 14);
      downBtn.on('pointertap', () => {
        setPreFightCardCatalogScroll(Math.min(maxScroll, scroll + 80));
        render();
      });
      modal.addChild(downBtn);
    }
  }

  if (isCardsPage) {
    const backBtn = new Graphics();
    backBtn.roundRect(80, 726, 220, 64, 10);
    backBtn.fill({ color: 0x334155, alpha: 0.97 });
    backBtn.stroke({ width: 2, color: 0x64748b });
    backBtn.zIndex = 2;
    backBtn.eventMode = 'static';
    backBtn.cursor = 'pointer';
    backBtn.hitArea = new (makeHitRect())(80, 726, 220, 64);
    backBtn.on('pointertap', () => {
      setPreFightPage('lineup');
      render();
    });
    modal.addChild(backBtn);

    const backLabel = new Text({
      text: 'BACK',
      style: { fill: 0xffffff, fontSize: 22, fontWeight: 'bold', fontFamily: 'monospace' },
    });
    backLabel.anchor.set(0.5);
    backLabel.x = 190;
    backLabel.y = 758;
    backLabel.zIndex = 3;
    backLabel.eventMode = 'none';
    modal.addChild(backLabel);
  }

  const startBtnW = 280;
  const startBtnH = 64;
  const startBtnX = (WIDTH - startBtnW) / 2;
  const startBtnY = 726;

  const startBtn = new Graphics();
  startBtn.roundRect(startBtnX, startBtnY, startBtnW, startBtnH, 10);
  const lineupPrimaryEnabled = useDefaultCards ? canStart : canAdvanceToCards;
  const primaryEnabled = isCardsPage ? canStart : lineupPrimaryEnabled;
  startBtn.fill({ color: primaryEnabled ? 0x16a34a : 0x334155, alpha: 0.97 });
  startBtn.stroke({ width: 2, color: primaryEnabled ? 0x22c55e : 0x475569 });
  startBtn.zIndex = 2;
  if (primaryEnabled) {
    startBtn.eventMode = 'static';
    startBtn.cursor = 'pointer';
    startBtn.hitArea = new (makeHitRect())(startBtnX, startBtnY, startBtnW, startBtnH);
    startBtn.on('pointertap', () => {
      if (!isCardsPage && !useDefaultCards) {
        setPreFightPage('cards');
      } else {
        confirmPreFightLineup(render);
      }
      render();
    });
  }
  modal.addChild(startBtn);

  const startLabel = new Text({
    text: isCardsPage
      ? (canStart ? 'START FIGHT' : 'ADJUST DECK/THREAT')
      : (useDefaultCards
        ? (canStart ? 'START FIGHT' : 'SELECT FULL LINEUP')
        : (canAdvanceToCards ? 'NEXT: CARD SELECTION' : 'SELECT FULL LINEUP')),
    style: {
      fill: 0xffffff,
      fontSize: 20,
      fontWeight: 'bold',
      fontFamily: 'monospace',
    },
  });
  startLabel.anchor.set(0.5);
  startLabel.x = startBtnX + startBtnW / 2;
  startLabel.y = startBtnY + startBtnH / 2;
  startLabel.zIndex = 3;
  startLabel.eventMode = 'none';
  modal.addChild(startLabel);

  app.stage.addChild(modal);
}
