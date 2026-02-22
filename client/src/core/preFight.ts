import type { Character, CharacterDefinition, PreFightSource } from './types.js';
import { ALLY_SLOT_END, ENEMY_SLOT_START, MAX_SLOTS } from './constants.js';
import { addToCombatLog, getGameState } from './gameState.js';
import { buildTurnQueue, processEnemyTurn } from './combat.js';
import { computeDifficulty } from './waveGenerator.js';
import { drawCards } from './deck.js';
import { shuffleArray } from '../utils/shuffle.js';

interface BeginPreFightOptions {
  candidateAllyIds?: string[];
  requiredLineupSize?: number;
  source?: PreFightSource;
  pendingThreatScore?: number | null;
  playerCardPoolIds?: string[];
}

const RARITY_ORDER: Record<string, number> = {
  common: 0,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

function getOccupiedSlotsForPlacement(slotIndex: number, slotSize: number): number[] {
  return Array.from({ length: slotSize }, (_, i) => slotIndex + i);
}

function findAvailableFrontSlot(characters: Character[], isPlayer: boolean, slotSize: number): number | null {
  const sideMin = isPlayer ? 0 : ENEMY_SLOT_START;
  const sideMax = isPlayer ? ALLY_SLOT_END : MAX_SLOTS - 1;
  const maxFrontSlot = sideMax - slotSize + 1;
  for (let frontSlot = sideMin; frontSlot <= maxFrontSlot; frontSlot++) {
    const candidateSlots = getOccupiedSlotsForPlacement(frontSlot, slotSize);
    const blocked = characters.some(existing => {
      if (existing.hp <= 0 || existing.isPlayer !== isPlayer) return false;
      const existingSize = Math.max(1, Math.floor(existing.slotSize ?? 1));
      const existingSlots = getOccupiedSlotsForPlacement(existing.slotIndex, existingSize);
      return existingSlots.some(slot => candidateSlots.includes(slot));
    });
    if (!blocked) return frontSlot;
  }
  return null;
}

function selectedLivingAlliesCount(): number {
  const gameState = getGameState();
  const selectedSet = new Set(gameState.preFight.selectedAllyIds);
  return gameState.characters.filter(c => c.isPlayer && c.hp > 0 && selectedSet.has(c.id)).length;
}

function getCharacterStartingDeck(charId: string): string[] {
  const gameState = getGameState();
  const def = gameState.characterLibrary[charId];
  if (!def?.startingDeck?.length) return ['strike', 'defend'];
  return [...def.startingDeck];
}

function buildExpandedDeck(deckTemplateIds: string[]): string[] {
  const gameState = getGameState();
  const expanded: string[] = [];
  for (const cardId of deckTemplateIds) {
    const card = gameState.cardLibrary[cardId];
    if (!card) continue;
    const copies = card.copies ?? 1;
    for (let i = 0; i < copies; i++) {
      expanded.push(cardId);
    }
  }
  return shuffleArray(expanded);
}

function computeSelectedLineupThreat(): number {
  const gameState = getGameState();
  const selectedSet = new Set(gameState.preFight.selectedAllyIds);
  let total = 0;
  for (const allyId of selectedSet) {
    const def = gameState.characterLibrary[allyId];
    if (!def) continue;
    const selectedDeck = gameState.preFight.useDefaultCards
      ? getCharacterStartingDeck(allyId)
      : (gameState.preFight.cardsByAlly[allyId] ?? getCharacterStartingDeck(allyId));
    const customDef: CharacterDefinition = {
      ...def,
      startingDeck: [...selectedDeck],
    };
    total += computeDifficulty(customDef, gameState.cardLibrary);
  }
  return total;
}

function isDeckShapeValidForAlly(allyId: string): boolean {
  const selectedDeck = getGameState().preFight.cardsByAlly[allyId];
  if (!selectedDeck?.length) return false;
  const requiredSlots = getCharacterStartingDeck(allyId).length;
  return selectedDeck.length === requiredSlots && selectedDeck.every(cardId => !!cardId);
}

export function isPreFightLineupValid(): boolean {
  const gameState = getGameState();
  if (!gameState.preFight.active) return false;
  if (selectedLivingAlliesCount() !== gameState.preFight.requiredLineupSize) return false;
  for (const allyId of gameState.preFight.selectedAllyIds) {
    if (!isDeckShapeValidForAlly(allyId)) return false;
  }
  return getPreFightCurrentThreat() <= gameState.preFight.threatBudget;
}

export function canStartPreFight(): boolean {
  return isPreFightLineupValid();
}

export function beginPreFightSetup(options: BeginPreFightOptions = {}): void {
  const gameState = getGameState();
  const livingAllies = gameState.characters.filter(c => c.isPlayer && c.hp > 0);
  const cardPoolIds = options.playerCardPoolIds
    ? [...new Set(options.playerCardPoolIds)]
    : Object.values(gameState.cardLibrary)
      .map(card => card.id)
      .sort((a, b) => {
        const cardA = gameState.cardLibrary[a];
        const cardB = gameState.cardLibrary[b];
        return (cardA?.name ?? a).localeCompare(cardB?.name ?? b);
      });

  const candidateIds = options.candidateAllyIds
    ? options.candidateAllyIds.filter(id => livingAllies.some(c => c.id === id))
    : livingAllies.map(c => c.id);

  const requiredLineupSize = Math.min(
    Math.max(1, options.requiredLineupSize ?? 4),
    candidateIds.length,
  );

  const cardsByAlly: Record<string, string[]> = {};
  for (const allyId of candidateIds) {
    cardsByAlly[allyId] = getCharacterStartingDeck(allyId);
  }

  const selectedAllyIds = candidateIds.slice(0, requiredLineupSize);

  gameState.preFight = {
    active: true,
    page: 'lineup',
    useDefaultCards: true,
    candidateAllyIds: candidateIds,
    selectedAllyIds,
    requiredLineupSize,
    source: options.source ?? 'run_start',
    pendingThreatScore: options.pendingThreatScore ?? null,
    activeCardEditorAllyId: selectedAllyIds[0] ?? null,
    activeCardSlotIndex: 0,
    cardCatalogScroll: 0,
    cardPoolIds,
    cardsByAlly,
    threatBudget: 0,
  };
  gameState.preFight.threatBudget = computeSelectedLineupThreat();
  gameState.selectedCardId = null;
}

export function togglePreFightAllySelection(characterId: string): void {
  const gameState = getGameState();
  if (!gameState.preFight.active) return;
  if (!gameState.preFight.candidateAllyIds.includes(characterId)) return;

  const selected = [...gameState.preFight.selectedAllyIds];
  const selectedIndex = selected.indexOf(characterId);
  if (selectedIndex >= 0) {
    selected.splice(selectedIndex, 1);
  } else if (selected.length < gameState.preFight.requiredLineupSize) {
    selected.push(characterId);
  }

  gameState.preFight.selectedAllyIds = selected;
  if (selected.length > 0 && (!gameState.preFight.activeCardEditorAllyId || !selected.includes(gameState.preFight.activeCardEditorAllyId))) {
    gameState.preFight.activeCardEditorAllyId = selected[0];
  }
}

export function movePreFightAlly(characterId: string, direction: 'left' | 'right'): void {
  const gameState = getGameState();
  if (!gameState.preFight.active) return;
  const selected = [...gameState.preFight.selectedAllyIds];
  const index = selected.indexOf(characterId);
  if (index < 0) return;

  const swapIndex = direction === 'left' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= selected.length) return;
  [selected[index], selected[swapIndex]] = [selected[swapIndex], selected[index]];
  gameState.preFight.selectedAllyIds = selected;
}

export function setPreFightActiveCardEditor(characterId: string): void {
  const gameState = getGameState();
  if (!gameState.preFight.active) return;
  if (!gameState.preFight.selectedAllyIds.includes(characterId)) return;
  gameState.preFight.activeCardEditorAllyId = characterId;
  gameState.preFight.activeCardSlotIndex = 0;
}

export function setPreFightUseDefaultCards(useDefaultCards: boolean): void {
  const gameState = getGameState();
  if (!gameState.preFight.active) return;
  gameState.preFight.useDefaultCards = useDefaultCards;
  if (useDefaultCards) {
    gameState.preFight.page = 'lineup';
  }
}

export function setPreFightPage(page: 'lineup' | 'cards'): void {
  const gameState = getGameState();
  if (!gameState.preFight.active) return;
  gameState.preFight.page = page;
  if (page === 'cards') {
    gameState.preFight.cardCatalogScroll = 0;
    if (gameState.preFight.activeCardSlotIndex === null) {
      gameState.preFight.activeCardSlotIndex = 0;
    }
  }
}

export function setPreFightActiveCardSlot(slotIndex: number): void {
  const gameState = getGameState();
  if (!gameState.preFight.active) return;
  const allyId = gameState.preFight.activeCardEditorAllyId;
  if (!allyId) return;
  const deck = gameState.preFight.cardsByAlly[allyId] ?? [];
  if (slotIndex < 0 || slotIndex >= deck.length) return;
  gameState.preFight.activeCardSlotIndex = slotIndex;
}

export function setPreFightCardCatalogScroll(scroll: number): void {
  const gameState = getGameState();
  if (!gameState.preFight.active) return;
  gameState.preFight.cardCatalogScroll = Math.max(0, scroll);
}

export function getPreFightCardPoolSortedByRarity(): string[] {
  const gameState = getGameState();
  return [...gameState.preFight.cardPoolIds].sort((a, b) => {
    const cardA = gameState.cardLibrary[a];
    const cardB = gameState.cardLibrary[b];
    const rankA = RARITY_ORDER[(cardA?.rarity ?? 'common').toLowerCase()] ?? -1;
    const rankB = RARITY_ORDER[(cardB?.rarity ?? 'common').toLowerCase()] ?? -1;
    if (rankA !== rankB) return rankA - rankB;
    return (cardA?.name ?? a).localeCompare(cardB?.name ?? b);
  });
}

export function assignPreFightCardToActiveSlot(cardId: string): void {
  const gameState = getGameState();
  if (!gameState.preFight.active) return;
  const allyId = gameState.preFight.activeCardEditorAllyId;
  if (!allyId) return;
  const slotIndex = gameState.preFight.activeCardSlotIndex;
  if (slotIndex === null) return;

  if (!gameState.preFight.cardPoolIds.includes(cardId)) return;
  const deck = gameState.preFight.cardsByAlly[allyId];
  if (!deck || slotIndex < 0 || slotIndex >= deck.length) return;
  deck[slotIndex] = cardId;
}

export function getPreFightCurrentThreat(): number {
  return computeSelectedLineupThreat();
}

export function canAdvanceToCardSelection(): boolean {
  const gameState = getGameState();
  if (!gameState.preFight.active) return false;
  return selectedLivingAlliesCount() === gameState.preFight.requiredLineupSize;
}

function applySelectedLineup(): void {
  const gameState = getGameState();
  const selectedIds = gameState.preFight.selectedAllyIds.slice(0, gameState.preFight.requiredLineupSize);
  const selectedSet = new Set(selectedIds);
  const alliesToRemove = gameState.characters.filter(c => c.isPlayer && !selectedSet.has(c.id));
  for (const ally of alliesToRemove) {
    for (const cardInstanceId of ally.hand) {
      delete gameState.cardInstances[cardInstanceId];
    }
  }

  gameState.characters = gameState.characters.filter(c => !c.isPlayer || selectedSet.has(c.id));

  const allyById = new Map(
    gameState.characters
      .filter(c => c.isPlayer)
      .map(c => [c.id, c] as const),
  );
  const selectedAllies = selectedIds
    .map(id => allyById.get(id))
    .filter((c): c is Character => !!c);

  const slottedAllies: Character[] = [];
  for (const ally of selectedAllies) {
    const slotSize = Math.max(1, Math.floor(ally.slotSize ?? 1));
    ally.slotSize = slotSize;
    const slotIndex = findAvailableFrontSlot(slottedAllies, true, slotSize);
    if (slotIndex !== null) {
      ally.slotIndex = slotIndex;
      slottedAllies.push(ally);
    }

    // Rebuild deck from selected pre-fight cards, then draw a fresh opening hand.
    const selectedDeck = gameState.preFight.useDefaultCards
      ? getCharacterStartingDeck(ally.id)
      : (gameState.preFight.cardsByAlly[ally.id] ?? getCharacterStartingDeck(ally.id));
    const oldHandIds = [...ally.hand];
    for (const cardInstanceId of oldHandIds) {
      delete gameState.cardInstances[cardInstanceId];
    }
    ally.hand = [];
    ally.discardPile = [];
    ally.deck = buildExpandedDeck(selectedDeck);
    drawCards(ally, ally.drawCount);
  }
}

export function startCombatFromCurrentState(onRender: () => void): void {
  const gameState = getGameState();
  if (gameState.characters.length === 0) return;

  gameState.turnQueue = buildTurnQueue();
  gameState.turnQueueIndex = 0;
  gameState.roundNumber = 1;
  gameState.currentPlayerId = gameState.turnQueue[0] || gameState.characters[0].id;

  const threatScore = gameState.preFight.pendingThreatScore;
  if (threatScore !== null) {
    const threatText = Math.round(threatScore);
    addToCombatLog(`--- Wave ${gameState.waveNumber} --- (Threat: ${threatText})`);
    addToCombatLog(`Total threat: ${threatText}`);
    addToCombatLog(`── Round 1 ── (Threat: ${threatText})`);
  } else {
    addToCombatLog('── Round 1 ──');
  }

  onRender();

  if (gameState.turnQueue.length > 0) {
    const firstChar = gameState.characters.find(c => c.id === gameState.turnQueue[0]);
    if (firstChar && !firstChar.isPlayer) {
      setTimeout(() => processEnemyTurn(firstChar, onRender), 1000);
    }
  }
}

export function confirmPreFightLineup(onRender: () => void): boolean {
  const gameState = getGameState();
  if (!isPreFightLineupValid()) return false;

  applySelectedLineup();

  gameState.preFight = {
    active: false,
    page: 'lineup',
    useDefaultCards: true,
    candidateAllyIds: [],
    selectedAllyIds: [],
    requiredLineupSize: 0,
    source: gameState.preFight.source,
    pendingThreatScore: null,
    activeCardEditorAllyId: null,
    activeCardSlotIndex: null,
    cardCatalogScroll: 0,
    cardPoolIds: [],
    cardsByAlly: {},
    threatBudget: 0,
  };

  startCombatFromCurrentState(onRender);
  return true;
}
