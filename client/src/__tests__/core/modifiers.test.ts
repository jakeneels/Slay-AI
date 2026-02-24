import { beforeEach, describe, expect, it } from 'vitest';
import { ModifierRegistry } from '../../core/modifiers.js';
import { createMockCard, createMockCharacter } from '../utils/test-helpers.js';

describe('ModifierRegistry', () => {
  let registry: ModifierRegistry;

  beforeEach(() => {
    registry = new ModifierRegistry();
  });

  it('applies operations in set -> add -> multiply -> min -> max order', () => {
    registry.add({
      id: 'set',
      target: 'damage_dealt',
      op: 'set',
      value: 10,
      source: 'test',
      scope: { kind: 'global' },
      priority: 0,
    });
    registry.add({
      id: 'add',
      target: 'damage_dealt',
      op: 'add',
      value: 5,
      source: 'test',
      scope: { kind: 'global' },
    });
    registry.add({
      id: 'multiply',
      target: 'damage_dealt',
      op: 'multiply',
      value: 2,
      source: 'test',
      scope: { kind: 'global' },
    });
    registry.add({
      id: 'min',
      target: 'damage_dealt',
      op: 'min',
      value: 40,
      source: 'test',
      scope: { kind: 'global' },
    });
    registry.add({
      id: 'max',
      target: 'damage_dealt',
      op: 'max',
      value: 43,
      source: 'test',
      scope: { kind: 'global' },
    });

    expect(registry.resolve('damage_dealt', 1)).toBe(40);
  });

  it('uses priority for set (last set wins after sort)', () => {
    registry.add({
      id: 'set-high-priority',
      target: 'maxEnergy',
      op: 'set',
      value: 7,
      source: 'test',
      scope: { kind: 'global' },
      priority: 50,
    });
    registry.add({
      id: 'set-low-priority',
      target: 'maxEnergy',
      op: 'set',
      value: 4,
      source: 'test',
      scope: { kind: 'global' },
      priority: 1,
    });

    expect(registry.resolve('maxEnergy', 3)).toBe(7);
  });

  it('supports character and team scoping', () => {
    const player = createMockCharacter({ id: 'player_a', isPlayer: true });
    const enemy = createMockCharacter({ id: 'enemy_a', isPlayer: false });

    registry.add({
      id: 'player-team',
      target: 'card_draw',
      op: 'add',
      value: 2,
      source: 'test',
      scope: { kind: 'team', team: 'player' },
    });
    registry.add({
      id: 'specific-enemy',
      target: 'card_draw',
      op: 'add',
      value: 5,
      source: 'test',
      scope: { kind: 'character', characterId: 'enemy_a' },
    });

    expect(registry.resolve('card_draw', 1, { character: player })).toBe(3);
    expect(registry.resolve('card_draw', 1, { character: enemy })).toBe(6);
  });

  it('supports card-based conditions', () => {
    const attackCard = createMockCard({ type: 'attack', tags: ['melee'] });
    const skillCard = createMockCard({ type: 'skill', tags: ['utility'] });

    registry.add({
      id: 'attack-only',
      target: 'damage_dealt',
      op: 'multiply',
      value: 2,
      source: 'test',
      scope: { kind: 'global' },
      condition: { cardType: 'attack' },
    });
    registry.add({
      id: 'melee-only',
      target: 'damage_dealt',
      op: 'add',
      value: 3,
      source: 'test',
      scope: { kind: 'global' },
      condition: { cardTag: 'melee' },
    });

    expect(registry.resolve('damage_dealt', 5, { card: attackCard })).toBe(16);
    expect(registry.resolve('damage_dealt', 5, { card: skillCard })).toBe(5);
  });

  it('clearSource removes only matching source modifiers', () => {
    registry.add({
      id: 'a',
      target: 'damage_dealt',
      op: 'add',
      value: 2,
      source: 'balance',
      scope: { kind: 'global' },
    });
    registry.add({
      id: 'b',
      target: 'damage_dealt',
      op: 'add',
      value: 5,
      source: 'devpanel',
      scope: { kind: 'global' },
    });

    registry.clearSource('balance');

    expect(registry.resolve('damage_dealt', 1)).toBe(6);
    expect(registry.has('a')).toBe(false);
    expect(registry.has('b')).toBe(true);
  });

  it('normalizes incoming-heal aliases to heal_amount', () => {
    registry.add({
      id: 'incoming-heal-alias',
      target: 'friendly_heal_in',
      op: 'multiply',
      value: 1.5,
      source: 'test',
      scope: { kind: 'global' },
    });

    expect(registry.resolve('heal_amount', 10)).toBe(15);
    expect(registry.resolve('friendly_heal_incoming', 10)).toBe(15);
  });

  it('normalizes outgoing-heal aliases to friendly_heal_outgoing', () => {
    registry.add({
      id: 'outgoing-heal-alias',
      target: 'friendly_heal_out',
      op: 'multiply',
      value: 1.25,
      source: 'test',
      scope: { kind: 'global' },
    });

    expect(registry.resolve('friendly_heal_outgoing', 8)).toBe(10);
  });
});
