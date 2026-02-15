import { describe, it, expect, beforeEach } from 'vitest';
import { applyStatus, removeStatusStacks, hasStatus, getStatusStacks, processDoTs, decayStatusDurations } from '../../core/status.js';
import { resetGameState, createMockCharacter } from '../utils/test-helpers.js';
import { getTotalBlock } from '../../core/block.js';

describe('status', () => {
  beforeEach(() => {
    resetGameState();
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
      
      // Radiation should be rejected — block is still up
      expect(hasStatus(character, 'radiation')).toBe(false);
      expect(character.statuses).toHaveLength(0);
      // Block should be unchanged
      expect(getTotalBlock(character)).toBe(5);
    });

    it('should apply radiation when target has 0 block', () => {
      const character = createMockCharacter({
        statuses: [],
        blockLayers: []
      });
      
      applyStatus(character, 'radiation', 3);
      
      // Radiation should be applied — no block
      expect(hasStatus(character, 'radiation')).toBe(true);
      expect(getStatusStacks(character, 'radiation')).toBe(3);
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

  describe('processDoTs', () => {
    it('should apply bleed damage reduced by block', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [{ amount: 5, decay_percent: 20 }],
        statuses: [{ id: 'bleed', stacks: 3 }]
      });
      
      processDoTs(character);
      
      // 3 bleed damage, 5 block -> 0 damage to HP, 3 block used
      expect(character.hp).toBe(100);
      expect(getTotalBlock(character)).toBe(2);
    });

    it('should apply bleed damage when block is insufficient', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [{ amount: 2, decay_percent: 20 }],
        statuses: [{ id: 'bleed', stacks: 5 }]
      });
      
      processDoTs(character);
      
      // 5 bleed, 2 block -> 3 damage to HP
      expect(character.hp).toBe(97);
      expect(getTotalBlock(character)).toBe(0);
    });

    it('should apply shock damage reduced by block', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [{ amount: 4, decay_percent: 20 }],
        statuses: [{ id: 'shock', stacks: 6 }]
      });
      
      processDoTs(character);
      
      // 6 shock, 4 block -> 2 damage to HP
      expect(character.hp).toBe(98);
      expect(getTotalBlock(character)).toBe(0);
    });

    it('should apply radiation damage ignoring block and halve stacks', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [{ amount: 10, decay_percent: 20 }],
        statuses: [{ id: 'radiation', stacks: 5 }]
      });
      
      processDoTs(character);
      
      // 5 radiation, ignores block -> 5 damage to HP, block unchanged
      expect(character.hp).toBe(95);
      expect(getTotalBlock(character)).toBe(10);
      // Half-life decay: 5 -> ceil(5/2) = 3
      expect(getStatusStacks(character, 'radiation')).toBe(3);
    });

    it('should halve radiation from 8 to 4 stacks after tick', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [],
        statuses: [{ id: 'radiation', stacks: 8 }]
      });
      
      processDoTs(character);
      
      expect(character.hp).toBe(92); // 8 damage
      expect(getStatusStacks(character, 'radiation')).toBe(4); // 8 -> 4
    });

    it('should halve radiation from 3 to 2 stacks after tick (ceil)', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [],
        statuses: [{ id: 'radiation', stacks: 3 }]
      });
      
      processDoTs(character);
      
      expect(character.hp).toBe(97); // 3 damage
      expect(getStatusStacks(character, 'radiation')).toBe(2); // 3 -> ceil(3/2) = 2
    });

    it('should remove radiation after 1 stack ticks', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [],
        statuses: [{ id: 'radiation', stacks: 1 }]
      });
      
      processDoTs(character);
      
      expect(character.hp).toBe(99); // 1 damage
      expect(hasStatus(character, 'radiation')).toBe(false); // 1 stack -> deals damage then removed
    });

    it('should process multiple DoT statuses', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [{ amount: 10, decay_percent: 20 }],
        statuses: [
          { id: 'bleed', stacks: 3 },
          { id: 'shock', stacks: 2 },
          { id: 'radiation', stacks: 1 }
        ]
      });
      
      processDoTs(character);
      
      // 3 bleed + 2 shock = 5 total reduced by 10 block = 0, plus 1 radiation = 1 total damage
      expect(character.hp).toBe(99);
      // 1 stack radiation decays to 0 -> removed
      expect(hasStatus(character, 'radiation')).toBe(false);
    });

    it('should not reduce HP below 0', () => {
      const character = createMockCharacter({
        hp: 3,
        blockLayers: [],
        statuses: [{ id: 'bleed', stacks: 10 }]
      });
      
      processDoTs(character);
      
      expect(character.hp).toBe(0);
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

