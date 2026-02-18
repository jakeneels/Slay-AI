import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Application } from 'pixi.js';
import { playCard, setApp } from '../../core/combat.js';
import { createCardInstance } from '../../core/card.js';
import { createMockCard, createMockCharacter, resetGameState, setupGameState } from '../utils/test-helpers.js';
import { getStatusStacks } from '../../core/status.js';

vi.mock('../../../animations.js', () => ({
  playDamageAnimation: vi.fn().mockResolvedValue(undefined),
  playHealAnimation: vi.fn().mockResolvedValue(undefined),
  animateCharachterSpark: vi.fn().mockResolvedValue(undefined),
  animateDamageFlash: vi.fn().mockResolvedValue(undefined),
  animateEnhancedScreenShake: vi.fn().mockResolvedValue(undefined),
  animateCameraZoom: vi.fn().mockResolvedValue(undefined),
  animateParticles: vi.fn().mockResolvedValue(undefined),
  setCharacterFacing: vi.fn(),
  registerCharacterSprite: vi.fn(),
}));

const createMockApp = (): Application => {
  return {
    stage: {
      addChild: vi.fn(),
      removeChild: vi.fn(),
      removeChildren: vi.fn(),
      x: 0,
      y: 0,
      eventMode: 'static',
    },
  } as unknown as Application;
};

describe('status_spread', () => {
  beforeEach(() => {
    resetGameState();
    setApp(createMockApp());
  });

  it('defaults to 1-slot same-side spread', async () => {
    const player = createMockCharacter({ id: 'player1', isPlayer: true, slotIndex: 0, energy: 3 });
    const sourceEnemy = createMockCharacter({
      id: 'enemy_source',
      isPlayer: false,
      slotIndex: 3,
      statuses: [{ id: 'radiation', stacks: 10 }],
    });
    const enemyLeft = createMockCharacter({ id: 'enemy_left', isPlayer: false, slotIndex: 2, statuses: [] });
    const enemyRight = createMockCharacter({ id: 'enemy_right', isPlayer: false, slotIndex: 4, statuses: [] });
    const enemyFar = createMockCharacter({ id: 'enemy_far', isPlayer: false, slotIndex: 5, statuses: [] });
    const allyNear = createMockCharacter({ id: 'ally_near', isPlayer: true, slotIndex: 2, statuses: [] });

    const spreadCard = createMockCard({
      id: 'spread_default',
      name: 'Spread Default',
      cost: { energy: 1 },
      targeting: 'enemy',
      effects: [
        { kind: 'status_spread', status: 'radiation', fraction: 0.5, round: 'floor', amount: 0 },
      ],
    });

    setupGameState({
      characters: [player, sourceEnemy, enemyLeft, enemyRight, enemyFar, allyNear],
      cardLibrary: { spread_default: spreadCard },
      currentPlayerId: 'player1',
    });

    const instanceId = createCardInstance('spread_default');
    player.hand.push(instanceId!);

    await playCard(instanceId!, 'enemy_source');

    expect(getStatusStacks(enemyLeft, 'radiation')).toBe(5);
    expect(getStatusStacks(enemyRight, 'radiation')).toBe(5);
    expect(getStatusStacks(enemyFar, 'radiation')).toBe(0);
    expect(getStatusStacks(allyNear, 'radiation')).toBe(0);
  });

  it('uses configured spreadRange for farther targets', async () => {
    const player = createMockCharacter({ id: 'player1', isPlayer: true, slotIndex: 0, energy: 3 });
    const sourceEnemy = createMockCharacter({
      id: 'enemy_source',
      isPlayer: false,
      slotIndex: 3,
      statuses: [{ id: 'radiation', stacks: 10 }],
    });
    const enemyFar = createMockCharacter({ id: 'enemy_far', isPlayer: false, slotIndex: 5, statuses: [] });

    const spreadCard = createMockCard({
      id: 'spread_range2',
      name: 'Spread Range 2',
      cost: { energy: 1 },
      targeting: 'enemy',
      effects: [
        {
          kind: 'status_spread',
          status: 'radiation',
          fraction: 0.5,
          round: 'floor',
          spreadRange: 2,
          amount: 0,
        },
      ],
    });

    setupGameState({
      characters: [player, sourceEnemy, enemyFar],
      cardLibrary: { spread_range2: spreadCard },
      currentPlayerId: 'player1',
    });

    const instanceId = createCardInstance('spread_range2');
    player.hand.push(instanceId!);

    await playCard(instanceId!, 'enemy_source');

    expect(getStatusStacks(enemyFar, 'radiation')).toBe(5);
  });

  it('supports spreadSide: opposing', async () => {
    const player = createMockCharacter({ id: 'player1', isPlayer: true, slotIndex: 0, energy: 3 });
    const allyNearTarget = createMockCharacter({ id: 'ally_near_target', isPlayer: true, slotIndex: 2, statuses: [] });
    const sourceEnemy = createMockCharacter({
      id: 'enemy_source',
      isPlayer: false,
      slotIndex: 3,
      statuses: [{ id: 'radiation', stacks: 8 }],
    });
    const enemyNear = createMockCharacter({ id: 'enemy_near', isPlayer: false, slotIndex: 4, statuses: [] });

    const spreadCard = createMockCard({
      id: 'spread_opposing',
      name: 'Spread Opposing',
      cost: { energy: 1 },
      targeting: 'enemy',
      effects: [
        {
          kind: 'status_spread',
          status: 'radiation',
          fraction: 0.5,
          round: 'floor',
          spreadRange: 2,
          spreadSide: 'opposing',
          amount: 0,
        },
      ],
    });

    setupGameState({
      characters: [player, allyNearTarget, sourceEnemy, enemyNear],
      cardLibrary: { spread_opposing: spreadCard },
      currentPlayerId: 'player1',
    });

    const instanceId = createCardInstance('spread_opposing');
    player.hand.push(instanceId!);

    await playCard(instanceId!, 'enemy_source');

    expect(getStatusStacks(allyNearTarget, 'radiation')).toBe(4);
    expect(getStatusStacks(enemyNear, 'radiation')).toBe(0);
  });
});
