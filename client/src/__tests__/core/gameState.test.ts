import { describe, it, expect, beforeEach } from 'vitest';
import {
  addToCombatLog,
  canRollbackTurn,
  getCombatLog,
  getGameState,
  getRollbackHistorySize,
  rollbackTurn,
  setGameState,
  setSelectedCardId,
  getSelectedCardId,
  pushHistorySnapshot,
} from '../../core/gameState.js';
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

  describe('rollback history', () => {
    it('pushes and restores previous state', () => {
      const state = getGameState();
      state.currentPlayerId = 'player_a';
      state.turnIndex = 1;
      state.combatLog = ['before action'];

      pushHistorySnapshot('end_turn');

      state.currentPlayerId = 'player_b';
      state.turnIndex = 2;
      state.combatLog.push('after action');

      expect(canRollbackTurn()).toBe(true);
      const rolledBack = rollbackTurn();

      expect(rolledBack).toBe(true);
      expect(getGameState().currentPlayerId).toBe('player_a');
      expect(getGameState().turnIndex).toBe(1);
      expect(getGameState().combatLog).toEqual(['before action']);
      expect(getRollbackHistorySize()).toBe(0);
    });

    it('blocks rollback while processing turn', () => {
      const state = getGameState();
      state.turnIndex = 3;
      pushHistorySnapshot('play_card');
      state.turnIndex = 4;
      state.isProcessingTurn = true;

      expect(canRollbackTurn()).toBe(false);
      expect(rollbackTurn()).toBe(false);
      expect(getGameState().turnIndex).toBe(4);
    });
  });
});

