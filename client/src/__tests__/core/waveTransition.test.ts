import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGameState } from '../../core/gameState.js';
import { startNextWave } from '../../core/waveTransition.js';
import { getModifierRegistry } from '../../core/modifiers.js';
import { createMockCard, createMockCharacter, resetGameState, setupGameState } from '../utils/test-helpers.js';
import type { CharacterDefinition } from '../../core/types.js';

const {
  drawCardsMock,
  generateWaveMock,
  computeDifficultyMock,
  renderMock,
  pickRandomMapMock,
  buildTurnQueueMock,
  getEnemyPreferredRangeDecisionMock,
  processEnemyTurnMock,
} = vi.hoisted(() => ({
  drawCardsMock: vi.fn(),
  generateWaveMock: vi.fn(),
  computeDifficultyMock: vi.fn(() => 42),
  renderMock: vi.fn(),
  pickRandomMapMock: vi.fn(() => 'map_wave_2'),
  buildTurnQueueMock: vi.fn(() => ['ally_a', 'enemy_1']),
  getEnemyPreferredRangeDecisionMock: vi.fn(() => ({ mode: 'flexible' as const, targetRange: 2 })),
  processEnemyTurnMock: vi.fn(),
}));

vi.mock('../../core/deck.js', () => ({
  drawCards: drawCardsMock,
}));

vi.mock('../../core/waveGenerator.js', () => ({
  generateWave: generateWaveMock,
  computeDifficulty: computeDifficultyMock,
}));

vi.mock('../../rendering/renderer.js', () => ({
  render: renderMock,
}));

vi.mock('../../rendering/renderBackground.js', () => ({
  pickRandomMap: pickRandomMapMock,
}));

vi.mock('../../core/combat.js', () => ({
  buildTurnQueue: buildTurnQueueMock,
  getEnemyPreferredRangeDecisionForCardIds: getEnemyPreferredRangeDecisionMock,
  processEnemyTurn: processEnemyTurnMock,
}));

describe('waveTransition', () => {
  beforeEach(() => {
    resetGameState();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    getModifierRegistry().clearAll();
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
  });

  it('resets wave state, heals allies, removes enemies, and spawns next wave', () => {
    const ally = createMockCharacter({
      id: 'ally_a',
      name: 'Ally A',
      isPlayer: true,
      hp: 60,
      maxHp: 100,
      energy: 0,
      maxEnergy: 3,
      deck: ['strike'],
      discardPile: ['strike'],
      hand: ['inst_1'],
      drawCount: 2,
      blockLayers: [{ amount: 5, baseAmount: 5, decay_percent: 50 }],
      statuses: [{ id: 'bleed', stacks: 2 }],
      slotIndex: 4,
    });
    const enemy = createMockCharacter({
      id: 'enemy_old',
      isPlayer: false,
      hand: ['enemy_inst_1'],
      hp: 100,
      slotIndex: 8,
    });
    const enemyDef: CharacterDefinition = {
      ...createMockCharacter({
        id: 'enemy_1',
        name: 'Enemy 1',
        isPlayer: false,
        hp: 40,
        maxHp: 40,
        energy: 2,
        maxEnergy: 2,
        slotIndex: 8,
        speed: 1,
      }),
      stats: {
        hp: 40,
        maxHp: 40,
        energy: 2,
        maxEnergy: 2,
        speed: 1,
        suppression: 0,
        suppressionResist: 0,
        aggression: 5,
      },
      startingDeck: ['strike'],
    };

    generateWaveMock.mockReturnValue([enemyDef]);

    setupGameState({
      waveNumber: 1,
      currentMap: 'map_wave_1',
      characters: [ally, enemy],
      characterLibrary: {
        ally_a: {
          ...ally,
          stats: { hp: 100, maxHp: 100, energy: 3, maxEnergy: 3, speed: 0, suppression: 0, suppressionResist: 0, aggression: 5 },
          startingDeck: ['strike'],
        },
        enemy_1: enemyDef,
      },
      cardLibrary: {
        strike: createMockCard({ id: 'strike', copies: 1 }),
      },
      cardInstances: {
        inst_1: { ...createMockCard({ id: 'inst_1' }), instanceId: 'inst_1', templateId: 'strike' },
        enemy_inst_1: { ...createMockCard({ id: 'enemy_inst_1' }), instanceId: 'enemy_inst_1', templateId: 'strike' },
      },
      laneHazards: [{ slotIndex: 3, damage: 4, remainingTurns: 1, ownerIsPlayer: true }],
      combatResult: 'victory',
      pendingReward: createMockCard({ id: 'reward_card' }) as any,
      selectedCardId: 'inst_1',
      turnQueue: ['ally_a'],
      turnQueueIndex: 0,
      roundNumber: 5,
    });

    startNextWave();

    const state = getGameState();
    const nextAlly = state.characters.find(c => c.id === 'ally_a')!;
    const newEnemy = state.characters.find(c => c.id === 'enemy_1');

    expect(state.waveNumber).toBe(2);
    expect(state.currentMap).toBe('map_wave_2');
    expect(nextAlly.hp).toBe(80);
    expect(nextAlly.energy).toBe(nextAlly.maxEnergy);
    expect(nextAlly.statuses).toEqual([]);
    expect(nextAlly.blockLayers).toEqual([]);
    expect(state.characters.some(c => c.id === 'enemy_old')).toBe(false);
    expect(newEnemy).toBeDefined();
    expect(state.laneHazards).toEqual([]);
    expect(state.combatResult).toBe('ongoing');
    expect(state.pendingReward).toBeNull();
    expect(state.selectedCardId).toBeNull();
    expect(state.roundNumber).toBe(1);
    expect(state.turnQueue).toEqual(['ally_a', 'enemy_1']);
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(drawCardsMock).toHaveBeenCalled();
    expect(generateWaveMock).toHaveBeenCalledWith(2, expect.any(Array), ['enemy_old'], expect.any(Object));
  });

  it('creates unique ids when same enemy type appears multiple times', () => {
    const ally = createMockCharacter({ id: 'ally_a', isPlayer: true, hp: 100, maxHp: 100, slotIndex: 0 });
    const clonedEnemyDef: CharacterDefinition = {
      ...createMockCharacter({
        id: 'dupe_enemy',
        name: 'Dupe Enemy',
        isPlayer: false,
        hp: 30,
        maxHp: 30,
        energy: 2,
        maxEnergy: 2,
        slotIndex: 8,
      }),
      stats: {
        hp: 30,
        maxHp: 30,
        energy: 2,
        maxEnergy: 2,
        speed: 0,
        suppression: 0,
        suppressionResist: 0,
        aggression: 5,
      },
      startingDeck: ['strike'],
    };
    generateWaveMock.mockReturnValue([clonedEnemyDef, clonedEnemyDef]);

    setupGameState({
      characters: [ally],
      characterLibrary: {
        ally_a: {
          ...ally,
          stats: { hp: 100, maxHp: 100, energy: 3, maxEnergy: 3, speed: 0, suppression: 0, suppressionResist: 0, aggression: 5 },
          startingDeck: ['strike'],
        },
        dupe_enemy: clonedEnemyDef,
      },
      cardLibrary: { strike: createMockCard({ id: 'strike' }) },
    });

    startNextWave();

    const ids = getGameState().characters.filter(c => !c.isPlayer).map(c => c.id).sort();
    expect(ids).toEqual(['dupe_enemy', 'dupe_enemy_1']);
  });
});
