import { describe, it, expect, beforeEach } from 'vitest';
import { applyStatus, removeStatusStacks, hasStatus, getStatusStacks, processStatusEffectsWithContext, processStatusEffects, decayStatusDurations } from '../../core/status.js';
import { resetGameState, createMockCharacter, setupGameState } from '../utils/test-helpers.js';
import { getTotalBlock } from '../../core/block.js';
import { getModifierRegistry } from '../../core/modifiers.js';
import { getGameState } from '../../core/gameState.js';
import type { StatusDefinition } from '../../core/types.js';

// ── Test status definitions (mirrors the YAML files) ─────────────────

const BLEED_DEF: StatusDefinition = {
  id: 'bleed', name: 'Bleed', description: '',
  cadence: 'round_start',
  dot: { damage_per_stack: 1, ignores_block: false },
  decay: { mode: 'none' },
};

const SHOCK_DEF: StatusDefinition = {
  id: 'shock', name: 'Shock', description: '',
  cadence: 'round_start',
  dot: { damage_per_stack: 1, ignores_block: false },
  decay: { mode: 'none' },
};

const RADIATION_DEF: StatusDefinition = {
  id: 'radiation', name: 'Radiation', description: '',
  cadence: 'round_start',
  dot: { damage_per_stack: 1, ignores_block: true },
  decay: { mode: 'half_life', round: 'ceil', min_remove: 1 },
  apply: { requires_zero_block: true },
};

const FORTIFY_DEF: StatusDefinition = {
  id: 'fortify', name: 'Fortify', description: '',
  cadence: 'round_start',
  dot: null,
  decay: { mode: 'none' },
};

const REGENERATION_DEF: StatusDefinition = {
  id: 'regeneration', name: 'Regeneration', description: '',
  cadence: 'round_start',
  dot: null,
  hot: { heal_per_stack: 1 },
  duration: 3,
  decay: { mode: 'none' },
};

const REGENERATION_DECAY_DEF: StatusDefinition = {
  id: 'regeneration_decay', name: 'Regeneration Decay', description: '',
  cadence: 'round_start',
  dot: null,
  hot: { heal_per_stack: 1 },
  decay: { mode: 'half_life', round: 'ceil', min_remove: 1 },
};

const ALL_STATUS_DEFS: Record<string, StatusDefinition> = {
  bleed: BLEED_DEF,
  shock: SHOCK_DEF,
  radiation: RADIATION_DEF,
  fortify: FORTIFY_DEF,
  regeneration: REGENERATION_DEF,
  regeneration_decay: REGENERATION_DECAY_DEF,
};

/** Set up game state with all status definitions loaded. */
function setupWithStatuses() {
  setupGameState({ statusLibrary: ALL_STATUS_DEFS });
}

describe('status', () => {
  beforeEach(() => {
    resetGameState();
    setupWithStatuses();
    getModifierRegistry().clearAll();
  });

  describe('applyStatus', () => {
    it('should add a new status to character', () => {
      const character = createMockCharacter({ statuses: [] });
      
      applyStatus(character, 'bleed', 1);
      
      expect(character.statuses).toHaveLength(1);
      expect(character.statuses[0].id).toBe('bleed');
      expect(character.statuses[0].stacks).toBe(1);
    });

    it('should stack existing status additively', () => {
      const character = createMockCharacter({
        statuses: [{ id: 'bleed', stacks: 2 }]
      });
      
      applyStatus(character, 'bleed', 3);
      
      expect(character.statuses).toHaveLength(1);
      expect(character.statuses[0].stacks).toBe(5);
    });

    it('should refresh duration when provided', () => {
      const character = createMockCharacter({
        statuses: [{ id: 'buff', stacks: 1, duration: 2 }]
      });
      
      applyStatus(character, 'buff', 1, 5);
      
      expect(character.statuses[0].duration).toBe(5);
    });

    it('should merge metadata', () => {
      const character = createMockCharacter({
        statuses: [{ id: 'buff', stacks: 1, metadata: { source: 'card1' } }]
      });
      
      applyStatus(character, 'buff', 1, undefined, { extra: 'data' });
      
      expect(character.statuses[0].metadata).toEqual({
        source: 'card1',
        extra: 'data'
      });
    });

    it('should handle multiple different statuses', () => {
      const character = createMockCharacter({ statuses: [] });
      
      applyStatus(character, 'bleed', 1);
      applyStatus(character, 'shock', 2);
      applyStatus(character, 'fortify', 1);
      
      expect(character.statuses).toHaveLength(3);
      expect(getStatusStacks(character, 'bleed')).toBe(1);
      expect(getStatusStacks(character, 'shock')).toBe(2);
      expect(getStatusStacks(character, 'fortify')).toBe(1);
    });

    it('should not apply radiation when target has block > 0', () => {
      const character = createMockCharacter({
        statuses: [],
        blockLayers: [{ amount: 5, decay_percent: 20 }]
      });
      
      applyStatus(character, 'radiation', 3);
      
      expect(hasStatus(character, 'radiation')).toBe(false);
      expect(character.statuses).toHaveLength(0);
      expect(getTotalBlock(character)).toBe(5);
    });

    it('should apply radiation when target has 0 block', () => {
      const character = createMockCharacter({
        statuses: [],
        blockLayers: []
      });
      
      applyStatus(character, 'radiation', 3);
      
      expect(hasStatus(character, 'radiation')).toBe(true);
      expect(getStatusStacks(character, 'radiation')).toBe(3);
    });

    it('should use default status duration from definition when not provided', () => {
      const character = createMockCharacter({ statuses: [] });

      applyStatus(character, 'regeneration', 2);

      expect(character.statuses).toHaveLength(1);
      expect(character.statuses[0].duration).toBe(3);
    });
  });

  describe('removeStatusStacks', () => {
    it('should reduce status stacks', () => {
      const character = createMockCharacter({
        statuses: [{ id: 'bleed', stacks: 5 }]
      });
      
      removeStatusStacks(character, 'bleed', 2);
      
      expect(getStatusStacks(character, 'bleed')).toBe(3);
    });

    it('should remove status when stacks reach 0', () => {
      const character = createMockCharacter({
        statuses: [{ id: 'bleed', stacks: 2 }]
      });
      
      removeStatusStacks(character, 'bleed', 2);
      
      expect(hasStatus(character, 'bleed')).toBe(false);
      expect(character.statuses).toHaveLength(0);
    });

    it('should not go below 0 stacks', () => {
      const character = createMockCharacter({
        statuses: [{ id: 'bleed', stacks: 2 }]
      });
      
      removeStatusStacks(character, 'bleed', 5);
      
      expect(hasStatus(character, 'bleed')).toBe(false);
    });

    it('should do nothing if status does not exist', () => {
      const character = createMockCharacter({ statuses: [] });
      
      removeStatusStacks(character, 'nonexistent', 1);
      
      expect(character.statuses).toHaveLength(0);
    });
  });

  describe('hasStatus', () => {
    it('should return true if character has status', () => {
      const character = createMockCharacter({
        statuses: [{ id: 'bleed', stacks: 1 }]
      });
      
      expect(hasStatus(character, 'bleed')).toBe(true);
    });

    it('should return false if character does not have status', () => {
      const character = createMockCharacter({ statuses: [] });
      
      expect(hasStatus(character, 'bleed')).toBe(false);
    });
  });

  describe('getStatusStacks', () => {
    it('should return stack count for existing status', () => {
      const character = createMockCharacter({
        statuses: [{ id: 'bleed', stacks: 3 }]
      });
      
      expect(getStatusStacks(character, 'bleed')).toBe(3);
    });

    it('should return 0 for non-existent status', () => {
      const character = createMockCharacter({ statuses: [] });
      
      expect(getStatusStacks(character, 'bleed')).toBe(0);
    });
  });

  describe('processStatusEffects — round_start', () => {
    it('should apply bleed damage reduced by block', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [{ amount: 5, decay_percent: 20 }],
        statuses: [{ id: 'bleed', stacks: 3 }]
      });
      
      processStatusEffects(character, 'round_start');
      
      expect(character.hp).toBe(100);
      expect(getTotalBlock(character)).toBe(2);
    });

    it('should apply bleed damage when block is insufficient', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [{ amount: 2, decay_percent: 20 }],
        statuses: [{ id: 'bleed', stacks: 5 }]
      });
      
      processStatusEffects(character, 'round_start');
      
      expect(character.hp).toBe(97);
      expect(getTotalBlock(character)).toBe(0);
    });

    it('should apply shock damage reduced by block', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [{ amount: 4, decay_percent: 20 }],
        statuses: [{ id: 'shock', stacks: 6 }]
      });
      
      processStatusEffects(character, 'round_start');
      
      expect(character.hp).toBe(98);
      expect(getTotalBlock(character)).toBe(0);
    });

    it('should tick radiation on round_start, ignoring block', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [{ amount: 10, decay_percent: 20 }],
        statuses: [{ id: 'radiation', stacks: 5 }]
      });
      
      processStatusEffects(character, 'round_start');
      
      expect(character.hp).toBe(95);
      expect(getTotalBlock(character)).toBe(10);
      // Half-life decay ceil: 5 -> ceil(5/2) = 3
      expect(getStatusStacks(character, 'radiation')).toBe(3);
    });

    it('should halve radiation from 8 to 4 stacks after tick', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [],
        statuses: [{ id: 'radiation', stacks: 8 }]
      });
      
      processStatusEffects(character, 'round_start');
      
      expect(character.hp).toBe(92);
      expect(getStatusStacks(character, 'radiation')).toBe(4);
    });

    it('should halve radiation from 3 to 2 stacks after tick (ceil)', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [],
        statuses: [{ id: 'radiation', stacks: 3 }]
      });
      
      processStatusEffects(character, 'round_start');
      
      expect(character.hp).toBe(97);
      expect(getStatusStacks(character, 'radiation')).toBe(2);
    });

    it('should remove radiation after 1 stack ticks', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [],
        statuses: [{ id: 'radiation', stacks: 1 }]
      });
      
      processStatusEffects(character, 'round_start');
      
      expect(character.hp).toBe(99);
      expect(hasStatus(character, 'radiation')).toBe(false);
    });

    it('should not reduce HP below 0', () => {
      const character = createMockCharacter({
        hp: 3,
        blockLayers: [],
        statuses: [{ id: 'bleed', stacks: 10 }]
      });
      
      processStatusEffects(character, 'round_start');
      
      expect(character.hp).toBe(0);
    });

    it('should apply regeneration healing by stacks', () => {
      const character = createMockCharacter({
        hp: 90,
        maxHp: 100,
        statuses: [{ id: 'regeneration', stacks: 4 }]
      });

      processStatusEffects(character, 'round_start');

      expect(character.hp).toBe(94);
    });

    it('should clamp regeneration healing to max HP', () => {
      const character = createMockCharacter({
        hp: 98,
        maxHp: 100,
        statuses: [{ id: 'regeneration', stacks: 5 }]
      });

      processStatusEffects(character, 'round_start');

      expect(character.hp).toBe(100);
    });

    it('should decay regeneration stacks using half_life config', () => {
      const character = createMockCharacter({
        hp: 90,
        maxHp: 100,
        statuses: [{ id: 'regeneration_decay', stacks: 5 }]
      });

      processStatusEffects(character, 'round_start');

      expect(character.hp).toBe(95);
      expect(getStatusStacks(character, 'regeneration_decay')).toBe(3);
    });

    it('should boost regeneration HoT when sourced from friendly caster with outgoing heal modifier', () => {
      const registry = getModifierRegistry();
      const source = createMockCharacter({
        id: 'ally_source',
        name: 'Ally Source',
        isPlayer: true,
      });
      const target = createMockCharacter({
        id: 'ally_target',
        name: 'Ally Target',
        hp: 80,
        maxHp: 100,
        isPlayer: true,
        statuses: [{ id: 'regeneration', stacks: 2, metadata: { sourceCharacterId: 'ally_source' } }],
      });

      setupGameState({
        characters: [source, target],
        statusLibrary: ALL_STATUS_DEFS,
      });
      registry.add({
        id: 'status-test-friendly-hot-add',
        target: 'friendly_heal_outgoing',
        op: 'add',
        value: 1,
        source: 'test',
        scope: { kind: 'character', characterId: 'ally_source' },
      });
      registry.add({
        id: 'status-test-friendly-hot-multiply',
        target: 'friendly_heal_outgoing',
        op: 'multiply',
        value: 2,
        source: 'test',
        scope: { kind: 'character', characterId: 'ally_source' },
      });

      processStatusEffectsWithContext(target, 'round_start', {
        resolveHotSourceCharacter: (_target, status) => {
          const sourceCharacterId = status.metadata?.sourceCharacterId;
          if (typeof sourceCharacterId !== 'string') return undefined;
          return getGameState().characters.find(c => c.id === sourceCharacterId);
        },
      });

      expect(target.hp).toBe(86); // base 2 -> (2 + 1) * 2 = 6
    });
  });

  describe('processStatusEffects — all statuses tick on round_start', () => {
    it('should process all statuses in a single round_start call', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [{ amount: 10, decay_percent: 20 }],
        statuses: [
          { id: 'bleed', stacks: 3 },
          { id: 'shock', stacks: 2 },
          { id: 'radiation', stacks: 4 }
        ]
      });
      
      // round_start: ALL statuses tick
      processStatusEffects(character, 'round_start');
      
      // bleed 3 + shock 2 = 5, absorbed by 10 block → 5 block left
      // radiation 4 ignores block → 4 HP damage
      expect(character.hp).toBe(96);
      expect(getTotalBlock(character)).toBe(5);
      expect(getStatusStacks(character, 'radiation')).toBe(2); // ceil(4/2) = 2
    });
  });

  describe('decayStatusDurations', () => {
    it('should reduce duration by 1', () => {
      const character = createMockCharacter({
        statuses: [{ id: 'buff', stacks: 1, duration: 3 }]
      });
      
      decayStatusDurations(character);
      
      expect(character.statuses[0].duration).toBe(2);
    });

    it('should remove status when duration reaches 0', () => {
      const character = createMockCharacter({
        statuses: [{ id: 'buff', stacks: 1, duration: 1 }]
      });
      
      decayStatusDurations(character);
      
      expect(character.statuses).toHaveLength(0);
    });

    it('should handle statuses without duration (permanent)', () => {
      const character = createMockCharacter({
        statuses: [{ id: 'permanent', stacks: 1 }]
      });
      
      decayStatusDurations(character);
      
      expect(character.statuses).toHaveLength(1);
      expect(character.statuses[0].duration).toBeUndefined();
    });

    it('should process multiple statuses independently', () => {
      const character = createMockCharacter({
        statuses: [
          { id: 'buff1', stacks: 1, duration: 3 },
          { id: 'buff2', stacks: 1, duration: 1 },
          { id: 'permanent', stacks: 1 }
        ]
      });
      
      decayStatusDurations(character);
      
      expect(character.statuses).toHaveLength(2);
      expect(character.statuses.find(s => s.id === 'buff1')?.duration).toBe(2);
      expect(character.statuses.find(s => s.id === 'buff2')).toBeUndefined();
      expect(character.statuses.find(s => s.id === 'permanent')).toBeDefined();
    });
  });
});
