import { describe, it, expect, beforeEach } from 'vitest';
import { buildDeckForCharacter, reshuffleDeck, drawCards } from '../../core/deck.js';
import { resetGameState, createMockCharacterDefinition, createMockCharacter, createMockCard } from '../utils/test-helpers.js';
import { getGameState } from '../../core/gameState.js';
import { createCardInstance } from '../../core/card.js';

describe('deck', () => {
  beforeEach(() => {
    resetGameState();
  });

  describe('buildDeckForCharacter', () => {
    it('should build deck from starting deck with copies', () => {
      const state = getGameState();
      const strike = createMockCard({ id: 'strike', copies: 4 });
      const defend = createMockCard({ id: 'defend', copies: 3 });
      
      state.cardLibrary['strike'] = strike;
      state.cardLibrary['defend'] = defend;
      
      const charDef = createMockCharacterDefinition({
        startingDeck: ['strike', 'defend']
      });
      
      const deck = buildDeckForCharacter(charDef);
      
      expect(deck).toHaveLength(7); // 4 strikes + 3 defends
      expect(deck.filter(id => id === 'strike')).toHaveLength(4);
      expect(deck.filter(id => id === 'defend')).toHaveLength(3);
    });

    it('should handle missing card templates gracefully', () => {
      const charDef = createMockCharacterDefinition({
        startingDeck: ['missing_card', 'existing_card']
      });
      
      const state = getGameState();
      state.cardLibrary['existing_card'] = createMockCard({ id: 'existing_card', copies: 1 });
      
      const deck = buildDeckForCharacter(charDef);
      
      expect(deck).toHaveLength(1);
      expect(deck[0]).toBe('existing_card');
    });

    it('should shuffle the deck', () => {
      const state = getGameState();
      const card1 = createMockCard({ id: 'card1', copies: 5 });
      const card2 = createMockCard({ id: 'card2', copies: 5 });
      state.cardLibrary['card1'] = card1;
      state.cardLibrary['card2'] = card2;
      
      const charDef = createMockCharacterDefinition({
        startingDeck: ['card1', 'card2']
      });
      
      const deck1 = buildDeckForCharacter(charDef);
      const deck2 = buildDeckForCharacter(charDef);
      
      // Very unlikely that 10 cards in same order twice
      // Check that at least the first few cards differ
      const sameOrder = deck1.every((card, index) => card === deck2[index]);
      expect(sameOrder).toBe(false);
    });

    it('should handle empty starting deck', () => {
      const charDef = createMockCharacterDefinition({
        startingDeck: []
      });
      
      const deck = buildDeckForCharacter(charDef);
      expect(deck).toEqual([]);
    });

    it('should default copies to 1 if not specified', () => {
      const state = getGameState();
      const card = createMockCard({ id: 'single', copies: undefined });
      state.cardLibrary['single'] = card;
      
      const charDef = createMockCharacterDefinition({
        startingDeck: ['single']
      });
      
      const deck = buildDeckForCharacter(charDef);
      expect(deck).toHaveLength(1);
    });
  });

  describe('reshuffleDeck', () => {
    it('should move discard pile back to deck and shuffle', () => {
      const character = createMockCharacter({
        deck: [],
        discardPile: ['card1', 'card2', 'card3']
      });
      
      reshuffleDeck(character);
      
      expect(character.discardPile).toEqual([]);
      expect(character.deck).toHaveLength(3);
      expect(character.deck).toContain('card1');
      expect(character.deck).toContain('card2');
      expect(character.deck).toContain('card3');
    });

    it('should do nothing if both deck and discard are empty', () => {
      const character = createMockCharacter({
        deck: [],
        discardPile: []
      });
      
      reshuffleDeck(character);
      
      expect(character.deck).toEqual([]);
      expect(character.discardPile).toEqual([]);
    });

    it('should preserve existing deck cards', () => {
      const character = createMockCharacter({
        deck: ['existing1', 'existing2'],
        discardPile: ['discard1']
      });
      
      reshuffleDeck(character);
      
      expect(character.deck).toHaveLength(3);
      expect(character.deck).toContain('existing1');
      expect(character.deck).toContain('existing2');
      expect(character.deck).toContain('discard1');
    });
  });

  describe('drawCards', () => {
    beforeEach(() => {
      const state = getGameState();
      const card = createMockCard({ id: 'test_card' });
      state.cardLibrary['test_card'] = card;
    });

    it('should draw cards from deck to hand', () => {
      const character = createMockCharacter({
        deck: ['test_card', 'test_card', 'test_card'],
        hand: [],
        maxHandSize: 5
      });
      
      drawCards(character, 3);
      
      expect(character.hand).toHaveLength(3);
      expect(character.deck).toHaveLength(0);
      expect(character.hand.every(id => id?.startsWith('card_'))).toBe(true);
    });

    it('should respect max hand size', () => {
      const character = createMockCharacter({
        deck: ['test_card', 'test_card', 'test_card', 'test_card', 'test_card', 'test_card'],
        hand: [],
        maxHandSize: 5
      });
      
      drawCards(character, 10);
      
      expect(character.hand.length).toBeLessThanOrEqual(5);
      expect(character.deck.length).toBeGreaterThan(0);
    });

    it('should reshuffle discard when deck is empty', () => {
      const character = createMockCharacter({
        deck: ['test_card'],
        discardPile: ['test_card', 'test_card'],
        hand: [],
        maxHandSize: 5
      });
      
      // Draw all cards from deck
      drawCards(character, 1);
      expect(character.deck).toHaveLength(0);
      
      // Draw more, should reshuffle
      drawCards(character, 2);
      
      expect(character.discardPile.length).toBeLessThan(2); // Some cards moved to deck
      expect(character.hand.length).toBeGreaterThan(1);
    });

    it('should stop drawing if deck and discard are both empty', () => {
      const character = createMockCharacter({
        deck: [],
        discardPile: [],
        hand: [],
        maxHandSize: 5
      });
      
      drawCards(character, 5);
      
      expect(character.hand).toEqual([]);
    });

    it('should create card instances when drawing', () => {
      const character = createMockCharacter({
        deck: ['test_card'],
        hand: [],
        maxHandSize: 5
      });
      
      drawCards(character, 1);
      
      expect(character.hand.length).toBe(1);
      const instanceId = character.hand[0];
      const state = getGameState();
      expect(state.cardInstances[instanceId]).toBeDefined();
    });

    it('should handle partial draws when hand is partially full', () => {
      const character = createMockCharacter({
        deck: ['test_card', 'test_card', 'test_card'],
        hand: ['card_1', 'card_2'],
        maxHandSize: 5
      });
      
      drawCards(character, 5);
      
      expect(character.hand.length).toBeLessThanOrEqual(5);
      expect(character.hand.length).toBeGreaterThan(2);
    });
  });
});

