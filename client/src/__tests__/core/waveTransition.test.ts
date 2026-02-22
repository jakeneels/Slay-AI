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

function createEnemyDefinition(overrides: Partial<CharacterDefinition> = {}): CharacterDefinition {
  const id = overrides.id ?? 'enemy_test';
  return {
    ...createMockCharacter({
      id,
      name: overrides.name ?? 'Enemy Test',
      isPlayer: false,
      hp: overrides.hp ?? 30,
      maxHp: overrides.maxHp ?? 30,
      energy: overrides.energy ?? 2,
      maxEnergy: overrides.maxEnergy ?? 2,
      slotIndex: overrides.slotIndex ?? 8,
      slotSize: overrides.slotSize ?? 1,
      speed: overrides.speed ?? 1,
    }),
    stats: {
      hp: overrides.stats?.hp ?? overrides.hp ?? 30,
      maxHp: overrides.stats?.maxHp ?? overrides.maxHp ?? 30,
      energy: overrides.stats?.energy ?? overrides.energy ?? 2,
      maxEnergy: overrides.stats?.maxEnergy ?? overrides.maxEnergy ?? 2,
      speed: overrides.stats?.speed ?? overrides.speed ?? 1,
      suppression: overrides.stats?.suppression ?? 0,
      suppressionResist: overrides.stats?.suppressionResist ?? 0,
      aggression: overrides.stats?.aggression ?? 5,
    },
    startingDeck: overrides.startingDeck ?? [],
  };
}

function setupLaneBiasState(enemyDefs: CharacterDefinition[]): void {
  const ally = createMockCharacter({
    id: 'ally_a',
    name: 'Ally A',
    isPlayer: true,
    hp: 100,
    maxHp: 100,
    slotIndex: 0,
    slotSize: 1,
    deck: [],
    discardPile: [],
    hand: [],
  });
  generateWaveMock.mockReturnValue(enemyDefs);
  setupGameState({
    waveNumber: 1,
    currentMap: 'map_wave_1',
    characters: [ally],
    characterLibrary: {
      ally_a: {
        ...ally,
        stats: { hp: 100, maxHp: 100, energy: 3, maxEnergy: 3, speed: 0, suppression: 0, suppressionResist: 0, aggression: 5 },
        startingDeck: [],
      },
      ...Object.fromEntries(enemyDefs.map(def => [def.id, def])),
    },
    cardLibrary: {},
  });
}

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
      pendingRewardChoices: [createMockCard({ id: 'reward_choice_a' }) as any],
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
    expect(nextAlly.hp).toBe(60);
    expect(nextAlly.energy).toBe(nextAlly.maxEnergy);
    expect(nextAlly.statuses).toEqual([]);
    expect(nextAlly.blockLayers).toEqual([]);
    expect(state.characters.some(c => c.id === 'enemy_old')).toBe(false);
    expect(newEnemy).toBeDefined();
    expect(state.laneHazards).toEqual([]);
    expect(state.combatResult).toBe('ongoing');
    expect(state.pendingReward).toBeNull();
    expect(state.pendingRewardChoices).toEqual([]);
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

  it('keeps optimal spawn on lane 8+ when available', () => {
    const enemyDef = createEnemyDefinition({ id: 'enemy_lane_pref' });
    setupLaneBiasState([enemyDef]);
    getModifierRegistry().add({
      id: 'test-optimal-spawn-on',
      target: 'enemy_optimal_spawn_chance',
      op: 'set',
      value: 1,
      source: 'test',
      scope: { kind: 'global' },
    });
    getEnemyPreferredRangeDecisionMock.mockReturnValueOnce({ mode: 'max_optimal', targetRange: 8 });
    vi.spyOn(Math, 'random')
      .mockImplementationOnce(() => 0.0)
      .mockImplementationOnce(() => 0.9);

    startNextWave();

    const spawnedEnemy = getGameState().characters.find(c => !c.isPlayer);
    expect(spawnedEnemy).toBeDefined();
    expect(spawnedEnemy?.slotIndex).toBe(8);
  });

  it('uses 20% lane 7 chance for close-range intent', () => {
    const enemyDef = createEnemyDefinition({ id: 'enemy_lane_7' });
    setupLaneBiasState([enemyDef]);
    getModifierRegistry().add({
      id: 'test-optimal-spawn-on-lane7',
      target: 'enemy_optimal_spawn_chance',
      op: 'set',
      value: 1,
      source: 'test',
      scope: { kind: 'global' },
    });
    getEnemyPreferredRangeDecisionMock.mockReturnValueOnce({ mode: 'flexible', targetRange: 7 });
    vi.spyOn(Math, 'random')
      .mockImplementationOnce(() => 0.0)
      .mockImplementationOnce(() => 0.2);

    startNextWave();

    const spawnedEnemy = getGameState().characters.find(c => !c.isPlayer);
    expect(spawnedEnemy).toBeDefined();
    expect(spawnedEnemy?.slotIndex).toBe(7);
  });

  it('uses 5% lane 6 chance for close-range intent', () => {
    const enemyDef = createEnemyDefinition({ id: 'enemy_lane_6' });
    setupLaneBiasState([enemyDef]);
    getModifierRegistry().add({
      id: 'test-optimal-spawn-on-lane6',
      target: 'enemy_optimal_spawn_chance',
      op: 'set',
      value: 1,
      source: 'test',
      scope: { kind: 'global' },
    });
    getEnemyPreferredRangeDecisionMock.mockReturnValueOnce({ mode: 'flexible', targetRange: 6 });
    vi.spyOn(Math, 'random')
      .mockImplementationOnce(() => 0.0)
      .mockImplementationOnce(() => 0.01);

    startNextWave();

    const spawnedEnemy = getGameState().characters.find(c => !c.isPlayer);
    expect(spawnedEnemy).toBeDefined();
    expect(spawnedEnemy?.slotIndex).toBe(6);
  });

  it('falls back to lanes 7/6 when a large enemy footprint blocks lane 8+', () => {
    const enemyDefs = [
      createEnemyDefinition({ id: 'enemy_big', slotSize: 4 }),
      createEnemyDefinition({ id: 'enemy_small', slotSize: 2 }),
    ];
    setupLaneBiasState(enemyDefs);
    getModifierRegistry().add({
      id: 'test-optimal-spawn-off-fallback',
      target: 'enemy_optimal_spawn_chance',
      op: 'set',
      value: 0,
      source: 'test',
      scope: { kind: 'global' },
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    startNextWave();

    const enemies = getGameState().characters.filter(c => !c.isPlayer);
    const bigEnemy = enemies.find(c => c.id === 'enemy_big');
    const smallEnemy = enemies.find(c => c.id === 'enemy_small');
    expect(bigEnemy?.slotIndex).toBe(8);
    expect(smallEnemy?.slotIndex).toBe(6);
  });

  it('keeps close-range enemies in 8+ outside lane 7/6 rolls', () => {
    const enemyDef = createEnemyDefinition({ id: 'enemy_close_default' });
    setupLaneBiasState([enemyDef]);
    getModifierRegistry().add({
      id: 'test-optimal-spawn-on-close-default',
      target: 'enemy_optimal_spawn_chance',
      op: 'set',
      value: 1,
      source: 'test',
      scope: { kind: 'global' },
    });
    getEnemyPreferredRangeDecisionMock.mockReturnValueOnce({ mode: 'forward_edge', targetRange: 6 });
    vi.spyOn(Math, 'random')
      .mockImplementationOnce(() => 0.0)
      .mockImplementationOnce(() => 0.9);

    startNextWave();

    const spawnedEnemy = getGameState().characters.find(c => !c.isPlayer);
    expect(spawnedEnemy).toBeDefined();
    expect((spawnedEnemy?.slotIndex ?? 0) >= 8).toBe(true);
  });

  it('keeps non-melee enemies grouped in 8+ by default', () => {
    const enemyDef = createEnemyDefinition({ id: 'enemy_backline' });
    setupLaneBiasState([enemyDef]);
    getModifierRegistry().add({
      id: 'test-optimal-spawn-on-backline',
      target: 'enemy_optimal_spawn_chance',
      op: 'set',
      value: 1,
      source: 'test',
      scope: { kind: 'global' },
    });
    getEnemyPreferredRangeDecisionMock.mockReturnValueOnce({ mode: 'max_optimal', targetRange: 10 });
    vi.spyOn(Math, 'random').mockImplementationOnce(() => 0.0);

    startNextWave();

    const spawnedEnemy = getGameState().characters.find(c => !c.isPlayer);
    expect(spawnedEnemy).toBeDefined();
    expect((spawnedEnemy?.slotIndex ?? 0) >= 8).toBe(true);
  });
});
