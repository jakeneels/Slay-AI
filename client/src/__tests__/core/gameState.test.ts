import { describe, it, expect, beforeEach } from 'vitest';
import { getGameState, setGameState, addToCombatLog, getCombatLog, setSelectedCardId, getSelectedCardId } from '../../core/gameState.js';
import { resetGameState } from '../utils/test-helpers.js';

describe('gameState', () => {
  beforeEach(() => {
    resetGameState();
  });

  describe('getGameState', () => {
    it('should return the current game state', () => {
      const state = getGameState();
      expect(state).toBeDefined();
      expect(state.characters).toEqual([]);
      expect(state.cardLibrary).toEqual({});
      expect(state.combatLog).toEqual([]);
    });
  });

  describe('setGameState', () => {
    it('should update the game state', () => {
      const newState = {
        characters: [],
        cardLibrary: { test: { id: 'test', name: 'Test', cost: { energy: 1 }, effects: [], targetSide: 'enemy', targeting: 'enemy' } },
        characterLibrary: {},
        cardInstances: {},
        selectedCardId: 'test_card',
        currentPlayerId: 'player1',
        turnIndex: 5,
        combatLog: ['Test log'],
        isProcessingTurn: false,
        nextCardInstanceId: 10,
        stats: { cumulativeDamage: 100, maxDamage: 50 }
      };
      
      setGameState(newState);
      const state = getGameState();
      
      expect(state.selectedCardId).toBe('test_card');
      expect(state.currentPlayerId).toBe('player1');
      expect(state.turnIndex).toBe(5);
      expect(state.combatLog).toEqual(['Test log']);
    });
  });

  describe('addToCombatLog', () => {
    it('should add messages to combat log', () => {
      addToCombatLog('Test message 1');
      addToCombatLog('Test message 2');
      
      const log = getCombatLog();
      expect(log).toHaveLength(2);
      expect(log[0]).toBe('Test message 1');
      expect(log[1]).toBe('Test message 2');
    });

    it('should append to existing log', () => {
      const state = getGameState();
      state.combatLog = ['Existing message'];
      
      addToCombatLog('New message');
      
      const log = getCombatLog();
      expect(log).toHaveLength(2);
      expect(log[0]).toBe('Existing message');
      expect(log[1]).toBe('New message');
    });
  });

  describe('getCombatLog', () => {
    it('should return the combat log array', () => {
      const state = getGameState();
      state.combatLog = ['Message 1', 'Message 2'];
      
      const log = getCombatLog();
      expect(log).toEqual(['Message 1', 'Message 2']);
    });

    it('should return empty array if log is empty', () => {
      const log = getCombatLog();
      expect(log).toEqual([]);
    });
  });

  describe('setSelectedCardId / getSelectedCardId', () => {
    it('should set and get selected card ID', () => {
      setSelectedCardId('card_123');
      expect(getSelectedCardId()).toBe('card_123');
    });

    it('should allow setting null', () => {
      setSelectedCardId('card_123');
      setSelectedCardId(null);
      expect(getSelectedCardId()).toBeNull();
    });

    it('should return null when no card is selected', () => {
      expect(getSelectedCardId()).toBeNull();
    });
  });

  describe('state isolation', () => {
    it('should maintain state between operations', () => {
      setSelectedCardId('card1');
      addToCombatLog('Log 1');
      
      expect(getSelectedCardId()).toBe('card1');
      expect(getCombatLog()).toContain('Log 1');
      
      addToCombatLog('Log 2');
      expect(getCombatLog()).toHaveLength(2);
    });
  });
});

