import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGameState } from '../../core/gameState.js';
import {
  assignPreFightCardToActiveSlot,
  beginPreFightSetup,
  canAdvanceToCardSelection,
  confirmPreFightLineup,
  getPreFightCardPoolSortedByRarity,
  isPreFightLineupValid,
  setPreFightActiveCardEditor,
  setPreFightUseDefaultCards,
} from '../../core/preFight.js';
import { createMockCard, createMockCharacter, resetGameState, setupGameState } from '../utils/test-helpers.js';

const {
  buildTurnQueueMock,
  processEnemyTurnMock,
  drawCardsMock,
  computeDifficultyMock,
} = vi.hoisted(() => ({
  buildTurnQueueMock: vi.fn(() => ['ally_a', 'ally_b']),
  processEnemyTurnMock: vi.fn(),
  drawCardsMock: vi.fn(),
  computeDifficultyMock: vi.fn(() => 20),
}));

vi.mock('../../core/combat.js', () => ({
  buildTurnQueue: buildTurnQueueMock,
  processEnemyTurn: processEnemyTurnMock,
}));

vi.mock('../../core/deck.js', () => ({
  drawCards: drawCardsMock,
}));

vi.mock('../../core/waveGenerator.js', () => ({
  computeDifficulty: computeDifficultyMock,
}));

describe('preFight', () => {
  beforeEach(() => {
    resetGameState();
    vi.clearAllMocks();
  });

  it('beginPreFightSetup filters to living allies and initializes defaults', () => {
    const alive = createMockCharacter({ id: 'ally_a', isPlayer: true, hp: 90 });
    const dead = createMockCharacter({ id: 'ally_dead', isPlayer: true, hp: 0 });
    const other = createMockCharacter({ id: 'ally_b', isPlayer: true, hp: 80 });
    const enemy = createMockCharacter({ id: 'enemy_1', isPlayer: false, hp: 100 });

    setupGameState({
      characters: [alive, dead, other, enemy],
      cardLibrary: {
        strike: createMockCard({ id: 'strike', name: 'Strike', rarity: 'common' }),
        laser: createMockCard({ id: 'laser', name: 'Laser', rarity: 'rare' }),
      },
      characterLibrary: {
        ally_a: { ...alive, stats: { hp: 90, maxHp: 100, energy: 3, maxEnergy: 3 }, startingDeck: ['strike', 'laser'] },
        ally_b: { ...other, stats: { hp: 80, maxHp: 100, energy: 3, maxEnergy: 3 }, startingDeck: ['strike', 'strike'] },
      },
    });

    beginPreFightSetup({ requiredLineupSize: 4 });

    const state = getGameState().preFight;
    expect(state.active).toBe(true);
    expect(state.candidateAllyIds).toEqual(['ally_a', 'ally_b']);
    expect(state.selectedAllyIds).toEqual(['ally_a', 'ally_b']);
    expect(state.requiredLineupSize).toBe(2);
    expect(state.threatBudget).toBe(40);
  });

  it('supports editing deck slot only with card from pre-fight pool', () => {
    const ally = createMockCharacter({ id: 'ally_a', isPlayer: true, hp: 100 });
    setupGameState({
      characters: [ally],
      cardLibrary: {
        strike: createMockCard({ id: 'strike', name: 'Strike', rarity: 'common' }),
        laser: createMockCard({ id: 'laser', name: 'Laser', rarity: 'rare' }),
      },
      characterLibrary: {
        ally_a: { ...ally, stats: { hp: 100, maxHp: 100, energy: 3, maxEnergy: 3 }, startingDeck: ['strike', 'strike'] },
      },
    });

    beginPreFightSetup({ playerCardPoolIds: ['strike', 'laser'] });
    setPreFightUseDefaultCards(false);
    setPreFightActiveCardEditor('ally_a');

    assignPreFightCardToActiveSlot('laser');
    expect(getGameState().preFight.cardsByAlly.ally_a[0]).toBe('laser');

    assignPreFightCardToActiveSlot('not_in_pool');
    expect(getGameState().preFight.cardsByAlly.ally_a[0]).toBe('laser');
  });

  it('sorts pre-fight card pool by rarity then name', () => {
    const ally = createMockCharacter({ id: 'ally_a', isPlayer: true, hp: 100 });
    setupGameState({
      characters: [ally],
      cardLibrary: {
        zeta: createMockCard({ id: 'zeta', name: 'Zeta', rarity: 'legendary' }),
        alpha: createMockCard({ id: 'alpha', name: 'Alpha', rarity: 'common' }),
        beta: createMockCard({ id: 'beta', name: 'Beta', rarity: 'rare' }),
      },
      characterLibrary: {
        ally_a: { ...ally, stats: { hp: 100, maxHp: 100, energy: 3, maxEnergy: 3 }, startingDeck: ['alpha', 'beta'] },
      },
    });

    beginPreFightSetup({ playerCardPoolIds: ['zeta', 'beta', 'alpha'] });
    expect(getPreFightCardPoolSortedByRarity()).toEqual(['alpha', 'beta', 'zeta']);
  });

  it('validates lineup and confirms combat transition', () => {
    const allyA = createMockCharacter({ id: 'ally_a', isPlayer: true, hp: 100, drawCount: 2, slotIndex: 3 });
    const allyB = createMockCharacter({ id: 'ally_b', isPlayer: true, hp: 100, drawCount: 2, slotIndex: 4 });
    setupGameState({
      characters: [allyA, allyB],
      cardLibrary: {
        strike: createMockCard({ id: 'strike', name: 'Strike', copies: 1 }),
      },
      characterLibrary: {
        ally_a: { ...allyA, stats: { hp: 100, maxHp: 100, energy: 3, maxEnergy: 3 }, startingDeck: ['strike'] },
        ally_b: { ...allyB, stats: { hp: 100, maxHp: 100, energy: 3, maxEnergy: 3 }, startingDeck: ['strike'] },
      },
      preFight: {
        active: false,
        page: 'lineup',
        useDefaultCards: true,
        candidateAllyIds: [],
        selectedAllyIds: [],
        requiredLineupSize: 0,
        source: 'run_start',
        pendingThreatScore: null,
        activeCardEditorAllyId: null,
        activeCardSlotIndex: null,
        cardCatalogScroll: 0,
        cardPoolIds: [],
        cardsByAlly: {},
        threatBudget: 0,
      },
    });

    beginPreFightSetup({ requiredLineupSize: 2, pendingThreatScore: 123.4 });
    expect(canAdvanceToCardSelection()).toBe(true);
    expect(isPreFightLineupValid()).toBe(true);

    const rendered = vi.fn();
    const confirmed = confirmPreFightLineup(rendered);

    expect(confirmed).toBe(true);
    expect(getGameState().preFight.active).toBe(false);
    expect(buildTurnQueueMock).toHaveBeenCalledTimes(1);
    expect(drawCardsMock).toHaveBeenCalled();
    expect(rendered).toHaveBeenCalled();
  });
});
