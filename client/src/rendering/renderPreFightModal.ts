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
import { registerCardHoverRegion, setHoveredCard } from './tooltipState.js';
import { renderCardTile } from './cardTileRenderer.js';
import { createRarityIcon } from './icons/rarityIcon.js';

const loadoutScrollByAlly = new Map<string, number>();

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

    const gap = candidates.length > 8 ? 6 : candidates.length > 6 ? 8 : 16;
    const maxCardW = 240;
    const availableRosterW = panelW - 32;
    const cardW = candidates.length > 0
      ? Math.min(
        maxCardW,
        Math.floor((availableRosterW - Math.max(0, candidates.length - 1) * gap) / candidates.length),
      )
      : maxCardW;
    const cardH = cardW < 170 ? 136 : 148;
    const totalW = candidates.length * cardW + Math.max(0, candidates.length - 1) * gap;
    const startX = panelX + Math.max(0, Math.floor((panelW - totalW) / 2));
    const startY = panelY + Math.floor((panelH - cardH) / 2);
    const compactRosterCard = cardW < 170;

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
        style: { fill: 0xffffff, fontSize: compactRosterCard ? 14 : 18, fontWeight: 'bold', fontFamily: 'monospace' },
      });
      name.anchor.set(0.5, 0);
      name.x = x + cardW / 2;
      name.y = startY + (compactRosterCard ? 10 : 12);
      name.zIndex = 3;
      name.eventMode = 'none';
      modal.addChild(name);

      const hp = new Text({
        text: `HP ${ally.hp}/${ally.maxHp}`,
        style: { fill: 0x4ade80, fontSize: compactRosterCard ? 12 : 14, fontFamily: 'monospace' },
      });
      hp.anchor.set(0.5, 0);
      hp.x = x + cardW / 2;
      hp.y = startY + (compactRosterCard ? 40 : 46);
      hp.zIndex = 3;
      hp.eventMode = 'none';
      modal.addChild(hp);

      const speed = new Text({
        text: `Speed ${ally.speed}`,
        style: { fill: 0x93c5fd, fontSize: compactRosterCard ? 12 : 14, fontFamily: 'monospace' },
      });
      speed.anchor.set(0.5, 0);
      speed.x = x + cardW / 2;
      speed.y = startY + (compactRosterCard ? 58 : 68);
      speed.zIndex = 3;
      speed.eventMode = 'none';
      modal.addChild(speed);

      const slotSize = new Text({
        text: `Size ${Math.max(1, Math.floor(ally.slotSize ?? 1))}`,
        style: { fill: 0xcbd5e1, fontSize: compactRosterCard ? 12 : 13, fontFamily: 'monospace' },
      });
      slotSize.anchor.set(0.5, 0);
      slotSize.x = x + cardW / 2;
      slotSize.y = startY + (compactRosterCard ? 76 : 90);
      slotSize.zIndex = 3;
      slotSize.eventMode = 'none';
      modal.addChild(slotSize);

      const status = new Text({
        text: isSelected ? `SELECTED #${selectedOrder}` : 'NOT SELECTED',
        style: {
          fill: isSelected ? 0x2dd4bf : 0x94a3b8,
          fontSize: compactRosterCard ? 11 : 13,
          fontWeight: 'bold',
          fontFamily: 'monospace',
        },
      });
      status.anchor.set(0.5, 0);
      status.x = x + cardW / 2;
      status.y = startY + (compactRosterCard ? 102 : 116);
      status.zIndex = 3;
      status.eventMode = 'none';
      modal.addChild(status);
    });
  }

  const lineupPanel = new Graphics();
  const cardsPagePanelW = WIDTH - 80;
  const lineupW = isCardsPage ? cardsPagePanelW : 980;
  const lineupH = isCardsPage ? 112 : 170;
  const lineupX = isCardsPage ? 40 : (WIDTH - lineupW) / 2;
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
  lineupTitle.x = lineupX + lineupW / 2;
  lineupTitle.y = lineupY + 12;
  lineupTitle.zIndex = 2;
  modal.addChild(lineupTitle);

  const selectedAllies = selectedIds
    .map(id => candidates.find(c => c.id === id))
    .filter((c): c is Character => !!c);
  const chipGap = selectedAllies.length > 8 ? 6 : selectedAllies.length > 6 ? 8 : 16;
  const chipBaseW = isCardsPage ? 214 : 220;
  const availableLineupW = lineupW - 32;
  const chipW = selectedAllies.length > 0
    ? Math.min(
      chipBaseW,
      Math.floor((availableLineupW - Math.max(0, selectedAllies.length - 1) * chipGap) / selectedAllies.length),
    )
    : chipBaseW;
  const compactLineupChip = chipW < (isCardsPage ? 170 : 150);
  const chipH = isCardsPage
    ? (compactLineupChip ? 50 : 56)
    : (compactLineupChip ? 72 : 84);
  const chipsTotalW = selectedAllies.length * chipW + Math.max(0, selectedAllies.length - 1) * chipGap;
  const chipsStartX = lineupX + Math.max(0, (lineupW - chipsTotalW) / 2);
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
      style: { fill: 0x99f6e4, fontSize: compactLineupChip ? 11 : 12, fontFamily: 'monospace' },
    });
    slotLabel.anchor.set(0.5, 0);
    slotLabel.x = x + chipW / 2;
    slotLabel.y = chipsY + (isCardsPage ? (compactLineupChip ? 3 : 4) : (compactLineupChip ? 4 : 6));
    slotLabel.zIndex = 3;
    slotLabel.eventMode = 'none';
    modal.addChild(slotLabel);

    const name = new Text({
      text: ally.name,
      style: { fill: 0xffffff, fontSize: compactLineupChip ? 12 : 14, fontWeight: 'bold', fontFamily: 'monospace' },
    });
    name.anchor.set(0.5);
    name.x = x + chipW / 2;
    name.y = chipsY + (isCardsPage ? (compactLineupChip ? 26 : 30) : (compactLineupChip ? 34 : 42));
    name.zIndex = 3;
    name.eventMode = 'none';
    modal.addChild(name);

    const arrowW = compactLineupChip ? 18 : 24;
    const arrowH = isCardsPage ? (compactLineupChip ? 16 : 18) : (compactLineupChip ? 20 : 24);
    const arrowPad = compactLineupChip ? 6 : 10;
    const leftX = x + arrowPad;
    const rightX = x + chipW - arrowW - arrowPad;
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
    const cardsBodyY = lineupY + lineupH + 14;
    const cardsBodyH = HEIGHT - cardsBodyY - 90;
    const loadoutPanelW = 320;
    const bodyGap = 12;
    const cardsPanelX = 40 + loadoutPanelW + bodyGap;
    const cardsPanelW = cardsPagePanelW - loadoutPanelW - bodyGap;

    const editorPanel = new Graphics();
    const editorW = loadoutPanelW;
    const editorH = cardsBodyH;
    const editorX = 40;
    const editorY = cardsBodyY;
    editorPanel.roundRect(editorX, editorY, editorW, editorH, 10);
    editorPanel.fill({ color: 0x0b1220, alpha: 0.95 });
    editorPanel.stroke({ width: 2, color: 0x334155 });
    editorPanel.zIndex = 1;
    modal.addChild(editorPanel);

    const activeAlly = selectedAllies.find(c => c.id === gameState.preFight.activeCardEditorAllyId) ?? selectedAllies[0];
    if (activeAlly) {
      const editorTitle = new Text({
        text: `Card Loadout: ${activeAlly.name}`,
        style: { fill: 0xe2e8f0, fontSize: 14, fontWeight: 'bold', fontFamily: 'monospace' },
      });
      editorTitle.anchor.set(0.5, 0);
      editorTitle.x = editorX + editorW / 2;
      editorTitle.y = editorY + 10;
      editorTitle.zIndex = 2;
      modal.addChild(editorTitle);

    const selectedDeck = gameState.preFight.cardsByAlly[activeAlly.id] ?? [];
    const slotW = editorW - 32; // 8px tighter than before
    const slotH = 56; // 8px shorter to reduce overflow
    const slotGap = 8;
    const maxVisibleSlots = selectedDeck.length;
    const slotsStartX = editorX + 12;
    const slotsY = editorY + 38;
    const slotsViewportW = editorW - 24;
    const slotsViewportH = editorH - 46;
    const loadoutContentH = maxVisibleSlots * slotH + Math.max(0, maxVisibleSlots - 1) * slotGap;
    const maxLoadoutScroll = Math.max(0, loadoutContentH - slotsViewportH);
    const storedLoadoutScroll = loadoutScrollByAlly.get(activeAlly.id) ?? 0;
    const loadoutScroll = Math.max(0, Math.min(storedLoadoutScroll, maxLoadoutScroll));
    if (loadoutScroll !== storedLoadoutScroll) {
      loadoutScrollByAlly.set(activeAlly.id, loadoutScroll);
    }

    const loadoutSlots = new Container();
    loadoutSlots.zIndex = 2;
    loadoutSlots.eventMode = 'static';
    loadoutSlots.hitArea = new (makeHitRect())(slotsStartX, slotsY, slotsViewportW, slotsViewportH);
    loadoutSlots.on('wheel', (event: any) => {
      const deltaY = Number(event?.deltaY ?? 0);
      loadoutScrollByAlly.set(
        activeAlly.id,
        Math.max(0, Math.min(maxLoadoutScroll, loadoutScroll + deltaY * 0.6)),
      );
      render();
    });
    modal.addChild(loadoutSlots);

    const loadoutMask = new Graphics();
    loadoutMask.rect(slotsStartX, slotsY, slotsViewportW, slotsViewportH);
    loadoutMask.fill({ color: 0x000000, alpha: 1 });
    loadoutMask.alpha = 0.001;
    loadoutMask.zIndex = 2;
    modal.addChild(loadoutMask);
    loadoutSlots.mask = loadoutMask;

      for (let slotIndex = 0; slotIndex < maxVisibleSlots; slotIndex++) {
        const cardId = selectedDeck[slotIndex];
        const card = gameState.cardLibrary[cardId];
        const x = slotsStartX;
        const y = slotsY + slotIndex * (slotH + slotGap) - loadoutScroll;
        if (y + slotH < slotsY - 2 || y > slotsY + slotsViewportH + 2) continue;
        const isActiveSlot = gameState.preFight.activeCardSlotIndex === slotIndex;

        const slotBg = new Graphics();
        slotBg.roundRect(x, y, slotW, slotH, 8);
        slotBg.fill({ color: isActiveSlot ? 0x0f766e : 0x1e293b, alpha: 0.97 });
        slotBg.stroke({ width: 2, color: isActiveSlot ? 0x2dd4bf : 0x475569 });
        slotBg.zIndex = 2;
        slotBg.eventMode = 'static';
        slotBg.cursor = 'pointer';
        slotBg.hitArea = new (makeHitRect())(x, y, slotW, slotH);
        slotBg.on('pointertap', () => {
          setPreFightActiveCardSlot(slotIndex);
          render();
        });
        loadoutSlots.addChild(slotBg);

        const slotLabel = new Text({
          text: `#${slotIndex + 1}`,
          style: { fill: 0x93c5fd, fontSize: 11, fontFamily: 'monospace' },
        });
        slotLabel.anchor.set(0.5, 0);
        slotLabel.x = x + slotW / 2;
        slotLabel.y = y + 6;
        slotLabel.zIndex = 3;
        slotLabel.eventMode = 'none';
        loadoutSlots.addChild(slotLabel);

        const cardName = new Text({
          text: card?.name ?? cardId,
          style: { fill: 0xffffff, fontSize: 10, fontWeight: 'bold', fontFamily: 'monospace', align: 'center', wordWrap: true, wordWrapWidth: slotW - 28 },
        });
        cardName.anchor.set(0.5, 0);
        cardName.x = x + slotW / 2;
        cardName.y = y + 18;
        cardName.zIndex = 3;
        cardName.eventMode = 'none';
        loadoutSlots.addChild(cardName);

        const rarityIcon = createRarityIcon(card?.rarity ?? 'common', 8);
        rarityIcon.x = x + slotW - 14;
        rarityIcon.y = y + 6;
        rarityIcon.zIndex = 8000;
        rarityIcon.eventMode = 'static';
        rarityIcon.cursor = 'help';
        registerCardHoverRegion(card?.id ?? cardId, rarityIcon.x - 8, rarityIcon.y - 8, 24, 24, rarityIcon.x, rarityIcon.y + 14);
        rarityIcon.on('pointerenter', () => {
          const templateId = card?.id ?? cardId;
          if (setHoveredCard(templateId, rarityIcon.x, rarityIcon.y + 14)) render();
        });
        rarityIcon.on('pointerout', () => {
          if (setHoveredCard(null)) render();
        });
        loadoutSlots.addChild(rarityIcon);

        const chooseLabel = new Text({
          text: isActiveSlot ? 'SELECTING...' : 'CLICK TO SELECT',
          style: { fill: isActiveSlot ? 0x34d399 : 0x94a3b8, fontSize: 10, fontWeight: 'bold', fontFamily: 'monospace' },
        });
        chooseLabel.anchor.set(0.5);
        chooseLabel.x = x + slotW / 2;
        chooseLabel.y = y + slotH - 7;
        chooseLabel.zIndex = 4;
        chooseLabel.eventMode = 'none';
        loadoutSlots.addChild(chooseLabel);
      }

      const loadoutRailX = editorX + editorW - 9;
      const loadoutRail = new Graphics();
      loadoutRail.roundRect(loadoutRailX, slotsY, 5, slotsViewportH, 3);
      loadoutRail.fill({ color: 0x1f2937, alpha: 0.95 });
      loadoutRail.stroke({ width: 1, color: 0x475569 });
      loadoutRail.zIndex = 3;
      modal.addChild(loadoutRail);

      const loadoutThumbH = Math.max(18, (slotsViewportH / Math.max(loadoutContentH, 1)) * slotsViewportH);
      const loadoutThumbY = slotsY + (maxLoadoutScroll > 0 ? (loadoutScroll / maxLoadoutScroll) * (slotsViewportH - loadoutThumbH) : 0);
      const loadoutThumb = new Graphics();
      loadoutThumb.roundRect(loadoutRailX + 1, loadoutThumbY, 3, loadoutThumbH, 2);
      loadoutThumb.fill({ color: 0x22c55e, alpha: 0.95 });
      loadoutThumb.zIndex = 4;
      modal.addChild(loadoutThumb);

      const galleryPanel = new Graphics();
      // Keep card tiles consistent with the play screen/cardTileRenderer baseline size.
      const cardSizeW = 125;
      const cardSizeH = 155;
      const cardGapX = 8;
      const cardGapY = 8;
      const scrollbarW = 24;
      const viewportPadX = 10;
      const galleryW = cardsPanelW;
      const galleryX = cardsPanelX;
      const galleryY = cardsBodyY;
      const galleryH = cardsBodyH;
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
      galleryTitle.x = galleryX + galleryW / 2;
      galleryTitle.y = galleryY + 8;
      galleryTitle.zIndex = 2;
      modal.addChild(galleryTitle);

      const viewportX = galleryX + viewportPadX;
      const viewportY = galleryY + 30;
      const viewportW = galleryW - viewportPadX * 2 - scrollbarW;
      const viewportH = galleryH - 52;
      const cols = Math.max(2, Math.floor((viewportW + cardGapX) / (cardSizeW + cardGapX)));
      const gridW = cols * cardSizeW + Math.max(0, cols - 1) * cardGapX;
      const gridStartX = viewportX + Math.max(0, Math.floor((viewportW - gridW) / 2));

      const totalRows = Math.max(1, Math.ceil(cardPoolOrdered.length / cols));
      const contentHeight = totalRows * cardSizeH + Math.max(0, totalRows - 1) * cardGapY;
      const maxScroll = Math.max(0, contentHeight - viewportH);
      const scroll = Math.max(0, Math.min(gameState.preFight.cardCatalogScroll, maxScroll));
      if (scroll !== gameState.preFight.cardCatalogScroll) {
        setPreFightCardCatalogScroll(scroll);
      }

      const galleryCards = new Container();
      galleryCards.zIndex = 2;
      galleryCards.eventMode = 'static';
      galleryCards.hitArea = new (makeHitRect())(viewportX, viewportY, viewportW, viewportH);
      galleryCards.on('wheel', (event: any) => {
        const deltaY = Number(event?.deltaY ?? 0);
        setPreFightCardCatalogScroll(Math.max(0, Math.min(maxScroll, scroll + deltaY * 0.6)));
        render();
      });
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
        const x = gridStartX + col * (cardSizeW + cardGapX);
        const y = viewportY + row * (cardSizeH + cardGapY) - scroll;
        const activeSlotIndex = gameState.preFight.activeCardSlotIndex;
        const activeDeck = gameState.preFight.cardsByAlly[activeAlly.id] ?? [];
        const isCurrent = activeSlotIndex !== null && activeDeck[activeSlotIndex] === cardId;
        const cardTile = renderCardTile(galleryCards, card, x, y, {
          selected: isCurrent,
          interactive: true,
          caster: activeAlly,
          onClick: () => {
            assignPreFightCardToActiveSlot(cardId);
            render();
          },
          onRarityHover: (templateId, anchorX, anchorY) => {
            if (templateId) {
              if (setHoveredCard(templateId, anchorX ?? 0, anchorY ?? 0)) render();
            } else if (setHoveredCard(null)) {
              render();
            }
          },
        });
        cardTile.zIndex = 1;
      }

      const railX = galleryX + galleryW - scrollbarW;
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
