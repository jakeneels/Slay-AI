import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getEnemyPreferredRangeForCardIds, processRoundStart } from '../../core/combat.js';
import { resetGameState, createMockCharacter, createMockCard, setupGameState } from '../utils/test-helpers.js';
import { getGameState } from '../../core/gameState.js';

describe('enemy pre-round range positioning', () => {
  beforeEach(() => {
    resetGameState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aggression 10 always chooses forward-edge behavior and presses forward', () => {
    const player = createMockCharacter({
      id: 'player',
      isPlayer: true,
      slotIndex: 0,
      hp: 100,
      energy: 0,
    });
    const enemy = createMockCharacter({
      id: 'enemy',
      isPlayer: false,
      slotIndex: 8,
      hp: 100,
      energy: 3,
      aggression: 10,
      deck: ['jab'],
    });
    const jab = createMockCard({
      id: 'jab',
      targeting: 'enemy',
      minRange: 1,
      maxRange: 1,
      rarity: 'common',
      effects: [{ kind: 'damage', amount: 5 }],
    });

    setupGameState({
      characters: [player, enemy],
      cardLibrary: { jab },
      currentPlayerId: 'player',
      turnQueue: ['player', 'enemy'],
      turnQueueIndex: 0,
      roundNumber: 0,
    });

    processRoundStart();

    expect(enemy.slotIndex).toBeLessThan(8);
  });

  it('aggression 0 always chooses max-optimal behavior and backs up when too close', () => {
    const player = createMockCharacter({
      id: 'player',
      isPlayer: true,
      slotIndex: 0,
      hp: 100,
      energy: 0,
    });
    const enemy = createMockCharacter({
      id: 'enemy',
      isPlayer: false,
      slotIndex: 7,
      hp: 100,
      energy: 3,
      aggression: 0,
      deck: ['sniper'],
    });
    const sniper = createMockCard({
      id: 'sniper',
      targeting: 'enemy',
      minRange: 10,
      maxRange: 11,
      optimalRange: 11,
      rarity: 'legendary',
      effects: [{ kind: 'damage', amount: 15 }],
    });

    setupGameState({
      characters: [player, enemy],
      cardLibrary: { sniper },
      currentPlayerId: 'player',
      turnQueue: ['player', 'enemy'],
      turnQueueIndex: 0,
      roundNumber: 0,
    });

    processRoundStart();

    expect(enemy.slotIndex).toBeGreaterThan(7);
  });

  it('aggression 5 can pick flexible mode (50%) and move toward the flexible band', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);

    const player = createMockCharacter({
      id: 'player',
      isPlayer: true,
      slotIndex: 0,
      hp: 100,
      energy: 0,
    });
    const enemy = createMockCharacter({
      id: 'enemy',
      isPlayer: false,
      slotIndex: 10,
      hp: 100,
      energy: 2,
      aggression: 5,
      // Two short common cards + one long legendary card => flexible favors short band.
      deck: ['short_a', 'short_b', 'long_legend'],
    });
    const shortA = createMockCard({
      id: 'short_a',
      targeting: 'enemy',
      minRange: 2,
      maxRange: 2,
      rarity: 'common',
      effects: [{ kind: 'damage', amount: 4 }],
    });
    const shortB = createMockCard({
      id: 'short_b',
      targeting: 'enemy',
      minRange: 2,
      maxRange: 2,
      rarity: 'common',
      effects: [{ kind: 'damage', amount: 4 }],
    });
    const longLegend = createMockCard({
      id: 'long_legend',
      targeting: 'enemy',
      minRange: 10,
      maxRange: 11,
      rarity: 'legendary',
      effects: [{ kind: 'damage', amount: 20 }],
    });

    setupGameState({
      characters: [player, enemy],
      cardLibrary: {
        short_a: shortA,
        short_b: shortB,
        long_legend: longLegend,
      },
      currentPlayerId: 'player',
      turnQueue: ['player', 'enemy'],
      turnQueueIndex: 0,
      roundNumber: 0,
    });

    processRoundStart();

    expect(enemy.slotIndex).toBeLessThan(10);
  });

  it('resolves lane preference conflicts by accepting suboptimal range (no swapping)', () => {
    const player = createMockCharacter({
      id: 'player',
      isPlayer: true,
      slotIndex: 0,
      hp: 100,
      energy: 0,
    });
    const blocker = createMockCharacter({
      id: 'blocker',
      isPlayer: false,
      slotIndex: 8,
      hp: 100,
      energy: 0,
      aggression: 0,
      deck: ['sniper_a'],
    });
    const pressured = createMockCharacter({
      id: 'pressured',
      isPlayer: false,
      slotIndex: 7,
      hp: 100,
      energy: 2,
      aggression: 0,
      deck: ['sniper_b'],
    });
    const sniperA = createMockCard({
      id: 'sniper_a',
      targeting: 'enemy',
      minRange: 10,
      maxRange: 11,
      optimalRange: 11,
      rarity: 'legendary',
      effects: [{ kind: 'damage', amount: 10 }],
    });
    const sniperB = createMockCard({
      id: 'sniper_b',
      targeting: 'enemy',
      minRange: 10,
      maxRange: 11,
      optimalRange: 11,
      rarity: 'legendary',
      effects: [{ kind: 'damage', amount: 10 }],
    });

    setupGameState({
      characters: [player, pressured, blocker],
      cardLibrary: { sniper_a: sniperA, sniper_b: sniperB },
      currentPlayerId: 'player',
      turnQueue: ['player', 'pressured', 'blocker'],
      turnQueueIndex: 0,
      roundNumber: 0,
      combatLog: [],
    });

    processRoundStart();

    expect(pressured.slotIndex).toBe(7);
    const hasSuboptimalLog = getGameState().combatLog.some(msg => msg.includes('suboptimal range'));
    expect(hasSuboptimalLog).toBe(false);
  });

  it('uses rarity weighting in preferred range calculation', () => {
    const common = createMockCard({
      id: 'common_short',
      targeting: 'enemy',
      minRange: 0,
      maxRange: 1,
      rarity: 'common',
      effects: [{ kind: 'damage', amount: 2 }],
    });
    const legendary = createMockCard({
      id: 'legendary_long',
      targeting: 'enemy',
      minRange: 10,
      maxRange: 12,
      rarity: 'legendary',
      effects: [{ kind: 'damage', amount: 20 }],
    });

    const preferredRange = getEnemyPreferredRangeForCardIds(
      ['common_short', 'legendary_long', 'legendary_long'],
      0,
      { common_short: common, legendary_long: legendary },
    );

    expect(preferredRange).toBeGreaterThanOrEqual(10);
  });

  it('aggression 0 prioritizes leaving hazardous lane', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const player = createMockCharacter({
      id: 'player',
      isPlayer: true,
      slotIndex: 0,
      hp: 100,
      energy: 0,
    });
    const enemy = createMockCharacter({
      id: 'enemy',
      isPlayer: false,
      slotIndex: 8,
      hp: 100,
      energy: 1,
      moveCharges: 1,
      aggression: 0,
      deck: ['hold_range'],
    });
    const holdRange = createMockCard({
      id: 'hold_range',
      targeting: 'enemy',
      minRange: 8,
      maxRange: 8,
      rarity: 'common',
      effects: [{ kind: 'damage', amount: 4 }],
    });

    setupGameState({
      characters: [player, enemy],
      cardLibrary: { hold_range: holdRange },
      laneHazards: [{ slotIndex: 8, damage: 6, remainingTurns: 2, ownerIsPlayer: true }],
      currentPlayerId: 'player',
      turnQueue: ['player', 'enemy'],
      turnQueueIndex: 0,
      roundNumber: 0,
    });

    processRoundStart();

    expect(enemy.slotIndex).not.toBe(8);
    const preRoundEntry = getGameState().enemyAiDebug.preRound.at(-1);
    expect(preRoundEntry?.hazardEscapePrioritized).toBe(true);
  });

  it('aggression 5 has strong bias to leave hazardous lane', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const player = createMockCharacter({
      id: 'player',
      isPlayer: true,
      slotIndex: 0,
      hp: 100,
      energy: 0,
    });
    const enemy = createMockCharacter({
      id: 'enemy',
      isPlayer: false,
      slotIndex: 8,
      hp: 100,
      energy: 1,
      moveCharges: 1,
      aggression: 5,
      deck: ['hold_range'],
    });
    const holdRange = createMockCard({
      id: 'hold_range',
      targeting: 'enemy',
      minRange: 8,
      maxRange: 8,
      rarity: 'common',
      effects: [{ kind: 'damage', amount: 4 }],
    });

    setupGameState({
      characters: [player, enemy],
      cardLibrary: { hold_range: holdRange },
      laneHazards: [{ slotIndex: 8, damage: 6, remainingTurns: 2, ownerIsPlayer: true }],
      currentPlayerId: 'player',
      turnQueue: ['player', 'enemy'],
      turnQueueIndex: 0,
      roundNumber: 0,
    });

    processRoundStart();

    expect(enemy.slotIndex).not.toBe(8);
    const preRoundEntry = getGameState().enemyAiDebug.preRound.at(-1);
    expect(preRoundEntry?.hazardEscapePrioritized).toBe(true);
  });

  it('aggression 10 rarely leaves hazardous lane and keeps aggressive positioning', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const player = createMockCharacter({
      id: 'player',
      isPlayer: true,
      slotIndex: 0,
      hp: 100,
      energy: 0,
    });
    const enemy = createMockCharacter({
      id: 'enemy',
      isPlayer: false,
      slotIndex: 8,
      hp: 100,
      energy: 1,
      moveCharges: 1,
      aggression: 10,
      deck: ['hold_range'],
    });
    const holdRange = createMockCard({
      id: 'hold_range',
      targeting: 'enemy',
      minRange: 8,
      maxRange: 8,
      rarity: 'common',
      effects: [{ kind: 'damage', amount: 4 }],
    });

    setupGameState({
      characters: [player, enemy],
      cardLibrary: { hold_range: holdRange },
      laneHazards: [{ slotIndex: 8, damage: 6, remainingTurns: 2, ownerIsPlayer: true }],
      currentPlayerId: 'player',
      turnQueue: ['player', 'enemy'],
      turnQueueIndex: 0,
      roundNumber: 0,
    });

    processRoundStart();

    expect(enemy.slotIndex).toBe(8);
    const preRoundEntry = getGameState().enemyAiDebug.preRound.at(-1);
    expect(preRoundEntry?.hazardEscapePrioritized).toBe(false);
  });
});
