import { describe, it, expect, beforeEach } from 'vitest';
import { createCardInstance, getCard } from '../../core/card.js';
import { resetGameState, createMockCard } from '../utils/test-helpers.js';
import { getGameState } from '../../core/gameState.js';

describe('card', () => {
  beforeEach(() => {
    resetGameState();
  });

  describe('createCardInstance', () => {
    it('should create a card instance from a template', () => {
      const template = createMockCard({ id: 'strike', name: 'Strike' });
      const state = getGameState();
      state.cardLibrary['strike'] = template;
      
      const instanceId = createCardInstance('strike');
      
      expect(instanceId).toBeTruthy();
      expect(instanceId).toMatch(/^card_\d+$/);
      expect(state.cardInstances[instanceId!]).toBeDefined();
    });

    it('should return null if template not found', () => {
      const instanceId = createCardInstance('nonexistent');
      
      expect(instanceId).toBeNull();
    });

    it('should create unique instance IDs', () => {
      const template = createMockCard({ id: 'strike' });
      const state = getGameState();
      state.cardLibrary['strike'] = template;
      
      const id1 = createCardInstance('strike');
      const id2 = createCardInstance('strike');
      
      expect(id1).not.toBe(id2);
      expect(state.cardInstances[id1!]).toBeDefined();
      expect(state.cardInstances[id2!]).toBeDefined();
    });

    it('should copy all properties from template', () => {
      const template = createMockCard({ 
        id: 'test',
        name: 'Test Card',
        cost: { energy: 2 },
        effects: [{ kind: 'damage', amount: 10 }]
      });
      const state = getGameState();
      state.cardLibrary['test'] = template;
      
      const instanceId = createCardInstance('test');
      const instance = state.cardInstances[instanceId!];
      
      expect(instance.name).toBe('Test Card');
      expect(instance.cost.energy).toBe(2);
      expect(instance.effects).toEqual([{ kind: 'damage', amount: 10 }]);
      expect(instance.templateId).toBe('test');
    });

    it('should set expiration tracking if card expires', () => {
      const template = createMockCard({ 
        id: 'expiring',
        expires_after_turns: 3
      });
      const state = getGameState();
      state.cardLibrary['expiring'] = template;
      
      const instanceId = createCardInstance('expiring');
      const instance = state.cardInstances[instanceId!];
      
      expect(instance.turnsUntilExpiry).toBe(3);
    });

    it('should not set expiration if card does not expire', () => {
      const template = createMockCard({ 
        id: 'permanent',
        expires_after_turns: 0
      });
      const state = getGameState();
      state.cardLibrary['permanent'] = template;
      
      const instanceId = createCardInstance('permanent');
      const instance = state.cardInstances[instanceId!];
      
      expect(instance.turnsUntilExpiry).toBeUndefined();
    });
  });

  describe('getCard', () => {
    it('should retrieve card instance if it exists', () => {
      const template = createMockCard({ id: 'strike' });
      const state = getGameState();
      state.cardLibrary['strike'] = template;
      
      const instanceId = createCardInstance('strike');
      const card = getCard(instanceId!);
      
      expect(card).toBeDefined();
      expect(card?.instanceId).toBe(instanceId);
    });

    it('should retrieve template if instance does not exist', () => {
      const template = createMockCard({ id: 'strike', name: 'Strike' });
      const state = getGameState();
      state.cardLibrary['strike'] = template;
      
      const card = getCard('strike');
      
      expect(card).toBeDefined();
      expect(card?.name).toBe('Strike');
    });

    it('should return null if neither instance nor template exists', () => {
      const card = getCard('nonexistent');
      expect(card).toBeNull();
    });
  });
});

