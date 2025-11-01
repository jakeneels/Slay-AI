import { describe, it, expect, beforeEach, vi } from 'vitest';
import { playCard, endTurn, setApp, processEnemyTurn } from '../../core/combat.js';
import { resetGameState, createMockCharacter, createMockCard, setupGameState } from '../utils/test-helpers.js';
import { getGameState } from '../../core/gameState.js';
import { createCardInstance } from '../../core/card.js';
import type { Application } from 'pixi.js';

// Mock PixiJS Application
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

// Mock animations
vi.mock('../../../animations.js', () => ({
  playDamageAnimation: vi.fn().mockResolvedValue(undefined),
  playHealAnimation: vi.fn().mockResolvedValue(undefined),
  animateCharachterSpark: vi.fn().mockResolvedValue(undefined),
}));

describe('combat', () => {
  let mockApp: Application;

  beforeEach(() => {
    resetGameState();
    mockApp = createMockApp();
    setApp(mockApp);
  });

  describe('playCard', () => {
    it('should play a damage card targeting enemy', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        hp: 100,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false
      });

      const strikeCard = createMockCard({
        id: 'strike',
        name: 'Strike',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 6 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { strike: strikeCard },
        currentPlayerId: 'player1'
      });

      const state = getGameState();
      const instanceId = createCardInstance('strike');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!, 'enemy1');

      expect(enemy.hp).toBe(94); // 100 - 6 damage
      expect(player.energy).toBe(2); // 3 - 1 cost
      expect(player.hand).not.toContain(instanceId);
    });

    it('should grant block to target character', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });

      const defendCard = createMockCard({
        id: 'defend',
        name: 'Defend',
        cost: { energy: 1 },
        targeting: 'self',
        effects: [{ kind: 'grant_block_layer', amount: 8, decay_percent: 20 }]
      });

      setupGameState({
        characters: [player],
        cardLibrary: { defend: defendCard },
        currentPlayerId: 'player1'
      });

      const state = getGameState();
      const instanceId = createCardInstance('defend');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!);

      expect(player.blockLayers).toHaveLength(1);
      expect(player.blockLayers[0].amount).toBe(8);
      expect(player.energy).toBe(2);
    });

    it('should heal target character', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        hp: 50,
        maxHp: 100,
        isPlayer: true
      });

      const healCard = createMockCard({
        id: 'heal',
        name: 'Heal',
        cost: { energy: 2 },
        targeting: 'self',
        effects: [{ kind: 'heal', amount: 20 }]
      });

      setupGameState({
        characters: [player],
        cardLibrary: { heal: healCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('heal');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!);

      expect(player.hp).toBe(70); // 50 + 20 heal
      expect(player.energy).toBe(1); // 3 - 2 cost
    });

    it('should not allow playing card without enough energy', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 0,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false
      });

      const strikeCard = createMockCard({
        id: 'strike',
        name: 'Strike',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 6 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { strike: strikeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('strike');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      const initialEnergy = player.energy;
      const initialEnemyHp = enemy.hp;

      await playCard(instanceId!, 'enemy1');

      // Should not play the card
      expect(player.energy).toBe(initialEnergy);
      expect(enemy.hp).toBe(initialEnemyHp);
    });

    it('should handle self-targeting cards correctly', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });

      const selfCard = createMockCard({
        id: 'self_card',
        name: 'Self Card',
        cost: { energy: 1 },
        targeting: 'self',
        effects: [{ kind: 'energy', amount: 1 }]
      });

      setupGameState({
        characters: [player],
        cardLibrary: { self_card: selfCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('self_card');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!);

      // Should grant energy
      expect(player.energy).toBe(3); // 3 - 1 cost + 1 gained = 3
    });

    it('should handle allEnemies targeting', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy1 = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy 1',
        hp: 100,
        isPlayer: false
      });
      const enemy2 = createMockCharacter({
        id: 'enemy2',
        name: 'Enemy 2',
        hp: 100,
        isPlayer: false
      });

      const aoeCard = createMockCard({
        id: 'aoe',
        name: 'AOE',
        cost: { energy: 2 },
        targeting: 'allEnemies',
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy1, enemy2],
        cardLibrary: { aoe: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('aoe');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!);

      expect(enemy1.hp).toBe(90); // 100 - 10
      expect(enemy2.hp).toBe(90); // 100 - 10
    });

    it('should exhaust cards when exhaust is true', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false
      });

      const exhaustCard = createMockCard({
        id: 'exhaust_card',
        name: 'Exhaust Card',
        cost: { energy: 1 },
        targeting: 'enemy',
        exhaust: true,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { exhaust_card: exhaustCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('exhaust_card');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      const initialDiscardLength = player.discardPile.length;

      await playCard(instanceId!, 'enemy1');

      // Card should not be in hand
      expect(player.hand).not.toContain(instanceId);
      // Card should not be in discard (exhausted cards don't go to discard)
      expect(player.discardPile.length).toBe(initialDiscardLength);
    });

    it('should discard cards when exhaust is false', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false
      });

      const normalCard = createMockCard({
        id: 'normal',
        name: 'Normal Card',
        cost: { energy: 1 },
        targeting: 'enemy',
        exhaust: false,
        effects: [{ kind: 'damage', amount: 5 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { normal: normalCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('normal');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!, 'enemy1');

      expect(player.hand).not.toContain(instanceId);
      // Should go to discard pile (template ID)
      expect(player.discardPile).toContain('normal');
    });

    it('should handle ally targeting correctly', async () => {
      const player1 = createMockCharacter({
        id: 'player1',
        name: 'Player 1',
        energy: 3,
        hp: 50,
        maxHp: 100,
        isPlayer: true
      });
      const player2 = createMockCharacter({
        id: 'player2',
        name: 'Player 2',
        energy: 3,
        hp: 50,
        maxHp: 100,
        isPlayer: true
      });

      const healCard = createMockCard({
        id: 'heal_ally',
        name: 'Heal Ally',
        cost: { energy: 1 },
        targeting: 'ally',
        effects: [{ kind: 'heal', amount: 20 }]
      });

      setupGameState({
        characters: [player1, player2],
        cardLibrary: { heal_ally: healCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('heal_ally');
      if (instanceId) {
        player1.hand.push(instanceId);
      }

      await playCard(instanceId!, 'player2');

      expect(player2.hp).toBe(70); // 50 + 20
    });

    it('should not allow targeting enemy with ally-targeting card', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false
      });

      const allyCard = createMockCard({
        id: 'ally_card',
        name: 'Ally Card',
        cost: { energy: 1 },
        targeting: 'ally',
        effects: [{ kind: 'heal', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { ally_card: allyCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('ally_card');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      const initialEnergy = player.energy;
      const initialEnemyHp = enemy.hp;

      await playCard(instanceId!, 'enemy1');

      // Should not play
      expect(player.energy).toBe(initialEnergy);
      expect(enemy.hp).toBe(initialEnemyHp);
    });

    it('should apply damage through block correctly', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        blockLayers: [{ amount: 5, decay_percent: 20 }],
        isPlayer: false
      });

      const strikeCard = createMockCard({
        id: 'strike',
        name: 'Strike',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { strike: strikeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('strike');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!, 'enemy1');

      // 10 damage - 5 block = 5 damage to HP
      expect(enemy.hp).toBe(95);
      expect(enemy.blockLayers).toHaveLength(0); // Block consumed
    });

    it('should not play card when app is not set', async () => {
      setApp(null as any);
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false
      });

      const strikeCard = createMockCard({
        id: 'strike',
        name: 'Strike',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 6 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { strike: strikeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('strike');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!, 'enemy1');

      // Should not play
      expect(enemy.hp).toBe(100);
      expect(player.energy).toBe(3);
    });

    it('should not play card when card is not in hand', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false
      });

      const strikeCard = createMockCard({
        id: 'strike',
        name: 'Strike',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 6 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { strike: strikeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('strike');
      // Don't add to hand

      await playCard(instanceId!, 'enemy1');

      // Should not play
      expect(enemy.hp).toBe(100);
      expect(player.energy).toBe(3);
    });

    it('should not play card when currentPlayer not found', async () => {
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false
      });

      const strikeCard = createMockCard({
        id: 'strike',
        name: 'Strike',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 6 }]
      });

      setupGameState({
        characters: [enemy],
        cardLibrary: { strike: strikeCard },
        currentPlayerId: 'nonexistent'
      });

      await playCard('fake_id', 'enemy1');

      expect(enemy.hp).toBe(100);
    });

    it('should handle allAllies targeting', async () => {
      const player1 = createMockCharacter({
        id: 'player1',
        name: 'Player 1',
        energy: 3,
        hp: 50,
        maxHp: 100,
        isPlayer: true
      });
      const player2 = createMockCharacter({
        id: 'player2',
        name: 'Player 2',
        energy: 3,
        hp: 50,
        maxHp: 100,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false
      });

      const massHealCard = createMockCard({
        id: 'mass_heal',
        name: 'Mass Heal',
        cost: { energy: 2 },
        targeting: 'allAllies',
        effects: [{ kind: 'heal', amount: 20 }]
      });

      setupGameState({
        characters: [player1, player2, enemy],
        cardLibrary: { mass_heal: massHealCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('mass_heal');
      if (instanceId) {
        player1.hand.push(instanceId);
      }

      await playCard(instanceId!);

      expect(player1.hp).toBe(70); // 50 + 20
      expect(player2.hp).toBe(70); // 50 + 20
      expect(enemy.hp).toBe(100); // Not healed
    });

    it('should handle default single target mode', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false
      });

      const oldCard = createMockCard({
        id: 'old_card',
        name: 'Old Card',
        cost: { energy: 1 },
        targeting: 'single' as any, // Old targeting mode
        effects: [{ kind: 'damage', amount: 5 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { old_card: oldCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('old_card');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!, 'enemy1');

      expect(enemy.hp).toBe(95); // 100 - 5
    });

    it('should not play card when target not found for ally targeting', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });

      const allyCard = createMockCard({
        id: 'ally_card',
        name: 'Ally Card',
        cost: { energy: 1 },
        targeting: 'ally',
        effects: [{ kind: 'heal', amount: 10 }]
      });

      setupGameState({
        characters: [player],
        cardLibrary: { ally_card: allyCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('ally_card');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      const initialEnergy = player.energy;

      await playCard(instanceId!, 'nonexistent');

      expect(player.energy).toBe(initialEnergy);
    });

    it('should not play card when targetId missing for ally targeting', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });

      const allyCard = createMockCard({
        id: 'ally_card',
        name: 'Ally Card',
        cost: { energy: 1 },
        targeting: 'ally',
        effects: [{ kind: 'heal', amount: 10 }]
      });

      setupGameState({
        characters: [player],
        cardLibrary: { ally_card: allyCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('ally_card');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      const initialEnergy = player.energy;

      await playCard(instanceId!);

      expect(player.energy).toBe(initialEnergy);
    });

    it('should not play card when targetId missing for enemy targeting', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });

      const strikeCard = createMockCard({
        id: 'strike',
        name: 'Strike',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 6 }]
      });

      setupGameState({
        characters: [player],
        cardLibrary: { strike: strikeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('strike');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      const initialEnergy = player.energy;

      await playCard(instanceId!);

      expect(player.energy).toBe(initialEnergy);
    });

    it('should not play card when target not found for enemy targeting', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });

      const strikeCard = createMockCard({
        id: 'strike',
        name: 'Strike',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 6 }]
      });

      setupGameState({
        characters: [player],
        cardLibrary: { strike: strikeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('strike');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      const initialEnergy = player.energy;

      await playCard(instanceId!, 'nonexistent');

      expect(player.energy).toBe(initialEnergy);
    });

    it('should not play card when no valid targets', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });

      const aoeCard = createMockCard({
        id: 'aoe',
        name: 'AOE',
        cost: { energy: 2 },
        targeting: 'allEnemies',
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player],
        cardLibrary: { aoe: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('aoe');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      const initialEnergy = player.energy;

      await playCard(instanceId!);

      expect(player.energy).toBe(initialEnergy);
    });

    it('should handle aoe_damage effect', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy1 = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy 1',
        hp: 100,
        isPlayer: false
      });
      const enemy2 = createMockCharacter({
        id: 'enemy2',
        name: 'Enemy 2',
        hp: 100,
        isPlayer: false
      });

      const aoeCard = createMockCard({
        id: 'aoe',
        name: 'AOE',
        cost: { energy: 2 },
        targeting: 'allEnemies',
        effects: [{ kind: 'aoe_damage', amount: 15 }]
      });

      setupGameState({
        characters: [player, enemy1, enemy2],
        cardLibrary: { aoe: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('aoe');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!);

      expect(enemy1.hp).toBe(85); // 100 - 15
      expect(enemy2.hp).toBe(85); // 100 - 15
    });

    it('should handle speed effect', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        maxEnergy: 3,
        isPlayer: true
      });

      const speedCard = createMockCard({
        id: 'speed',
        name: 'Speed',
        cost: { energy: 1 },
        targeting: 'self',
        effects: [{ kind: 'speed', amount: 2 }]
      });

      setupGameState({
        characters: [player],
        cardLibrary: { speed: speedCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('speed');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!);

      expect(player.energy).toBe(2); // 3 - 1 cost
    });

    it('should handle status effect', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false
      });

      const statusCard = createMockCard({
        id: 'status',
        name: 'Status Card',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [{ kind: 'status', status: 'disrupt', stacks: 2 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { status: statusCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('status');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!, 'enemy1');

      expect(enemy.statuses).toHaveLength(1);
      expect(enemy.statuses[0].id).toBe('disrupt');
      expect(enemy.statuses[0].stacks).toBe(2);
    });

    it('should handle modifier effect with condition met', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false
      });

      const modifierCard = createMockCard({
        id: 'modifier',
        name: 'Modifier Card',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [
          {
            kind: 'modifier',
            when: { target_has_tag: 'robot' },
            apply: [{ kind: 'damage', amount: 20 }]
          }
        ]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { modifier: modifierCard },
        characterLibrary: { enemy1: { id: 'enemy1', tags: ['robot'] } },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('modifier');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!, 'enemy1');

      expect(enemy.hp).toBe(80); // 100 - 20
    });

    it('should handle modifier effect with condition not met', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false
      });

      const modifierCard = createMockCard({
        id: 'modifier',
        name: 'Modifier Card',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [
          {
            kind: 'modifier',
            when: { target_has_tag: 'robot' },
            apply: [{ kind: 'damage', amount: 20 }]
          }
        ]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { modifier: modifierCard },
        characterLibrary: { enemy1: { id: 'enemy1', tags: [] } },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('modifier');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!, 'enemy1');

      expect(enemy.hp).toBe(100); // No damage applied
    });

    it('should handle deck_inject effect for self', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        deck: [],
        isPlayer: true
      });

      const injectCard = createMockCard({
        id: 'inject',
        name: 'Inject Card',
        cost: { energy: 1 },
        targeting: 'self',
        effects: [{ kind: 'deck_inject', target: 'self', card: 'strike', copies: 2 }]
      });

      setupGameState({
        characters: [player],
        cardLibrary: { inject: injectCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('inject');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!);

      expect(player.deck).toEqual(['strike', 'strike']);
    });

    it('should handle deck_inject effect for allies', async () => {
      const player1 = createMockCharacter({
        id: 'player1',
        name: 'Player 1',
        energy: 3,
        deck: [],
        isPlayer: true
      });
      const player2 = createMockCharacter({
        id: 'player2',
        name: 'Player 2',
        energy: 3,
        deck: [],
        isPlayer: true
      });

      const injectCard = createMockCard({
        id: 'inject',
        name: 'Inject Card',
        cost: { energy: 1 },
        targeting: 'self',
        effects: [{ kind: 'deck_inject', target: 'allies', card: 'strike', copies: 1 }]
      });

      setupGameState({
        characters: [player1, player2],
        cardLibrary: { inject: injectCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('inject');
      if (instanceId) {
        player1.hand.push(instanceId);
      }

      await playCard(instanceId!);

      expect(player1.deck).toEqual(['strike']);
      expect(player2.deck).toEqual(['strike']);
    });

    it('should handle deck_inject effect for enemies', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        deck: [],
        isPlayer: false
      });

      const injectCard = createMockCard({
        id: 'inject',
        name: 'Inject Card',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [{ kind: 'deck_inject', target: 'enemies', card: 'curse', copies: 1 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { inject: injectCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('inject');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!, 'enemy1');

      expect(enemy.deck).toEqual(['curse']);
    });

    it('should handle damage with block absorbing all damage', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        blockLayers: [{ amount: 50, decay_percent: 20 }],
        isPlayer: false
      });

      const weakCard = createMockCard({
        id: 'weak',
        name: 'Weak',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { weak: weakCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('weak');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!, 'enemy1');

      // Block absorbs all damage, no HP loss
      expect(enemy.hp).toBe(100);
      expect(enemy.blockLayers[0].amount).toBe(40); // 50 - 10
    });

    it('should handle damage that defeats target', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 5,
        isPlayer: false
      });

      const strikeCard = createMockCard({
        id: 'strike',
        name: 'Strike',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { strike: strikeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('strike');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!, 'enemy1');

      expect(enemy.hp).toBeLessThanOrEqual(0);
    });

    it('should handle heal that exceeds maxHp', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        hp: 90,
        maxHp: 100,
        isPlayer: true
      });

      const healCard = createMockCard({
        id: 'heal',
        name: 'Heal',
        cost: { energy: 1 },
        targeting: 'self',
        effects: [{ kind: 'heal', amount: 20 }]
      });

      setupGameState({
        characters: [player],
        cardLibrary: { heal: healCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('heal');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!);

      expect(player.hp).toBe(100); // Capped at maxHp
    });

    it('should handle heal initializing cumulativeHeal', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        hp: 50,
        maxHp: 100,
        isPlayer: true
      });

      const healCard = createMockCard({
        id: 'heal',
        name: 'Heal',
        cost: { energy: 1 },
        targeting: 'self',
        effects: [{ kind: 'heal', amount: 20 }]
      });

      setupGameState({
        characters: [player],
        cardLibrary: { heal: healCard },
        currentPlayerId: 'player1'
      });

      const state = getGameState();
      // Ensure cumulativeHeal is undefined
      state.stats.cumulativeHeal = undefined as any;

      const instanceId = createCardInstance('heal');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!);

      expect(state.stats.cumulativeHeal).toBe(20);
    });

    it('should call renderCallback after playing card', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false
      });

      const strikeCard = createMockCard({
        id: 'strike',
        name: 'Strike',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 6 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { strike: strikeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('strike');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      const renderCallback = vi.fn();

      await playCard(instanceId!, 'enemy1', renderCallback);

      expect(renderCallback).toHaveBeenCalled();
    });

    it('should call renderCallback immediately after energy consumption', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false
      });

      const strikeCard = createMockCard({
        id: 'strike',
        name: 'Strike',
        cost: { energy: 2 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 6 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { strike: strikeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('strike');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      const renderCallback = vi.fn();

      await playCard(instanceId!, 'enemy1', renderCallback);

      // Should be called multiple times: after energy consumption, after damage, after card removal
      expect(renderCallback).toHaveBeenCalledTimes(3);
      // First call should be after energy is consumed but before animations
      expect(renderCallback).toHaveBeenNthCalledWith(1);
      expect(player.energy).toBe(1); // 3 - 2
    });

    it('should call renderCallback immediately after damage is dealt', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false
      });

      const strikeCard = createMockCard({
        id: 'strike',
        name: 'Strike',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { strike: strikeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('strike');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      const renderCallback = vi.fn();

      await playCard(instanceId!, 'enemy1', renderCallback);

      // Should be called after energy consumption, after damage, and after card removal
      expect(renderCallback).toHaveBeenCalledTimes(3);
      expect(enemy.hp).toBe(90); // Damage should be applied
    });

    it('should call renderCallback immediately after healing', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        hp: 50,
        maxHp: 100,
        isPlayer: true
      });

      const healCard = createMockCard({
        id: 'heal',
        name: 'Heal',
        cost: { energy: 1 },
        targeting: 'self',
        effects: [{ kind: 'heal', amount: 20 }]
      });

      setupGameState({
        characters: [player],
        cardLibrary: { heal: healCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('heal');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      const renderCallback = vi.fn();

      await playCard(instanceId!, undefined, renderCallback);

      // Should be called after energy consumption, after healing, and after card removal
      expect(renderCallback).toHaveBeenCalledTimes(3);
      expect(player.hp).toBe(70); // 50 + 20
    });

    it('should call renderCallback immediately after block is granted', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });

      const defendCard = createMockCard({
        id: 'defend',
        name: 'Defend',
        cost: { energy: 1 },
        targeting: 'self',
        effects: [{ kind: 'grant_block_layer', amount: 8, decay_percent: 20 }]
      });

      setupGameState({
        characters: [player],
        cardLibrary: { defend: defendCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('defend');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      const renderCallback = vi.fn();

      await playCard(instanceId!, undefined, renderCallback);

      // Should be called after energy consumption, after block grant, and after card removal
      expect(renderCallback).toHaveBeenCalledTimes(3);
      expect(player.blockLayers).toHaveLength(1);
      expect(player.blockLayers[0].amount).toBe(8);
    });

    it('should call renderCallback immediately after energy gain', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 2,
        maxEnergy: 3,
        isPlayer: true
      });

      const energyCard = createMockCard({
        id: 'energy',
        name: 'Energy',
        cost: { energy: 1 },
        targeting: 'self',
        effects: [{ kind: 'energy', amount: 2 }]
      });

      setupGameState({
        characters: [player],
        cardLibrary: { energy: energyCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('energy');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      const renderCallback = vi.fn();

      await playCard(instanceId!, undefined, renderCallback);

      // Should be called after energy consumption, after energy gain, and after card removal
      expect(renderCallback).toHaveBeenCalledTimes(3);
      expect(player.energy).toBe(3); // 2 - 1 + 2 = 3 (capped at maxEnergy)
    });

    it('should call renderCallback multiple times for AOE damage on multiple targets', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        isPlayer: true
      });
      const enemy1 = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy 1',
        hp: 100,
        isPlayer: false
      });
      const enemy2 = createMockCharacter({
        id: 'enemy2',
        name: 'Enemy 2',
        hp: 100,
        isPlayer: false
      });

      const aoeCard = createMockCard({
        id: 'aoe',
        name: 'AOE',
        cost: { energy: 2 },
        targeting: 'allEnemies',
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy1, enemy2],
        cardLibrary: { aoe: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('aoe');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      const renderCallback = vi.fn();

      await playCard(instanceId!, undefined, renderCallback);

      // Should be called after energy consumption, after damage to enemy1, after damage to enemy2, and after card removal
      expect(renderCallback).toHaveBeenCalledTimes(4);
      expect(enemy1.hp).toBe(90); // 100 - 10
      expect(enemy2.hp).toBe(90); // 100 - 10
    });

    it('should handle card with templateId for discard', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false
      });

      const card = createMockCard({
        id: 'strike',
        name: 'Strike',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 5 }]
      });
      setupGameState({
        characters: [player, enemy],
        cardLibrary: { strike: card },
        currentPlayerId: 'player1'
      });

      const state = getGameState();
      const instanceId = createCardInstance('strike');
      if (instanceId) {
        player.hand.push(instanceId);
        // Set templateId on card instance
        const instance = state.cardInstances[instanceId];
        if (instance) {
          (instance as any).templateId = 'strike_template';
        }
      }

      await playCard(instanceId!, 'enemy1');

      expect(player.discardPile).toContain('strike_template');
    });

    it('should handle AOE damage that defeats target', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 5,
        isPlayer: false
      });

      const aoeCard = createMockCard({
        id: 'aoe',
        name: 'AOE',
        cost: { energy: 2 },
        targeting: 'allEnemies',
        effects: [{ kind: 'aoe_damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { aoe: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('aoe');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      await playCard(instanceId!);

      expect(enemy.hp).toBeLessThanOrEqual(0);
    });
  });

  describe('endTurn', () => {
    it('should advance to next character', () => {
      const player1 = createMockCharacter({
        id: 'player1',
        name: 'Player 1',
        energy: 0,
        maxEnergy: 3,
        isPlayer: true
      });
      const player2 = createMockCharacter({
        id: 'player2',
        name: 'Player 2',
        energy: 0,
        maxEnergy: 3,
        isPlayer: true
      });

      setupGameState({
        characters: [player1, player2],
        currentPlayerId: 'player1'
      });

      endTurn();

      const state = getGameState();
      expect(state.currentPlayerId).toBe('player2');
      expect(player2.energy).toBe(3); // Restored to max
    });

    it('should restore energy for next player', () => {
      const player1 = createMockCharacter({
        id: 'player1',
        name: 'Player 1',
        energy: 1,
        maxEnergy: 3,
        isPlayer: true
      });
      const player2 = createMockCharacter({
        id: 'player2',
        name: 'Player 2',
        energy: 0,
        maxEnergy: 5,
        isPlayer: true
      });

      setupGameState({
        characters: [player1, player2],
        currentPlayerId: 'player1'
      });

      endTurn();

      expect(player2.energy).toBe(5); // Restored to max
    });

    it('should decay block layers at end of turn', () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        blockLayers: [{ amount: 100, decay_percent: 20 }],
        isPlayer: true
      });

      setupGameState({
        characters: [player],
        currentPlayerId: 'player1'
      });

      endTurn();

      // 100 * 20% = 20 decay, ceil = 20, so 100 - 20 = 80
      expect(player.blockLayers[0].amount).toBe(80);
    });

    it('should process DoT statuses at end of turn', () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        hp: 100,
        blockLayers: [],
        statuses: [{ id: 'bleed', stacks: 3 }],
        isPlayer: true
      });

      setupGameState({
        characters: [player],
        currentPlayerId: 'player1'
      });

      endTurn();

      // 3 bleed damage
      expect(player.hp).toBe(97);
    });

    it('should cycle through all characters', () => {
      const player1 = createMockCharacter({
        id: 'player1',
        name: 'Player 1',
        energy: 3,
        isPlayer: true
      });
      const player2 = createMockCharacter({
        id: 'player2',
        name: 'Player 2',
        energy: 3,
        isPlayer: true
      });
      const player3 = createMockCharacter({
        id: 'player3',
        name: 'Player 3',
        energy: 3,
        isPlayer: true
      });

      setupGameState({
        characters: [player1, player2, player3],
        currentPlayerId: 'player1'
      });

      endTurn();
      expect(getGameState().currentPlayerId).toBe('player2');

      endTurn();
      expect(getGameState().currentPlayerId).toBe('player3');

      endTurn();
      expect(getGameState().currentPlayerId).toBe('player1'); // Cycles back
    });

    it('should handle no living characters', () => {
      const deadPlayer = createMockCharacter({
        id: 'player1',
        name: 'Player 1',
        energy: 3,
        hp: 0,
        isPlayer: true
      });

      setupGameState({
        characters: [deadPlayer],
        currentPlayerId: 'player1'
      });

      const stateBefore = getGameState();
      endTurn();

      // Should not crash, state should remain unchanged
      expect(getGameState().currentPlayerId).toBe('player1');
    });

    it('should handle current player being dead', () => {
      const deadPlayer = createMockCharacter({
        id: 'player1',
        name: 'Player 1',
        energy: 3,
        hp: 0,
        isPlayer: true
      });
      const alivePlayer = createMockCharacter({
        id: 'player2',
        name: 'Player 2',
        energy: 0,
        maxEnergy: 3,
        isPlayer: true
      });

      setupGameState({
        characters: [deadPlayer, alivePlayer],
        currentPlayerId: 'player1'
      });

      endTurn();

      expect(getGameState().currentPlayerId).toBe('player2');
      expect(alivePlayer.energy).toBe(3);
    });

    it('should handle card expiration', () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        maxEnergy: 3,
        isPlayer: true
      });

      setupGameState({
        characters: [player],
        currentPlayerId: 'player1'
      });

      const state = getGameState();
      // Create an expiring card instance
      const expiringCardId = 'expiring_card_1';
      state.cardInstances[expiringCardId] = {
        id: expiringCardId,
        cardId: 'temp_card',
        name: 'Temp Card',
        turnsUntilExpiry: 1
      };
      player.hand.push(expiringCardId);

      endTurn();

      // Card should be removed from hand
      expect(player.hand).not.toContain(expiringCardId);
      expect(state.cardInstances[expiringCardId]).toBeUndefined();
    });

    it('should handle card expiration decrementing turns', () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        maxEnergy: 3,
        isPlayer: true
      });

      setupGameState({
        characters: [player],
        currentPlayerId: 'player1'
      });

      const state = getGameState();
      // Create a card with 2 turns left
      const expiringCardId = 'expiring_card_1';
      state.cardInstances[expiringCardId] = {
        id: expiringCardId,
        cardId: 'temp_card',
        name: 'Temp Card',
        turnsUntilExpiry: 2
      };
      player.hand.push(expiringCardId);

      endTurn();

      // Card should still be in hand, but turns decremented
      expect(player.hand).toContain(expiringCardId);
      expect(state.cardInstances[expiringCardId]?.turnsUntilExpiry).toBe(1);
    });

    it('should call renderCallback in endTurn', () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        maxEnergy: 3,
        isPlayer: true
      });

      setupGameState({
        characters: [player],
        currentPlayerId: 'player1'
      });

      const renderCallback = vi.fn();

      endTurn(renderCallback);

      expect(renderCallback).toHaveBeenCalled();
    });

    it('should trigger enemy turn when next player is enemy', () => {
      vi.useFakeTimers();
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        maxEnergy: 3,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        energy: 0,
        maxEnergy: 3,
        hp: 100,
        isPlayer: false
      });

      setupGameState({
        characters: [player, enemy],
        currentPlayerId: 'player1'
      });

      const renderCallback = vi.fn();
      endTurn(renderCallback);

      // Fast-forward time
      vi.advanceTimersByTime(1000);

      // Should have triggered processEnemyTurn
      expect(enemy.energy).toBe(3); // Restored
      
      vi.useRealTimers();
    });

    it('should handle enemy turn when no player targets', async () => {
      vi.useFakeTimers();
      
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        energy: 3,
        maxEnergy: 3,
        hp: 100,
        isPlayer: false
      });

      setupGameState({
        characters: [enemy],
        currentPlayerId: 'enemy1'
      });

      const renderCallback = vi.fn();
      await processEnemyTurn(enemy, renderCallback);

      // Should handle gracefully when no targets
      expect(getGameState().isProcessingTurn).toBe(false);
      
      vi.useRealTimers();
    });

    it('should handle enemy turn when no playable cards', async () => {
      vi.useFakeTimers();
      
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        hp: 100,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        energy: 0,
        maxEnergy: 3,
        hp: 100,
        isPlayer: false,
        hand: []
      });

      const expensiveCard = createMockCard({
        id: 'expensive',
        name: 'Expensive',
        cost: { energy: 10 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { expensive: expensiveCard },
        currentPlayerId: 'enemy1'
      });

      const state = getGameState();

      const instanceId = createCardInstance('expensive');
      if (instanceId) {
        enemy.hand.push(instanceId);
      }

      const renderCallback = vi.fn();
      await processEnemyTurn(enemy, renderCallback);

      // Fast-forward time
      vi.advanceTimersByTime(1500);

      // Should handle gracefully when no playable cards
      expect(state.isProcessingTurn).toBe(false);
      
      vi.useRealTimers();
    });

    it.skip('should handle enemy turn playing a card', async () => {
      vi.useFakeTimers();
      
      // Ensure app is set
      setApp(mockApp);
      
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        hp: 100,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        energy: 3,
        maxEnergy: 3,
        hp: 100,
        isPlayer: false
      });

      const enemyCard = createMockCard({
        id: 'enemy_strike',
        name: 'Enemy Strike',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 5 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { enemy_strike: enemyCard },
        currentPlayerId: 'enemy1'
      });

      const instanceId = createCardInstance('enemy_strike');
      if (instanceId) {
        enemy.hand.push(instanceId);
      }

      const renderCallback = vi.fn();
      const promise = processEnemyTurn(enemy, renderCallback);

      // Fast-forward through all delays (1500ms selection, 1500ms play, 2000ms end turn)
      vi.advanceTimersByTime(1500);
      await vi.runOnlyPendingTimersAsync();
      vi.advanceTimersByTime(1500);
      await vi.runOnlyPendingTimersAsync();
      vi.advanceTimersByTime(2000);
      await vi.runOnlyPendingTimersAsync();
      await promise;

      // Enemy should have played the card
      expect(player.hp).toBe(95); // 100 - 5
      expect(enemy.energy).toBe(2); // 3 - 1
      
      vi.useRealTimers();
    });

    it('should not process enemy turn if already processing', async () => {
      vi.useFakeTimers();
      
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 3,
        hp: 100,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        energy: 3,
        maxEnergy: 3,
        hp: 100,
        isPlayer: false
      });

      setupGameState({
        characters: [player, enemy],
        currentPlayerId: 'enemy1'
      });

      const state = getGameState();
      state.isProcessingTurn = true;

      const renderCallback = vi.fn();
      await processEnemyTurn(enemy, renderCallback);

      // Should return early
      expect(state.isProcessingTurn).toBe(true);
      
      vi.useRealTimers();
    });

    it('should select card and target in processEnemyTurn', async () => {
      vi.useFakeTimers();
      setApp(mockApp);
      
      const player1 = createMockCharacter({
        id: 'player1',
        name: 'Player 1',
        energy: 3,
        hp: 100,
        isPlayer: true
      });
      const player2 = createMockCharacter({
        id: 'player2',
        name: 'Player 2',
        energy: 3,
        hp: 100,
        isPlayer: true
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        energy: 3,
        maxEnergy: 3,
        hp: 100,
        isPlayer: false
      });

      const card1 = createMockCard({
        id: 'card1',
        name: 'Card 1',
        cost: { energy: 1 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 5 }]
      });
      const card2 = createMockCard({
        id: 'card2',
        name: 'Card 2',
        cost: { energy: 2 },
        targeting: 'enemy',
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player1, player2, enemy],
        cardLibrary: { card1, card2 },
        currentPlayerId: 'enemy1'
      });

      const instanceId1 = createCardInstance('card1');
      const instanceId2 = createCardInstance('card2');
      if (instanceId1 && instanceId2) {
        enemy.hand.push(instanceId1, instanceId2);
      }

      const renderCallback = vi.fn();
      processEnemyTurn(enemy, renderCallback);

      // Fast-forward enough to trigger card selection and initial setup
      vi.advanceTimersByTime(100);
      await vi.runOnlyPendingTimersAsync();

      // Should have started processing
      const state = getGameState();
      expect(state.isProcessingTurn).toBe(true);
      
      vi.useRealTimers();
    });
  });
});

