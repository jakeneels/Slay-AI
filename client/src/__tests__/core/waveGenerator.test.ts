import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeDifficulty, generateWave } from '../../core/waveGenerator.js';
import { getModifierRegistry } from '../../core/modifiers.js';
import type { Card, CharacterDefinition } from '../../core/types.js';

vi.mock('../../utils/shuffle.js', () => ({
  shuffleArray: <T>(arr: T[]) => [...arr],
}));

function createEnemyDef(
  id: string,
  overrides: Partial<CharacterDefinition> = {},
): CharacterDefinition {
  return {
    id,
    name: id,
    hp: 40,
    maxHp: 40,
    energy: 2,
    maxEnergy: 2,
    deck: [],
    discardPile: [],
    hand: [],
    drawCount: 3,
    maxHandSize: 5,
    blockLayers: [],
    statuses: [],
    isPlayer: false,
    slotIndex: 8,
    slotSize: 1,
    speed: 1,
    moveCharges: 0,
    suppression: 0,
    suppressionResist: 0,
    aggression: 5,
    gear: { weapon: null, armor: null, accessory: null },
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
    ...overrides,
  };
}

describe('waveGenerator', () => {
  beforeEach(() => {
    getModifierRegistry().clearAll();
    vi.restoreAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('computeDifficulty includes rarity contribution with card copies', () => {
    const def = createEnemyDef('elite', {
      stats: { hp: 40, maxHp: 80, energy: 2, maxEnergy: 4, speed: 2, suppression: 1, suppressionResist: 0, aggression: 6 },
      startingDeck: ['epic_card', 'legendary_card'],
    });
    const cards: Record<string, Card> = {
      epic_card: {
        id: 'epic_card',
        name: 'Epic',
        cost: { energy: 1 },
        effects: [{ kind: 'damage', amount: 4 }],
        targetSide: 'enemy',
        targeting: 'enemy',
        rarity: 'epic',
        copies: 2,
      },
      legendary_card: {
        id: 'legendary_card',
        name: 'Legendary',
        cost: { energy: 1 },
        effects: [{ kind: 'damage', amount: 6 }],
        targetSide: 'enemy',
        targeting: 'enemy',
        rarity: 'legendary',
      },
    };

    expect(computeDifficulty(def, cards)).toBeCloseTo(74.2, 5);
  });

  it('filters secret enemy by default', () => {
    const enemies = [
      createEnemyDef('grunt_a'),
      createEnemyDef('grunt_b'),
      createEnemyDef('actual_kyle'),
    ];

    const wave = generateWave(1, enemies);

    expect(wave.some(e => e.id === 'actual_kyle')).toBe(false);
  });

  it('forces actual_kyle in wave 1 when dev toggle is enabled', () => {
    getModifierRegistry().add({
      id: 'acs-kyle-wave1',
      target: 'acs_kyle_wave1',
      op: 'set',
      value: 1,
      source: 'test',
      scope: { kind: 'global' },
    });
    const enemies = [
      createEnemyDef('grunt_a'),
      createEnemyDef('grunt_b'),
      createEnemyDef('actual_kyle'),
    ];

    const wave = generateWave(1, enemies);

    expect(wave.some(e => e.id === 'actual_kyle')).toBe(true);
  });

  it('uses modifier-overridden min and max enemy counts', () => {
    getModifierRegistry().add({
      id: 'min-1',
      target: 'wave_min_enemies',
      op: 'set',
      value: 1,
      source: 'test',
      scope: { kind: 'global' },
    });
    getModifierRegistry().add({
      id: 'max-1',
      target: 'wave_max_enemies',
      op: 'set',
      value: 1,
      source: 'test',
      scope: { kind: 'global' },
    });
    const enemies = [
      createEnemyDef('grunt_a'),
      createEnemyDef('grunt_b'),
      createEnemyDef('grunt_c'),
    ];

    const wave = generateWave(3, enemies);

    expect(wave).toHaveLength(1);
  });

  it('returns empty when only secret enemy exists and toggle is disabled', () => {
    const wave = generateWave(1, [createEnemyDef('actual_kyle')]);
    expect(wave).toEqual([]);
  });
});
