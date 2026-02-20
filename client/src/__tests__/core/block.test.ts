import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTotalBlock,
  applyDamageWithBlock,
  grantBlockLayer,
  decayBlockLayers,
  getBlockDecaySchedule,
  getNextAvailableDecayOwnerTurnStart,
  getNextDecayOwnerTurnStart,
  processBlockDecayForTurnStart,
} from '../../core/block.js';
import { resetGameState, createMockCharacter } from '../utils/test-helpers.js';
import { getGameState } from '../../core/gameState.js';

describe('block', () => {
  beforeEach(() => {
    resetGameState();
  });

  describe('getTotalBlock', () => {
    it('should return 0 for character with no block', () => {
      const character = createMockCharacter({ blockLayers: [] });
      expect(getTotalBlock(character)).toBe(0);
    });

    it('should sum all block layers', () => {
      const character = createMockCharacter({
        blockLayers: [
          { amount: 10, baseAmount: 10, decay_percent: 20 },
          { amount: 5, baseAmount: 5, decay_percent: 20 },
          { amount: 3, baseAmount: 3, decay_percent: 20 }
        ]
      });
      expect(getTotalBlock(character)).toBe(18);
    });

    it('should handle single block layer', () => {
      const character = createMockCharacter({
        blockLayers: [{ amount: 15, baseAmount: 15, decay_percent: 20 }]
      });
      expect(getTotalBlock(character)).toBe(15);
    });
  });

  describe('applyDamageWithBlock', () => {
    it('should reduce block by damage amount', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [{ amount: 10, baseAmount: 10, decay_percent: 20 }]
      });
      
      const actualDamage = applyDamageWithBlock(character, 5);
      
      expect(getTotalBlock(character)).toBe(5);
      expect(character.hp).toBe(100);
      expect(actualDamage).toBe(0);
    });

    it('should apply excess damage to HP', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [{ amount: 10, baseAmount: 10, decay_percent: 20 }]
      });
      
      const actualDamage = applyDamageWithBlock(character, 15);
      
      expect(getTotalBlock(character)).toBe(0);
      expect(character.hp).toBe(95);
      // Returns actual damage dealt to HP (15 - 10 block = 5)
      expect(actualDamage).toBe(5);
    });

    it('should remove empty block layers', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [
          { amount: 5, baseAmount: 5, decay_percent: 20 },
          { amount: 3, baseAmount: 3, decay_percent: 20 }
        ]
      });
      
      applyDamageWithBlock(character, 8);
      
      expect(character.blockLayers).toHaveLength(0);
    });

    it('should process multiple block layers correctly', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [
          { amount: 5, baseAmount: 5, decay_percent: 20 },
          { amount: 3, baseAmount: 3, decay_percent: 20 },
          { amount: 2, baseAmount: 2, decay_percent: 20 }
        ]
      });
      
      const actualDamage = applyDamageWithBlock(character, 7);
      
      expect(getTotalBlock(character)).toBe(3);
      expect(character.blockLayers).toHaveLength(2);
      expect(character.hp).toBe(100);
      expect(actualDamage).toBe(0);
    });

    it('should handle damage exceeding all block', () => {
      const character = createMockCharacter({
        hp: 100,
        blockLayers: [
          { amount: 5, baseAmount: 5, decay_percent: 20 },
          { amount: 3, baseAmount: 3, decay_percent: 20 }
        ]
      });
      
      const actualDamage = applyDamageWithBlock(character, 15);
      
      expect(getTotalBlock(character)).toBe(0);
      // 15 damage - 8 block = 7 damage to HP, so HP = 100 - 7 = 93
      expect(character.hp).toBe(93);
      // Returns actual damage dealt to HP
      expect(actualDamage).toBe(7);
    });

    it('should not reduce HP below 0', () => {
      const character = createMockCharacter({
        hp: 5,
        blockLayers: []
      });
      
      const actualDamage = applyDamageWithBlock(character, 10);
      
      expect(character.hp).toBe(0);
      expect(actualDamage).toBe(10);
      
      // Damage again when at 0 HP
      const actualDamage2 = applyDamageWithBlock(character, 5);
      expect(character.hp).toBe(0);
      expect(actualDamage2).toBe(5);
    });
  });

  describe('grantBlockLayer', () => {
    it('should add a new block layer', () => {
      const character = createMockCharacter({ blockLayers: [] });
      
      grantBlockLayer(character, 10, 20);
      
      expect(character.blockLayers).toHaveLength(1);
      expect(character.blockLayers[0].amount).toBe(10);
      expect(character.blockLayers[0].decay_percent).toBe(20);
    });

    it('should add multiple block layers', () => {
      const character = createMockCharacter({ blockLayers: [] });
      
      grantBlockLayer(character, 10, 20);
      grantBlockLayer(character, 5, 15);
      
      expect(character.blockLayers).toHaveLength(2);
      expect(getTotalBlock(character)).toBe(15);
    });

    it('should use default decay percent if not provided', () => {
      const character = createMockCharacter({ blockLayers: [] });
      
      grantBlockLayer(character, 10);
      
      expect(character.blockLayers[0].decay_percent).toBe(50);
    });

    it('should store baseAmount when granting block', () => {
      const character = createMockCharacter({ blockLayers: [] });
      
      grantBlockLayer(character, 12, 20);
      
      expect(character.blockLayers[0].amount).toBe(12);
      expect(character.blockLayers[0].baseAmount).toBe(12);
      expect(character.blockLayers[0].decay_percent).toBe(20);
    });

    it('should preserve baseAmount after damage reduces amount', () => {
      const character = createMockCharacter({ blockLayers: [] });
      
      grantBlockLayer(character, 12, 20);
      applyDamageWithBlock(character, 5);
      
      // Amount should be reduced but baseAmount should remain
      expect(character.blockLayers[0].amount).toBe(7);
      expect(character.blockLayers[0].baseAmount).toBe(12);
    });

    it('should store source if provided', () => {
      const character = createMockCharacter({ blockLayers: [] });
      
      grantBlockLayer(character, 10, 20, 'defend_card');
      
      expect(character.blockLayers[0].source).toBe('defend_card');
    });
  });

  describe('decayBlockLayers', () => {
    it('should decay block layers by decay percent using BASE amount', () => {
      const character = createMockCharacter({
        blockLayers: [{ 
          amount: 100, 
          baseAmount: 100, // Original amount
          decay_percent: 20 
        }]
      });
      
      decayBlockLayers(character);
      
      // Decay is based on baseAmount: 100 * 20% = 20, ceil = 20
      expect(character.blockLayers[0].amount).toBe(80);
      expect(character.blockLayers[0].baseAmount).toBe(100); // baseAmount unchanged
    });

    it('should decay based on baseAmount, not remaining amount', () => {
      const character = createMockCharacter({
        blockLayers: [{ 
          amount: 80, // Reduced by damage
          baseAmount: 100, // Original amount
          decay_percent: 20 
        }]
      });
      
      decayBlockLayers(character);
      
      // Decay should be based on baseAmount (100), not remaining (80)
      // 100 * 20% = 20, so 80 - 20 = 60
      expect(character.blockLayers[0].amount).toBe(60);
      expect(character.blockLayers[0].baseAmount).toBe(100);
    });

    it('should decay consistently over multiple turns using baseAmount', () => {
      const character = createMockCharacter({
        blockLayers: [{ 
          amount: 12, 
          baseAmount: 12,
          decay_percent: 50 
        }]
      });
      
      // Turn 1: decay by ceil(12 * 0.50) = 6, leaving 6
      decayBlockLayers(character);
      expect(character.blockLayers[0].amount).toBe(6);
      expect(character.blockLayers[0].baseAmount).toBe(12);
      
      // Turn 2: decay by ceil(12 * 0.50) = 6, leaving 0 (but should be removed)
      decayBlockLayers(character);
      // Layer should be removed since amount reaches 0
      expect(character.blockLayers.length).toBe(0);
    });

    it('should decay multiple layers independently using their baseAmounts', () => {
      const character = createMockCharacter({
        blockLayers: [
          { amount: 100, baseAmount: 100, decay_percent: 20 },
          { amount: 50, baseAmount: 50, decay_percent: 10 },
          { amount: 30, baseAmount: 30, decay_percent: 30 }
        ]
      });
      
      decayBlockLayers(character);
      
      // Layer 1: 100 * 20% = 20, ceil = 20, so 100 - 20 = 80
      expect(character.blockLayers[0].amount).toBe(80);
      expect(character.blockLayers[0].baseAmount).toBe(100);
      
      // Layer 2: 50 * 10% = 5, ceil = 5, so 50 - 5 = 45
      expect(character.blockLayers[1].amount).toBe(45);
      expect(character.blockLayers[1].baseAmount).toBe(50);
      
      // Layer 3: 30 * 30% = 9, ceil = 9, so 30 - 9 = 21
      expect(character.blockLayers[2].amount).toBe(21);
      expect(character.blockLayers[2].baseAmount).toBe(30);
    });

    it('should remove layers that decay to 0', () => {
      const character = createMockCharacter({
        blockLayers: [{ amount: 1, baseAmount: 1, decay_percent: 100 }]
      });
      
      decayBlockLayers(character);
      
      expect(character.blockLayers).toHaveLength(0);
    });

    // This test is duplicated - removing since we have "should decay multiple layers independently using their baseAmounts" above

    it('should use minimum decay floor with fortify', () => {
      const character = createMockCharacter({
        blockLayers: [{ 
          amount: 100, 
          baseAmount: 100,
          decay_percent: 20 
        }],
        statuses: [{ id: 'fortify', stacks: 15 }] // 15 * 10% = 150% reduction, but floor at 10%
      });
      
      decayBlockLayers(character);
      
      // Should decay by minimum 10% of baseAmount (100 * 10% = 10, ceil = 10)
      expect(character.blockLayers[0].amount).toBe(90);
      expect(character.blockLayers[0].baseAmount).toBe(100);
    });

    it('should handle decay correctly with fortify reducing decay', () => {
      const character = createMockCharacter({
        blockLayers: [{ 
          amount: 100, 
          baseAmount: 100,
          decay_percent: 30 
        }],
        statuses: [{ id: 'fortify', stacks: 1 }] // Reduces decay by 10%
      });
      
      decayBlockLayers(character);
      
      // 30% - 10% = 20% effective decay, based on baseAmount: 100 * 20% = 20
      expect(character.blockLayers[0].amount).toBe(80);
      expect(character.blockLayers[0].baseAmount).toBe(100);
    });

    it('should use baseAmount for fortify calculations even after damage', () => {
      const character = createMockCharacter({
        blockLayers: [{ 
          amount: 80, // Reduced by damage
          baseAmount: 100, // Original amount
          decay_percent: 30 
        }],
        statuses: [{ id: 'fortify', stacks: 1 }] // Reduces decay by 10%
      });
      
      decayBlockLayers(character);
      
      // Decay should be based on baseAmount: 100 * (30% - 10%) = 100 * 20% = 20
      // So 80 - 20 = 60
      expect(character.blockLayers[0].amount).toBe(60);
      expect(character.blockLayers[0].baseAmount).toBe(100);
    });

    it('should do nothing if character has no block layers', () => {
      const character = createMockCharacter({ blockLayers: [] });
      
      decayBlockLayers(character);
      
      expect(character.blockLayers).toEqual([]);
    });

    it('should use ceil for decay amount based on baseAmount', () => {
      const character = createMockCharacter({
        blockLayers: [{ 
          amount: 33, 
          baseAmount: 33,
          decay_percent: 10 
        }] // baseAmount: 33 * 10% = 3.3, ceil = 4
      });
      
      decayBlockLayers(character);
      
      // 33 - 4 = 29
      expect(character.blockLayers[0].amount).toBe(29);
      expect(character.blockLayers[0].baseAmount).toBe(33);
    });

    it('should handle ceil correctly with reduced amount', () => {
      const character = createMockCharacter({
        blockLayers: [{ 
          amount: 25, // Reduced from original
          baseAmount: 33, // Original amount
          decay_percent: 10 
        }]
      });
      
      decayBlockLayers(character);
      
      // Decay based on baseAmount: ceil(33 * 10%) = ceil(3.3) = 4
      // So 25 - 4 = 21
      expect(character.blockLayers[0].amount).toBe(21);
      expect(character.blockLayers[0].baseAmount).toBe(33);
    });
  });

  describe('owner-turn decay scheduling', () => {
    it('computes independent upcoming decay times per layer', () => {
      const ally = createMockCharacter({ id: 'ally', name: 'Ally', isPlayer: true });
      const enemy = createMockCharacter({
        id: 'enemy',
        name: 'Enemy',
        isPlayer: false,
        blockLayers: [
          {
            amount: 10,
            baseAmount: 10,
            decay_percent: 50,
            source: 'shield_dome',
            sourceLabel: 'Shield Dome',
            decayOwnerId: 'enemy',
            nextDecayOwnerTurnStart: 3,
          },
          {
            amount: 6,
            baseAmount: 6,
            decay_percent: 50,
            source: 'heat_sink',
            sourceLabel: 'Heat Sink',
            decayOwnerId: 'enemy',
            nextDecayOwnerTurnStart: 4,
          },
        ],
      });
      const support = createMockCharacter({ id: 'support', name: 'Support', isPlayer: true });
      const gameState = getGameState();
      gameState.characters = [ally, enemy, support];
      gameState.turnQueue = ['ally', 'enemy', 'support'];
      gameState.turnQueueIndex = 0; // Ally is currently active
      gameState.turnStartsByCharacterId = { enemy: 2 };

      const schedule = getBlockDecaySchedule(enemy, gameState);
      expect(schedule[0].turnsUntilDecay).toBe(1);
      expect(schedule[1].turnsUntilDecay).toBe(4);
    });

    it('decays only when the owner starts a turn', () => {
      const ally = createMockCharacter({ id: 'ally', name: 'Ally', isPlayer: true });
      const enemy = createMockCharacter({ id: 'enemy', name: 'Enemy', isPlayer: false, blockLayers: [] });
      const gameState = getGameState();
      gameState.characters = [ally, enemy];
      gameState.turnQueue = ['ally', 'enemy'];
      gameState.turnQueueIndex = 0;
      gameState.turnStartsByCharacterId = {};

      grantBlockLayer(enemy, 10, 50, 'shield_dome', {
        decayOwnerId: enemy.id,
        sourceLabel: 'Shield Dome',
        nextDecayOwnerTurnStart: getNextDecayOwnerTurnStart(gameState, enemy.id),
      });

      processBlockDecayForTurnStart(ally, gameState);
      expect(enemy.blockLayers[0].amount).toBe(10);

      processBlockDecayForTurnStart(enemy, gameState);
      expect(enemy.blockLayers[0].amount).toBe(5);
      expect(enemy.blockLayers[0].nextDecayOwnerTurnStart).toBe(2);
    });

    it('schedules repeated block grants to distinct owner turns', () => {
      const enemy = createMockCharacter({ id: 'enemy', name: 'Enemy', isPlayer: false, blockLayers: [] });
      const gameState = getGameState();
      gameState.characters = [enemy];
      gameState.turnStartsByCharacterId = {};

      const firstDecayTurn = getNextAvailableDecayOwnerTurnStart(enemy, gameState, enemy.id);
      grantBlockLayer(enemy, 8, 100, 'shield_dome', {
        decayOwnerId: enemy.id,
        sourceLabel: 'Shield Dome',
        nextDecayOwnerTurnStart: firstDecayTurn,
      });

      const secondDecayTurn = getNextAvailableDecayOwnerTurnStart(enemy, gameState, enemy.id);
      grantBlockLayer(enemy, 8, 100, 'shield_dome', {
        decayOwnerId: enemy.id,
        sourceLabel: 'Shield Dome',
        nextDecayOwnerTurnStart: secondDecayTurn,
      });

      expect(firstDecayTurn).toBe(1);
      expect(secondDecayTurn).toBe(2);
      expect(enemy.blockLayers[0].nextDecayOwnerTurnStart).toBe(1);
      expect(enemy.blockLayers[1].nextDecayOwnerTurnStart).toBe(2);
    });

    it('decays stacked layers one owner turn at a time when scheduled distinctly', () => {
      const enemy = createMockCharacter({ id: 'enemy', name: 'Enemy', isPlayer: false, blockLayers: [] });
      const gameState = getGameState();
      gameState.characters = [enemy];
      gameState.turnStartsByCharacterId = {};

      grantBlockLayer(enemy, 8, 100, 'shield_dome', {
        decayOwnerId: enemy.id,
        sourceLabel: 'Shield Dome',
        nextDecayOwnerTurnStart: 1,
      });
      grantBlockLayer(enemy, 8, 100, 'shield_dome', {
        decayOwnerId: enemy.id,
        sourceLabel: 'Shield Dome',
        nextDecayOwnerTurnStart: 2,
      });

      processBlockDecayForTurnStart(enemy, gameState);
      expect(enemy.blockLayers).toHaveLength(1);
      expect(enemy.blockLayers[0].amount).toBe(8);
      expect(enemy.blockLayers[0].nextDecayOwnerTurnStart).toBe(2);

      processBlockDecayForTurnStart(enemy, gameState);
      expect(enemy.blockLayers).toHaveLength(0);
    });
  });
});

