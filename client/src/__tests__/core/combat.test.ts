import { describe, it, expect, beforeEach, vi } from 'vitest';
import { playCard, endTurn, setApp, processEnemyTurn, calculateAoeTargets, getCharactersByPosition, moveCharacterForward, moveCharacterBack, applyKnockback, canOccupyRange } from '../../core/combat.js';
import { resetGameState, createMockCharacter, createMockCard, createMockCharacterDefinition, setupGameState } from '../utils/test-helpers.js';
import { getGameState } from '../../core/gameState.js';
import { createCardInstance } from '../../core/card.js';
import { SLOTS_PER_SIDE } from '../../core/constants.js';
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
  animateDamageFlash: vi.fn().mockResolvedValue(undefined),
  animateEnhancedScreenShake: vi.fn().mockResolvedValue(undefined),
  animateCameraZoom: vi.fn().mockResolvedValue(undefined),
  animateParticles: vi.fn().mockResolvedValue(undefined),
  registerCharacterSprite: vi.fn(),
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

      // AOE defers render between targets - called after energy consumption, then after all AOE damage + card removal
      expect(renderCallback).toHaveBeenCalledTimes(2);
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

  describe('position-based AOE targeting', () => {
    it('should handle player casting AOE (3 slots) on 3 enemies', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        isPlayer: true,
        slotIndex: 0
      });
      const enemy1 = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy 1',
        hp: 100,
        isPlayer: false,
        slotIndex: 4
      });
      const enemy2 = createMockCharacter({
        id: 'enemy2',
        name: 'Enemy 2',
        hp: 100,
        isPlayer: false,
        slotIndex: 5
      });
      const enemy3 = createMockCharacter({
        id: 'enemy3',
        name: 'Enemy 3',
        hp: 100,
        isPlayer: false,
        slotIndex: 6
      });

      const aoeCard = createMockCard({
        id: 'aoe3',
        name: 'AOE 3 Slots',
        cost: { energy: 2 },
        targeting: 'aoe',
        targetSide: 'enemy',
        aoeSlots: 3,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy1, enemy2, enemy3],
        cardLibrary: { aoe3: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('aoe3');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      // Target middle enemy - should hit all 3 (middle + left + right)
      await playCard(instanceId!, 'enemy2');

      expect(enemy1.hp).toBe(90); // 100 - 10 (hit by AOE)
      expect(enemy2.hp).toBe(90); // 100 - 10 (primary target)
      expect(enemy3.hp).toBe(90); // 100 - 10 (hit by AOE)
    });

    it('should handle player casting AOE (3 slots) on single enemy', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        isPlayer: true,
        slotIndex: 0
      });
      const enemy1 = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy 1',
        hp: 100,
        isPlayer: false,
        slotIndex: 4
      });

      const aoeCard = createMockCard({
        id: 'aoe3',
        name: 'AOE 3 Slots',
        cost: { energy: 2 },
        targeting: 'aoe',
        targetSide: 'enemy',
        aoeSlots: 3,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy1],
        cardLibrary: { aoe3: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('aoe3');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      // Target single enemy with 3-slot AOE - should still hit that enemy
      await playCard(instanceId!, 'enemy1');

      expect(enemy1.hp).toBe(90); // 100 - 10 (valid use case - hits what's available)
    });

    it('should handle enemy casting AOE (3 slots) on 3 players', async () => {
      const player1 = createMockCharacter({
        id: 'player1',
        name: 'Player 1',
        hp: 100,
        isPlayer: true,
        slotIndex: 0
      });
      const player2 = createMockCharacter({
        id: 'player2',
        name: 'Player 2',
        hp: 100,
        isPlayer: true,
        slotIndex: 1
      });
      const player3 = createMockCharacter({
        id: 'player3',
        name: 'Player 3',
        hp: 100,
        isPlayer: true,
        slotIndex: 2
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        energy: 5,
        isPlayer: false,
        slotIndex: 4
      });

      const aoeCard = createMockCard({
        id: 'aoe3',
        name: 'AOE 3 Slots',
        cost: { energy: 2 },
        targeting: 'aoe',
        targetSide: 'enemy',
        aoeSlots: 3,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player1, player2, player3, enemy],
        cardLibrary: { aoe3: aoeCard },
        currentPlayerId: 'enemy1'
      });

      const instanceId = createCardInstance('aoe3');
      if (instanceId) {
        enemy.hand.push(instanceId);
      }

      // Enemy targets middle player - should hit all 3 players
      await playCard(instanceId!, 'player2');

      expect(player1.hp).toBe(90); // 100 - 10 (hit by AOE)
      expect(player2.hp).toBe(90); // 100 - 10 (primary target)
      expect(player3.hp).toBe(90); // 100 - 10 (hit by AOE)
    });

    it('should handle enemy casting AOE on single player', async () => {
      const player1 = createMockCharacter({
        id: 'player1',
        name: 'Player 1',
        hp: 100,
        isPlayer: true,
        slotIndex: 0
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        energy: 5,
        isPlayer: false,
        slotIndex: 4
      });

      const aoeCard = createMockCard({
        id: 'aoe3',
        name: 'AOE 3 Slots',
        cost: { energy: 2 },
        targeting: 'aoe',
        targetSide: 'enemy',
        aoeSlots: 3,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player1, enemy],
        cardLibrary: { aoe3: aoeCard },
        currentPlayerId: 'enemy1'
      });

      const instanceId = createCardInstance('aoe3');
      if (instanceId) {
        enemy.hand.push(instanceId);
      }

      // Enemy targets single player with 3-slot AOE - should hit that player
      await playCard(instanceId!, 'player1');

      expect(player1.hp).toBe(90); // 100 - 10
    });

    it('should handle AOE targeting edge case (2 enemies, target first)', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        isPlayer: true,
        slotIndex: 0
      });
      const enemy1 = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy 1',
        hp: 100,
        isPlayer: false,
        slotIndex: 4
      });
      const enemy2 = createMockCharacter({
        id: 'enemy2',
        name: 'Enemy 2',
        hp: 100,
        isPlayer: false,
        slotIndex: 5
      });

      const aoeCard = createMockCard({
        id: 'aoe3',
        name: 'AOE 3 Slots',
        cost: { energy: 2 },
        targeting: 'aoe',
        targetSide: 'enemy',
        aoeSlots: 3,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy1, enemy2],
        cardLibrary: { aoe3: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('aoe3');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      // Target first enemy - should hit both (first + right neighbor)
      await playCard(instanceId!, 'enemy1');

      expect(enemy1.hp).toBe(90); // 100 - 10
      expect(enemy2.hp).toBe(90); // 100 - 10
    });

    it('should reject AOE targeting wrong side (player targeting player with enemy AOE card)', async () => {
      const player1 = createMockCharacter({
        id: 'player1',
        name: 'Player 1',
        energy: 5,
        isPlayer: true,
        slotIndex: 0
      });
      const player2 = createMockCharacter({
        id: 'player2',
        name: 'Player 2',
        hp: 100,
        isPlayer: true,
        slotIndex: 1
      });

      const aoeCard = createMockCard({
        id: 'aoe3',
        name: 'AOE 3 Slots',
        cost: { energy: 2 },
        targeting: 'aoe',
        targetSide: 'enemy',
        aoeSlots: 3,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player1, player2],
        cardLibrary: { aoe3: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('aoe3');
      if (instanceId) {
        player1.hand.push(instanceId);
      }

      // Try to target player with enemy-targeting AOE - should fail
      await playCard(instanceId!, 'player2');

      // Should not deal damage (validation should fail)
      expect(player2.hp).toBe(100);
    });

    it('should use template targeting when card instance has stale values', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        isPlayer: true,
        slotIndex: 0
      });
      const enemy1 = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy 1',
        hp: 100,
        isPlayer: false,
        slotIndex: 4
      });
      const enemy2 = createMockCharacter({
        id: 'enemy2',
        name: 'Enemy 2',
        hp: 100,
        isPlayer: false,
        slotIndex: 5
      });

      const aoeCard = createMockCard({
        id: 'aoe3',
        name: 'AOE Card',
        cost: { energy: 2 },
        targeting: 'aoe',
        targetSide: 'enemy',
        aoeSlots: 3,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy1, enemy2],
        cardLibrary: { aoe3: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('aoe3');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      // Modify template after instance creation (simulating our game.ts behavior)
      const gameState = getGameState();
      gameState.cardLibrary['aoe3'].targeting = 'aoe';
      gameState.cardLibrary['aoe3'].targetSide = 'enemy';
      gameState.cardLibrary['aoe3'].aoeSlots = 3;

      // Should still work because playCard uses template values
      await playCard(instanceId!, 'enemy1');

      expect(enemy1.hp).toBe(90);
      expect(enemy2.hp).toBe(90);
    });

    it('should handle AOE with 2 slots (primary + right neighbor)', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        isPlayer: true,
        slotIndex: 0
      });

      const enemy1 = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy 1',
        hp: 100,
        isPlayer: false,
        slotIndex: 4
      });

      const enemy2 = createMockCharacter({
        id: 'enemy2',
        name: 'Enemy 2',
        hp: 100,
        isPlayer: false,
        slotIndex: 5
      });

      const enemy3 = createMockCharacter({
        id: 'enemy3',
        name: 'Enemy 3',
        hp: 100,
        isPlayer: false,
        slotIndex: 6
      });

      const aoeCard = createMockCard({
        id: 'aoe2',
        name: 'AOE 2 Slots',
        cost: { energy: 2 },
        targeting: 'aoe',
        targetSide: 'enemy',
        aoeSlots: 2,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy1, enemy2, enemy3],
        cardLibrary: { aoe2: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('aoe2');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      // Target middle enemy (enemy2) - should hit enemy2 and enemy3 (prefer right)
      await playCard(instanceId!, 'enemy2');

      expect(enemy1.hp).toBe(100); // Not hit
      expect(enemy2.hp).toBe(90);  // Primary target
      expect(enemy3.hp).toBe(90);  // Right neighbor
    });

    it('should handle AOE with 2 slots (primary + left neighbor when no right)', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        isPlayer: true,
        slotIndex: 0
      });

      const enemy1 = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy 1',
        hp: 100,
        isPlayer: false,
        slotIndex: 4
      });

      const enemy2 = createMockCharacter({
        id: 'enemy2',
        name: 'Enemy 2',
        hp: 100,
        isPlayer: false,
        slotIndex: 5
      });

      const aoeCard = createMockCard({
        id: 'aoe2',
        name: 'AOE 2 Slots',
        cost: { energy: 2 },
        targeting: 'aoe',
        targetSide: 'enemy',
        aoeSlots: 2,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy1, enemy2],
        cardLibrary: { aoe2: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('aoe2');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      // Target last enemy (enemy2 at slot 5) - 2-slot AOE [5,6] has enemy2; no one at 6
      // rightHits used, only enemy2 hit (fallback requires empty center+right)
      await playCard(instanceId!, 'enemy2');

      expect(enemy1.hp).toBe(100);  // Not hit
      expect(enemy2.hp).toBe(90);   // Primary target
    });

    it('should handle AOE with 4 slots (hits all enemies)', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        isPlayer: true,
        slotIndex: 0
      });

      const enemy1 = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy 1',
        hp: 100,
        isPlayer: false,
        slotIndex: 4
      });

      const enemy2 = createMockCharacter({
        id: 'enemy2',
        name: 'Enemy 2',
        hp: 100,
        isPlayer: false,
        slotIndex: 5
      });

      const enemy3 = createMockCharacter({
        id: 'enemy3',
        name: 'Enemy 3',
        hp: 100,
        isPlayer: false,
        slotIndex: 6
      });

      const enemy4 = createMockCharacter({
        id: 'enemy4',
        name: 'Enemy 4',
        hp: 100,
        isPlayer: false,
        slotIndex: 7
      });

      const aoeCard = createMockCard({
        id: 'aoe4',
        name: 'AOE 4 Slots',
        cost: { energy: 2 },
        targeting: 'aoe',
        targetSide: 'enemy',
        aoeSlots: 4,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy1, enemy2, enemy3, enemy4],
        cardLibrary: { aoe4: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('aoe4');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      // Target any enemy - should hit all enemies regardless of which one is targeted
      await playCard(instanceId!, 'enemy2');

      expect(enemy1.hp).toBe(90);
      expect(enemy2.hp).toBe(90);
      expect(enemy3.hp).toBe(90);
      expect(enemy4.hp).toBe(90);
    });

    it('should default to 3 slots when aoeSlots is not specified', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        isPlayer: true,
        slotIndex: 0
      });

      const enemy1 = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy 1',
        hp: 100,
        isPlayer: false,
        slotIndex: 4
      });

      const enemy2 = createMockCharacter({
        id: 'enemy2',
        name: 'Enemy 2',
        hp: 100,
        isPlayer: false,
        slotIndex: 5
      });

      const enemy3 = createMockCharacter({
        id: 'enemy3',
        name: 'Enemy 3',
        hp: 100,
        isPlayer: false,
        slotIndex: 6
      });

      const aoeCard = createMockCard({
        id: 'aoeDefault',
        name: 'AOE Default',
        cost: { energy: 2 },
        targeting: 'aoe',
        targetSide: 'enemy',
        // aoeSlots not specified - should default to 3
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy1, enemy2, enemy3],
        cardLibrary: { aoeDefault: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('aoeDefault');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      // Target middle enemy - should hit all 3 (default behavior)
      await playCard(instanceId!, 'enemy2');

      expect(enemy1.hp).toBe(90);
      expect(enemy2.hp).toBe(90);
      expect(enemy3.hp).toBe(90);
    });
  });

  describe('getCharactersByPosition', () => {
    it('should return only living enemy characters when side is enemy', () => {
      const player1 = createMockCharacter({
        id: 'player1',
        name: 'Player 1',
        hp: 100,
        isPlayer: true
      });
      const player2 = createMockCharacter({
        id: 'player2',
        name: 'Player 2',
        hp: 100,
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
        hp: 0, // Dead
        isPlayer: false
      });
      const enemy3 = createMockCharacter({
        id: 'enemy3',
        name: 'Enemy 3',
        hp: 50,
        isPlayer: false
      });

      setupGameState({
        characters: [player1, player2, enemy1, enemy2, enemy3]
      });

      const enemies = getCharactersByPosition('enemy');
      
      expect(enemies).toHaveLength(2);
      expect(enemies.map(e => e.id)).toEqual(['enemy1', 'enemy3']);
      expect(enemies.every(e => !e.isPlayer && e.hp > 0)).toBe(true);
    });

    it('should return only living ally characters when side is ally', () => {
      const player1 = createMockCharacter({
        id: 'player1',
        name: 'Player 1',
        hp: 100,
        isPlayer: true
      });
      const player2 = createMockCharacter({
        id: 'player2',
        name: 'Player 2',
        hp: 0, // Dead
        isPlayer: true
      });
      const player3 = createMockCharacter({
        id: 'player3',
        name: 'Player 3',
        hp: 50,
        isPlayer: true
      });
      const enemy1 = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy 1',
        hp: 100,
        isPlayer: false
      });

      setupGameState({
        characters: [player1, player2, player3, enemy1]
      });

      const allies = getCharactersByPosition('ally');
      
      expect(allies).toHaveLength(2);
      expect(allies.map(a => a.id)).toEqual(['player1', 'player3']);
      expect(allies.every(a => a.isPlayer && a.hp > 0)).toBe(true);
    });

    it('should return empty array when no living characters on that side', () => {
      const enemy1 = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy 1',
        hp: 0,
        isPlayer: false
      });

      setupGameState({
        characters: [enemy1]
      });

      const enemies = getCharactersByPosition('enemy');
      const allies = getCharactersByPosition('ally');
      
      expect(enemies).toHaveLength(0);
      expect(allies).toHaveLength(0);
    });
  });

  describe('calculateAoeTargets', () => {
    it('should return all characters when aoeSlots equals side size', () => {
      const enemy1 = createMockCharacter({ id: 'enemy1', hp: 100, isPlayer: false, slotIndex: 4 });
      const enemy2 = createMockCharacter({ id: 'enemy2', hp: 100, isPlayer: false, slotIndex: 5 });
      const enemy3 = createMockCharacter({ id: 'enemy3', hp: 100, isPlayer: false, slotIndex: 6 });

      setupGameState({
        characters: [enemy1, enemy2, enemy3]
      });

      const targets = calculateAoeTargets(4, 'enemy', SLOTS_PER_SIDE);
      
      expect(targets).toHaveLength(3);
      expect(targets.map(t => t.id)).toEqual(['enemy1', 'enemy2', 'enemy3']);
    });

    it('should return no characters when center slot is far from all characters', () => {
      const enemy1 = createMockCharacter({ id: 'enemy1', hp: 100, isPlayer: false, slotIndex: 4 });
      const enemy2 = createMockCharacter({ id: 'enemy2', hp: 100, isPlayer: false, slotIndex: 5 });

      setupGameState({
        characters: [enemy1, enemy2]
      });

      // Center on slot 99, nobody within ±1
      const targets = calculateAoeTargets(99, 'enemy', 3);
      
      expect(targets).toHaveLength(0);
    });

    it('should return empty array when no characters on target side', () => {
      setupGameState({
        characters: []
      });

      const targets = calculateAoeTargets(4, 'enemy', 3);
      
      expect(targets).toHaveLength(0);
    });

    it('should handle 2 slots targeting (center + right)', () => {
      const enemy1 = createMockCharacter({ id: 'enemy1', hp: 100, isPlayer: false, slotIndex: 4 });
      const enemy2 = createMockCharacter({ id: 'enemy2', hp: 100, isPlayer: false, slotIndex: 5 });
      const enemy3 = createMockCharacter({ id: 'enemy3', hp: 100, isPlayer: false, slotIndex: 6 });

      setupGameState({
        characters: [enemy1, enemy2, enemy3]
      });

      // Center on slot 5 - should get slot 5 + slot 6
      const targets = calculateAoeTargets(5, 'enemy', 2);
      
      expect(targets).toHaveLength(2);
      expect(targets.map(t => t.id)).toEqual(['enemy2', 'enemy3']);
    });

    it('should handle 2 slots targeting (center + left when no right)', () => {
      const enemy1 = createMockCharacter({ id: 'enemy1', hp: 100, isPlayer: false, slotIndex: 4 });
      const enemy2 = createMockCharacter({ id: 'enemy2', hp: 100, isPlayer: false, slotIndex: 5 });

      setupGameState({
        characters: [enemy1, enemy2]
      });

      // Center on slot 6 - rightHits [6,7] empty, leftHits [5,6] = [enemy2 at 5]
      const targets = calculateAoeTargets(6, 'enemy', 2);
      
      expect(targets).toHaveLength(1);
      expect(targets[0].id).toBe('enemy2');
    });

    it('should handle 3 slots targeting (center + left + right)', () => {
      const enemy1 = createMockCharacter({ id: 'enemy1', hp: 100, isPlayer: false, slotIndex: 4 });
      const enemy2 = createMockCharacter({ id: 'enemy2', hp: 100, isPlayer: false, slotIndex: 5 });
      const enemy3 = createMockCharacter({ id: 'enemy3', hp: 100, isPlayer: false, slotIndex: 6 });

      setupGameState({
        characters: [enemy1, enemy2, enemy3]
      });

      const targets = calculateAoeTargets(5, 'enemy', 3);
      
      expect(targets).toHaveLength(3);
      expect(targets.map(t => t.id)).toContain('enemy1');
      expect(targets.map(t => t.id)).toContain('enemy2');
      expect(targets.map(t => t.id)).toContain('enemy3');
    });

    it('should default to 3 slots when aoeSlots not specified', () => {
      const enemy1 = createMockCharacter({ id: 'enemy1', hp: 100, isPlayer: false, slotIndex: 4 });
      const enemy2 = createMockCharacter({ id: 'enemy2', hp: 100, isPlayer: false, slotIndex: 5 });
      const enemy3 = createMockCharacter({ id: 'enemy3', hp: 100, isPlayer: false, slotIndex: 6 });

      setupGameState({
        characters: [enemy1, enemy2, enemy3]
      });

      const targets = calculateAoeTargets(5, 'enemy'); // No aoeSlots parameter
      
      expect(targets).toHaveLength(3);
    });

    it('should handle single character on target side', () => {
      const enemy1 = createMockCharacter({ id: 'enemy1', hp: 100, isPlayer: false, slotIndex: 5 });

      setupGameState({
        characters: [enemy1]
      });

      const targets = calculateAoeTargets(5, 'enemy', 3);
      
      expect(targets).toHaveLength(1);
      expect(targets[0].id).toBe('enemy1');
    });

    it('should work with ally side targeting', () => {
      const player1 = createMockCharacter({ id: 'player1', hp: 100, isPlayer: true, slotIndex: 0 });
      const player2 = createMockCharacter({ id: 'player2', hp: 100, isPlayer: true, slotIndex: 1 });
      const player3 = createMockCharacter({ id: 'player3', hp: 100, isPlayer: true, slotIndex: 2 });

      setupGameState({
        characters: [player1, player2, player3]
      });

      const targets = calculateAoeTargets(1, 'ally', 3);
      
      expect(targets).toHaveLength(3);
      expect(targets.map(t => t.id)).toContain('player1');
      expect(targets.map(t => t.id)).toContain('player2');
      expect(targets.map(t => t.id)).toContain('player3');
    });

    it('should exclude dead characters from AOE targeting', () => {
      const enemy1 = createMockCharacter({ id: 'enemy1', hp: 100, isPlayer: false, slotIndex: 4 });
      const enemy2 = createMockCharacter({ id: 'enemy2', hp: 0, isPlayer: false, slotIndex: 5 }); // Dead
      const enemy3 = createMockCharacter({ id: 'enemy3', hp: 100, isPlayer: false, slotIndex: 6 });

      setupGameState({
        characters: [enemy1, enemy2, enemy3]
      });

      // Center on slot 5 — enemy2 is dead, so only enemy1 (slot 4) and enemy3 (slot 6) are living and within ±1
      const targets = calculateAoeTargets(5, 'enemy', 3);
      
      expect(targets).toHaveLength(2);
      expect(targets.map(t => t.id)).toContain('enemy1');
      expect(targets.map(t => t.id)).toContain('enemy3');
      expect(targets.every(t => t.hp > 0)).toBe(true);
    });

    it('should handle AOE targeting first slot (no left neighbor)', () => {
      const enemy1 = createMockCharacter({ id: 'enemy1', hp: 100, isPlayer: false, slotIndex: 4 });
      const enemy2 = createMockCharacter({ id: 'enemy2', hp: 100, isPlayer: false, slotIndex: 5 });
      const enemy3 = createMockCharacter({ id: 'enemy3', hp: 100, isPlayer: false, slotIndex: 6 });

      setupGameState({
        characters: [enemy1, enemy2, enemy3]
      });

      // Center on slot 4 — only slots 3,4,5 in range; enemy1 (4) + enemy2 (5)
      const targets = calculateAoeTargets(4, 'enemy', 3);
      
      expect(targets).toHaveLength(2);
      expect(targets.map(t => t.id)).toContain('enemy1');
      expect(targets.map(t => t.id)).toContain('enemy2');
    });

    it('should handle AOE targeting last slot (no right neighbor)', () => {
      const enemy1 = createMockCharacter({ id: 'enemy1', hp: 100, isPlayer: false, slotIndex: 4 });
      const enemy2 = createMockCharacter({ id: 'enemy2', hp: 100, isPlayer: false, slotIndex: 5 });
      const enemy3 = createMockCharacter({ id: 'enemy3', hp: 100, isPlayer: false, slotIndex: 6 });

      setupGameState({
        characters: [enemy1, enemy2, enemy3]
      });

      // Center on slot 6 — only slots 5,6,7 in range; enemy2 (5) + enemy3 (6)
      const targets = calculateAoeTargets(6, 'enemy', 3);
      
      expect(targets).toHaveLength(2);
      expect(targets.map(t => t.id)).toContain('enemy2');
      expect(targets.map(t => t.id)).toContain('enemy3');
    });

    it('should handle 2 slots with single character (only primary target)', () => {
      const enemy1 = createMockCharacter({ id: 'enemy1', hp: 100, isPlayer: false, slotIndex: 5 });

      setupGameState({
        characters: [enemy1]
      });

      const targets = calculateAoeTargets(5, 'enemy', 2);
      
      expect(targets).toHaveLength(1);
      expect(targets[0].id).toBe('enemy1');
    });

    it('should hit characters on an empty center slot', () => {
      // Allies at slots 0 and 2 with empty slot 1 between them
      const player1 = createMockCharacter({ id: 'player1', hp: 100, isPlayer: true, slotIndex: 0 });
      const player2 = createMockCharacter({ id: 'player2', hp: 100, isPlayer: true, slotIndex: 2 });

      setupGameState({
        characters: [player1, player2]
      });

      // Center on empty slot 1 — both allies at slots 0 and 2 are within ±1
      const targets = calculateAoeTargets(1, 'ally', 3);
      
      expect(targets).toHaveLength(2);
      expect(targets.map(t => t.id)).toContain('player1');
      expect(targets.map(t => t.id)).toContain('player2');
    });

    it('should hit multi-slot targets only once per AOE resolution', () => {
      const giant = createMockCharacter({
        id: 'giant',
        hp: 100,
        isPlayer: false,
        slotIndex: 4,
        slotSize: 2
      });

      setupGameState({
        characters: [giant]
      });

      // Center on slot 5: giant occupies [4,5] but should only appear once.
      const targets = calculateAoeTargets(5, 'enemy', 3);
      expect(targets).toHaveLength(1);
      expect(targets[0].id).toBe('giant');
    });

    it('should handle AOE card that defeats target (hp <= 0 check)', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        isPlayer: true,
        slotIndex: 0
      });

      const enemy1 = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy 1',
        hp: 5, // Low HP - will be defeated
        isPlayer: false,
        slotIndex: 4
      });

      const enemy2 = createMockCharacter({
        id: 'enemy2',
        name: 'Enemy 2',
        hp: 100,
        isPlayer: false,
        slotIndex: 5
      });

      const aoeCard = createMockCard({
        id: 'aoe_kill',
        name: 'AOE Kill',
        cost: { energy: 2 },
        targeting: 'aoe',
        targetSide: 'enemy',
        aoeSlots: 3,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy1, enemy2],
        cardLibrary: { aoe_kill: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('aoe_kill');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      // Target enemy1 - should hit both enemies, enemy1 should be defeated
      await playCard(instanceId!, 'enemy1');

      expect(enemy1.hp).toBe(0); // Defeated
      expect(enemy2.hp).toBe(90); // Hit by AOE
    });

    it('should handle AOE targeting when no app is set', async () => {
      setApp(null); // Clear app
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        isPlayer: true,
        slotIndex: 0
      });

      const enemy1 = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy 1',
        hp: 100,
        isPlayer: false,
        slotIndex: 4
      });

      const aoeCard = createMockCard({
        id: 'aoe_test',
        name: 'AOE Test',
        cost: { energy: 2 },
        targeting: 'aoe',
        targetSide: 'enemy',
        aoeSlots: 2,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy1],
        cardLibrary: { aoe_test: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('aoe_test');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      // Should return early when app is null
      await playCard(instanceId!, 'enemy1');

      // Enemy should not be damaged (early return)
      expect(enemy1.hp).toBe(100);
      
      // Restore app for other tests
      setApp(mockApp);
    });

    it('should handle AOE damage that is fully blocked', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        isPlayer: true,
        slotIndex: 0
      });

      const enemy1 = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy 1',
        hp: 100,
        isPlayer: false,
        slotIndex: 4
      });

      const enemy2 = createMockCharacter({
        id: 'enemy2',
        name: 'Enemy 2',
        hp: 100,
        blockLayers: [{ amount: 100, baseAmount: 100, decay_percent: 50 }], // Enough block to absorb all damage
        isPlayer: false,
        slotIndex: 5
      });

      const aoeCard = createMockCard({
        id: 'weak_aoe',
        name: 'Weak AOE',
        cost: { energy: 2 },
        targeting: 'aoe',
        targetSide: 'enemy',
        aoeSlots: 2,
        effects: [{ kind: 'damage', amount: 5 }]
      });

      setupGameState({
        characters: [player, enemy1, enemy2],
        cardLibrary: { weak_aoe: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('weak_aoe');
      if (instanceId) {
        player.hand.push(instanceId);
      }

      // Target enemy1 - should hit both enemies
      // enemy1 takes damage, enemy2 blocks all
      await playCard(instanceId!, 'enemy1');

      expect(enemy1.hp).toBe(95); // Took damage
      expect(enemy2.hp).toBe(100); // Blocked all damage
      expect(enemy2.blockLayers[0].amount).toBeLessThan(100); // Block was reduced
    });

    it('should handle enemy casting AOE card with targetSide=ally (targeting players)', async () => {
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        energy: 5,
        isPlayer: false,
        slotIndex: 4
      });

      const player1 = createMockCharacter({
        id: 'player1',
        name: 'Player 1',
        hp: 100,
        isPlayer: true,
        slotIndex: 0
      });

      const player2 = createMockCharacter({
        id: 'player2',
        name: 'Player 2',
        hp: 100,
        isPlayer: true,
        slotIndex: 1
      });

      const player3 = createMockCharacter({
        id: 'player3',
        name: 'Player 3',
        hp: 100,
        isPlayer: true,
        slotIndex: 2
      });

      // Enemy AOE card that targets enemies (from enemy's perspective, enemies = players)
      const enemyAoeCard = createMockCard({
        id: 'enemy_aoe_ally',
        name: 'Enemy AOE Ally',
        cost: { energy: 3 },
        targeting: 'aoe',
        targetSide: 'enemy', // Targets opposing side (players)
        aoeSlots: 3,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [enemy, player1, player2, player3],
        cardLibrary: { enemy_aoe_ally: enemyAoeCard },
        currentPlayerId: 'enemy1'
      });

      const instanceId = createCardInstance('enemy_aoe_ally');
      if (instanceId) {
        enemy.hand.push(instanceId);
      }

      // Enemy targets middle player - should hit all 3 players
      await playCard(instanceId!, 'player2');

      expect(player1.hp).toBe(90);
      expect(player2.hp).toBe(90);
      expect(player3.hp).toBe(90);
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
        blockLayers: [{ amount: 100, baseAmount: 100, decay_percent: 20 }],
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

  describe('moveCharacterForward', () => {
    it('should move ally forward when target slot is empty', () => {
      const player = createMockCharacter({ id: 'player1', energy: 3, isPlayer: true, slotIndex: 0 });
      const enemy = createMockCharacter({ id: 'enemy1', isPlayer: false, slotIndex: 2 });
      setupGameState({
        characters: [player, enemy],
        characterLibrary: { player1: createMockCharacterDefinition({ id: 'player1' }) },
        currentPlayerId: 'player1'
      });

      const result = moveCharacterForward('player1');
      expect(result).toBe(true);
      expect(player.slotIndex).toBe(1);
      expect(player.energy).toBe(2);
    });

    it('should swap with ally when ally blocks target slot', () => {
      const player1 = createMockCharacter({ id: 'player1', energy: 3, isPlayer: true, slotIndex: 0 });
      const player2 = createMockCharacter({ id: 'player2', energy: 3, isPlayer: true, slotIndex: 1 });
      const enemy = createMockCharacter({ id: 'enemy1', isPlayer: false, slotIndex: 3 });
      setupGameState({
        characters: [player1, player2, enemy],
        characterLibrary: { player1: createMockCharacterDefinition({ id: 'player1' }) },
        currentPlayerId: 'player1'
      });

      const result = moveCharacterForward('player1');
      expect(result).toBe(true);
      expect(player1.slotIndex).toBe(1);
      expect(player2.slotIndex).toBe(0);
      expect(player1.energy).toBe(2);
    });

    it('should block ally forward movement when target has enemy', () => {
      const player = createMockCharacter({ id: 'player1', energy: 3, isPlayer: true, slotIndex: 1 });
      const enemy1 = createMockCharacter({ id: 'enemy1', isPlayer: false, slotIndex: 2 });
      const enemy2 = createMockCharacter({ id: 'enemy2', isPlayer: false, slotIndex: 3 });
      setupGameState({
        characters: [player, enemy1, enemy2],
        characterLibrary: { player1: createMockCharacterDefinition({ id: 'player1' }) },
        currentPlayerId: 'player1'
      });

      const result = moveCharacterForward('player1');
      expect(result).toBe(false);
      expect(player.slotIndex).toBe(1);
      expect(enemy1.slotIndex).toBe(2);
      expect(enemy2.slotIndex).toBe(3);
    });

    it('should fail when insufficient energy', () => {
      const player = createMockCharacter({ id: 'player1', energy: 0, isPlayer: true, slotIndex: 0 });
      const enemy = createMockCharacter({ id: 'enemy1', isPlayer: false, slotIndex: 2 });
      setupGameState({
        characters: [player, enemy],
        characterLibrary: { player1: createMockCharacterDefinition({ id: 'player1' }) },
        currentPlayerId: 'player1'
      });

      const result = moveCharacterForward('player1');
      expect(result).toBe(false);
      expect(player.slotIndex).toBe(0);
      expect(player.energy).toBe(0);
    });

    it('should fail when character is dead', () => {
      const player = createMockCharacter({ id: 'player1', energy: 3, hp: 0, isPlayer: true, slotIndex: 0 });
      const enemy = createMockCharacter({ id: 'enemy1', isPlayer: false, slotIndex: 2 });
      setupGameState({ characters: [player, enemy], currentPlayerId: 'player1' });

      const result = moveCharacterForward('player1');
      expect(result).toBe(false);
      expect(player.slotIndex).toBe(0);
    });

    it('should use speed to determine move cost (speed -1 = 2 energy per slot)', () => {
      const player = createMockCharacter({ id: 'player1', energy: 3, isPlayer: true, slotIndex: 0, speed: -1 });
      const enemy = createMockCharacter({ id: 'enemy1', isPlayer: false, slotIndex: 2 });
      setupGameState({
        characters: [player, enemy],
        characterLibrary: { player1: createMockCharacterDefinition({ id: 'player1' }) },
        currentPlayerId: 'player1'
      });

      const result = moveCharacterForward('player1');
      expect(result).toBe(true);
      expect(player.energy).toBe(1); // 3 - 2 = 1
    });

    it('should move enemy forward (slotIndex - 1) toward allies', () => {
      const player = createMockCharacter({ id: 'player1', isPlayer: true, slotIndex: 0 });
      const enemy = createMockCharacter({ id: 'enemy1', energy: 3, isPlayer: false, slotIndex: 2 });
      setupGameState({
        characters: [player, enemy],
        characterLibrary: { enemy1: createMockCharacterDefinition({ id: 'enemy1' }) },
        currentPlayerId: 'enemy1'
      });

      const result = moveCharacterForward('enemy1');
      expect(result).toBe(true);
      expect(enemy.slotIndex).toBe(1);
    });

    it('should block enemy forward movement when target has ally', () => {
      const player1 = createMockCharacter({ id: 'player1', isPlayer: true, slotIndex: 0 });
      const player2 = createMockCharacter({ id: 'player2', isPlayer: true, slotIndex: 1 });
      const enemy = createMockCharacter({ id: 'enemy1', energy: 3, isPlayer: false, slotIndex: 2 });
      setupGameState({
        characters: [player1, player2, enemy],
        characterLibrary: { enemy1: createMockCharacterDefinition({ id: 'enemy1' }) },
        currentPlayerId: 'enemy1'
      });

      const result = moveCharacterForward('enemy1');
      expect(result).toBe(false);
      expect(enemy.slotIndex).toBe(2);
      expect(player1.slotIndex).toBe(0);
      expect(player2.slotIndex).toBe(1);
    });

    it('should call renderCallback when provided', () => {
      const player = createMockCharacter({ id: 'player1', energy: 3, isPlayer: true, slotIndex: 0 });
      const enemy = createMockCharacter({ id: 'enemy1', isPlayer: false, slotIndex: 2 });
      setupGameState({ characters: [player, enemy], currentPlayerId: 'player1' });
      const renderCallback = vi.fn();

      moveCharacterForward('player1', renderCallback);
      expect(renderCallback).toHaveBeenCalledTimes(1);
    });

    it('should fail when shift would push character past slot 7', () => {
      const player = createMockCharacter({ id: 'player1', energy: 3, isPlayer: true, slotIndex: 3 });
      const enemy1 = createMockCharacter({ id: 'enemy1', isPlayer: false, slotIndex: 4 });
      const enemy2 = createMockCharacter({ id: 'enemy2', isPlayer: false, slotIndex: 5 });
      const enemy3 = createMockCharacter({ id: 'enemy3', isPlayer: false, slotIndex: 6 });
      const enemy4 = createMockCharacter({ id: 'enemy4', isPlayer: false, slotIndex: 7 });
      setupGameState({
        characters: [player, enemy1, enemy2, enemy3, enemy4],
        characterLibrary: { player1: createMockCharacterDefinition({ id: 'player1' }) },
        currentPlayerId: 'player1'
      });

      const result = moveCharacterForward('player1');
      expect(result).toBe(false);
      expect(player.slotIndex).toBe(3);
      expect(enemy1.slotIndex).toBe(4);
      expect(enemy4.slotIndex).toBe(7);
    });
  });

  describe('moveCharacterBack', () => {
    it('should move ally back when target slot is empty', () => {
      const player = createMockCharacter({ id: 'player1', energy: 3, isPlayer: true, slotIndex: 1 });
      const enemy = createMockCharacter({ id: 'enemy1', isPlayer: false, slotIndex: 2 });
      setupGameState({
        characters: [player, enemy],
        characterLibrary: { player1: createMockCharacterDefinition({ id: 'player1' }) },
        currentPlayerId: 'player1'
      });

      const result = moveCharacterBack('player1');
      expect(result).toBe(true);
      expect(player.slotIndex).toBe(0);
      expect(player.energy).toBe(2);
    });

    it('should swap with ally when ally blocks target slot', () => {
      const player1 = createMockCharacter({ id: 'player1', energy: 3, isPlayer: true, slotIndex: 1 });
      const player2 = createMockCharacter({ id: 'player2', energy: 3, isPlayer: true, slotIndex: 0 });
      const enemy = createMockCharacter({ id: 'enemy1', isPlayer: false, slotIndex: 3 });
      setupGameState({
        characters: [player1, player2, enemy],
        characterLibrary: { player1: createMockCharacterDefinition({ id: 'player1' }) },
        currentPlayerId: 'player1'
      });

      const result = moveCharacterBack('player1');
      expect(result).toBe(true);
      expect(player1.slotIndex).toBe(0);
      expect(player2.slotIndex).toBe(1);
    });

    it('should fail when ally at slot 0 (cannot move back)', () => {
      const player = createMockCharacter({ id: 'player1', energy: 3, isPlayer: true, slotIndex: 0 });
      const enemy = createMockCharacter({ id: 'enemy1', isPlayer: false, slotIndex: 2 });
      setupGameState({
        characters: [player, enemy],
        characterLibrary: { player1: createMockCharacterDefinition({ id: 'player1' }) },
        currentPlayerId: 'player1'
      });

      const result = moveCharacterBack('player1');
      expect(result).toBe(false);
      expect(player.slotIndex).toBe(0);
      expect(player.energy).toBe(3);
    });

    it('should fail when enemy at slot 7 (cannot move back past max)', () => {
      const player = createMockCharacter({ id: 'player1', isPlayer: true, slotIndex: 0 });
      const enemy = createMockCharacter({ id: 'enemy1', energy: 3, isPlayer: false, slotIndex: 7 });
      setupGameState({
        characters: [player, enemy],
        characterLibrary: { enemy1: createMockCharacterDefinition({ id: 'enemy1' }) },
        currentPlayerId: 'enemy1'
      });

      const result = moveCharacterBack('enemy1');
      expect(result).toBe(false);
      expect(enemy.slotIndex).toBe(7);
      expect(enemy.energy).toBe(3);
    });

    it('should fail when insufficient energy', () => {
      const player = createMockCharacter({ id: 'player1', energy: 0, isPlayer: true, slotIndex: 1 });
      const enemy = createMockCharacter({ id: 'enemy1', isPlayer: false, slotIndex: 2 });
      setupGameState({
        characters: [player, enemy],
        characterLibrary: { player1: createMockCharacterDefinition({ id: 'player1' }) },
        currentPlayerId: 'player1'
      });

      const result = moveCharacterBack('player1');
      expect(result).toBe(false);
      expect(player.slotIndex).toBe(1);
    });

    it('should move enemy back (slotIndex + 1) away from allies', () => {
      const player = createMockCharacter({ id: 'player1', isPlayer: true, slotIndex: 0 });
      const enemy = createMockCharacter({ id: 'enemy1', energy: 3, isPlayer: false, slotIndex: 1 });
      setupGameState({
        characters: [player, enemy],
        characterLibrary: { enemy1: createMockCharacterDefinition({ id: 'enemy1' }) },
        currentPlayerId: 'enemy1'
      });

      const result = moveCharacterBack('enemy1');
      expect(result).toBe(true);
      expect(enemy.slotIndex).toBe(2);
    });

    it('should call renderCallback when provided', () => {
      const player = createMockCharacter({ id: 'player1', energy: 3, isPlayer: true, slotIndex: 1 });
      const enemy = createMockCharacter({ id: 'enemy1', isPlayer: false, slotIndex: 2 });
      setupGameState({ characters: [player, enemy], currentPlayerId: 'player1' });
      const renderCallback = vi.fn();

      moveCharacterBack('player1', renderCallback);
      expect(renderCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('multi-slot occupancy', () => {
    it('should block forward movement when any destination footprint slot is occupied', () => {
      const brute = createMockCharacter({
        id: 'brute',
        isPlayer: true,
        energy: 3,
        slotIndex: 0,
        slotSize: 2
      });
      const blocker = createMockCharacter({
        id: 'blocker',
        isPlayer: false,
        slotIndex: 2
      });
      setupGameState({
        characters: [brute, blocker],
        currentPlayerId: 'brute'
      });

      const moved = moveCharacterForward('brute');
      expect(moved).toBe(false);
      expect(brute.slotIndex).toBe(0);
    });

    it('should allow movement when entire footprint is free', () => {
      const brute = createMockCharacter({
        id: 'brute',
        isPlayer: true,
        energy: 3,
        slotIndex: 0,
        slotSize: 2
      });
      const enemy = createMockCharacter({
        id: 'enemy',
        isPlayer: false,
        slotIndex: 4
      });
      setupGameState({
        characters: [brute, enemy],
        currentPlayerId: 'brute'
      });

      const moved = moveCharacterForward('brute');
      expect(moved).toBe(true);
      expect(brute.slotIndex).toBe(1);
    });

    it('should stop knockback when next footprint is blocked', () => {
      const target = createMockCharacter({
        id: 'target',
        isPlayer: false,
        slotIndex: 6,
        slotSize: 2
      });
      const blocker = createMockCharacter({
        id: 'blocker',
        isPlayer: false,
        slotIndex: 8
      });
      setupGameState({
        characters: [target, blocker]
      });

      const moved = applyKnockback(target, 2);
      expect(moved).toBe(0);
      expect(target.slotIndex).toBe(6);
    });

    it('should validate contiguous placement with canOccupyRange', () => {
      const ally = createMockCharacter({
        id: 'ally',
        isPlayer: true,
        slotIndex: 1,
        slotSize: 2
      });
      setupGameState({
        characters: [ally]
      });

      // Proposed range [2,3] overlaps ally footprint [1,2].
      const blocked = canOccupyRange(2, 2, true);
      expect(blocked).toBe(false);

      // Proposed range [4,5] is clear and on ally side.
      const clear = canOccupyRange(4, 2, true);
      expect(clear).toBe(true);
    });
  });

  describe('range modifier in combat', () => {
    it('should deal bonus damage at optimal range', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        hp: 100,
        isPlayer: true,
        slotIndex: 2
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false,
        slotIndex: 5  // distance = 3
      });

      const rangedCard = createMockCard({
        id: 'ranged_attack',
        name: 'Ranged Attack',
        cost: { energy: 1 },
        targeting: 'enemy',
        maxRange: 7,
        optimalRange: 3,  // optimal at distance 3
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { ranged_attack: rangedCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('ranged_attack');
      if (instanceId) player.hand.push(instanceId);

      await playCard(instanceId!, 'enemy1');

      const state = getGameState();
      const target = state.characters.find(c => c.id === 'enemy1')!;
      // At optimal range: 10 * 1.20 = 12 damage → hp = 100 - 12 = 88
      expect(target.hp).toBe(88);
    });

    it('should deal reduced damage away from optimal range', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        hp: 100,
        isPlayer: true,
        slotIndex: 0
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false,
        slotIndex: 5  // distance = 5
      });

      const meleeCard = createMockCard({
        id: 'melee_attack',
        name: 'Melee Attack',
        cost: { energy: 1 },
        targeting: 'enemy',
        maxRange: 7,
        optimalRange: 1,  // optimal at melee range
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { melee_attack: meleeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('melee_attack');
      if (instanceId) player.hand.push(instanceId);

      await playCard(instanceId!, 'enemy1');

      const state = getGameState();
      const target = state.characters.find(c => c.id === 'enemy1')!;
      // Distance 5, optimal 1 → 4 slots away → 1.20 - 0.40 = 0.80
      // 10 * 0.80 = 8 damage → hp = 100 - 8 = 92
      expect(target.hp).toBe(92);
    });

    it('should deal normal damage when optimalRange is not set', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        hp: 100,
        isPlayer: true,
        slotIndex: 0
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false,
        slotIndex: 6
      });

      const basicCard = createMockCard({
        id: 'basic_attack',
        name: 'Basic Attack',
        cost: { energy: 1 },
        targeting: 'enemy',
        // No optimalRange set
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { basic_attack: basicCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('basic_attack');
      if (instanceId) player.hand.push(instanceId);

      await playCard(instanceId!, 'enemy1');

      const state = getGameState();
      const target = state.characters.find(c => c.id === 'enemy1')!;
      // No optimalRange → modifier = 1.0 → 10 damage → hp = 90
      expect(target.hp).toBe(90);
    });

    it('should apply range modifier to AOE damage', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        hp: 100,
        isPlayer: true,
        slotIndex: 3
      });
      const enemy1 = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy 1',
        hp: 100,
        isPlayer: false,
        slotIndex: 5  // primary target, distance = 2
      });
      const enemy2 = createMockCharacter({
        id: 'enemy2',
        name: 'Enemy 2',
        hp: 100,
        isPlayer: false,
        slotIndex: 6
      });

      const aoeCard = createMockCard({
        id: 'aoe_blast',
        name: 'AOE Blast',
        cost: { energy: 2 },
        targeting: 'aoe',
        targetSide: 'enemy',
        aoeSlots: 3,
        maxRange: 5,
        optimalRange: 2,  // optimal at distance 2
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy1, enemy2],
        cardLibrary: { aoe_blast: aoeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('aoe_blast');
      if (instanceId) player.hand.push(instanceId);

      await playCard(instanceId!, 'enemy1');

      const state = getGameState();
      const target1 = state.characters.find(c => c.id === 'enemy1')!;
      const target2 = state.characters.find(c => c.id === 'enemy2')!;
      // Primary target distance 2 = optimal → 10 * 1.20 = 12
      // AOE uses primary target distance for modifier
      expect(target1.hp).toBe(88);
      expect(target2.hp).toBe(88);
    });

    it('should clamp range modifier at minimum floor (0.70)', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        hp: 100,
        isPlayer: true,
        slotIndex: 0
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false,
        slotIndex: 7  // distance = 7
      });

      const meleeCard = createMockCard({
        id: 'close_strike',
        name: 'Close Strike',
        cost: { energy: 1 },
        targeting: 'enemy',
        maxRange: 7,
        optimalRange: 1,  // optimal at 1, distance is 7 → 6 slots away
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { close_strike: meleeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('close_strike');
      if (instanceId) player.hand.push(instanceId);

      await playCard(instanceId!, 'enemy1');

      const state = getGameState();
      const target = state.characters.find(c => c.id === 'enemy1')!;
      // Distance 7, optimal 1 → 6 slots away → modifier = max(0.70, 1.20 - 0.60) = 0.70
      // 10 * 0.70 = 7 → hp = 93
      expect(target.hp).toBe(93);
    });

    it('should not apply range modifier to self-targeting cards', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        hp: 80,
        maxHp: 100,
        isPlayer: true,
        slotIndex: 0
      });

      const selfHeal = createMockCard({
        id: 'self_heal',
        name: 'Self Heal',
        cost: { energy: 1 },
        targeting: 'self',
        optimalRange: 1,  // shouldn't matter for self-targeting
        effects: [{ kind: 'heal', amount: 10 }]
      });

      setupGameState({
        characters: [player],
        cardLibrary: { self_heal: selfHeal },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('self_heal');
      if (instanceId) player.hand.push(instanceId);

      await playCard(instanceId!, undefined);

      const state = getGameState();
      const p = state.characters.find(c => c.id === 'player1')!;
      // Heal is not affected by range modifier (only damage is)
      expect(p.hp).toBe(90);
    });

    it('should still block cards beyond maxRange', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        hp: 100,
        isPlayer: true,
        slotIndex: 0
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false,
        slotIndex: 5  // distance = 5
      });

      const shortRangeCard = createMockCard({
        id: 'short_range',
        name: 'Short Range',
        cost: { energy: 1 },
        targeting: 'enemy',
        maxRange: 3,
        optimalRange: 1,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { short_range: shortRangeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('short_range');
      if (instanceId) player.hand.push(instanceId);

      await playCard(instanceId!, 'enemy1');

      const state = getGameState();
      const target = state.characters.find(c => c.id === 'enemy1')!;
      // Distance 5 > maxRange 3 → card should not play, no damage
      expect(target.hp).toBe(100);
      // Energy should not be consumed
      const p = state.characters.find(c => c.id === 'player1')!;
      expect(p.energy).toBe(5);
    });

    it('should block cards when target is closer than minRange', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        hp: 100,
        isPlayer: true,
        slotIndex: 0
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false,
        slotIndex: 1  // distance = 1
      });

      const longRangeCard = createMockCard({
        id: 'long_range',
        name: 'Long Range Blast',
        cost: { energy: 1 },
        targeting: 'enemy',
        minRange: 3,
        maxRange: 7,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { long_range: longRangeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('long_range');
      if (instanceId) player.hand.push(instanceId);

      await playCard(instanceId!, 'enemy1');

      const state = getGameState();
      const target = state.characters.find(c => c.id === 'enemy1')!;
      // Distance 1 < minRange 3 → card should not play, no damage
      expect(target.hp).toBe(100);
      // Energy should not be consumed
      const p = state.characters.find(c => c.id === 'player1')!;
      expect(p.energy).toBe(5);
    });

    it('should allow cards when target is exactly at minRange', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        hp: 100,
        isPlayer: true,
        slotIndex: 0
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false,
        slotIndex: 3  // distance = 3
      });

      const longRangeCard = createMockCard({
        id: 'long_range',
        name: 'Long Range Blast',
        cost: { energy: 1 },
        targeting: 'enemy',
        minRange: 3,
        maxRange: 7,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { long_range: longRangeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('long_range');
      if (instanceId) player.hand.push(instanceId);

      await playCard(instanceId!, 'enemy1');

      const state = getGameState();
      const target = state.characters.find(c => c.id === 'enemy1')!;
      // Distance 3 == minRange 3 → card should play, damage dealt
      expect(target.hp).toBeLessThan(100);
      // Energy should be consumed
      const p = state.characters.find(c => c.id === 'player1')!;
      expect(p.energy).toBe(4);
    });

    it('should allow cards when target is between minRange and maxRange', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        hp: 100,
        isPlayer: true,
        slotIndex: 0
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false,
        slotIndex: 5  // distance = 5
      });

      const longRangeCard = createMockCard({
        id: 'long_range',
        name: 'Long Range Blast',
        cost: { energy: 1 },
        targeting: 'enemy',
        minRange: 3,
        maxRange: 7,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { long_range: longRangeCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('long_range');
      if (instanceId) player.hand.push(instanceId);

      await playCard(instanceId!, 'enemy1');

      const state = getGameState();
      const target = state.characters.find(c => c.id === 'enemy1')!;
      // Distance 5, within minRange 3 – maxRange 7 → card should play
      expect(target.hp).toBeLessThan(100);
      const p = state.characters.find(c => c.id === 'player1')!;
      expect(p.energy).toBe(4);
    });

    it('should enforce minRange without maxRange', async () => {
      const player = createMockCharacter({
        id: 'player1',
        name: 'Player',
        energy: 5,
        hp: 100,
        isPlayer: true,
        slotIndex: 0
      });
      const enemy = createMockCharacter({
        id: 'enemy1',
        name: 'Enemy',
        hp: 100,
        isPlayer: false,
        slotIndex: 1  // distance = 1
      });

      const minOnlyCard = createMockCard({
        id: 'min_only',
        name: 'Artillery',
        cost: { energy: 1 },
        targeting: 'enemy',
        minRange: 2,
        effects: [{ kind: 'damage', amount: 10 }]
      });

      setupGameState({
        characters: [player, enemy],
        cardLibrary: { min_only: minOnlyCard },
        currentPlayerId: 'player1'
      });

      const instanceId = createCardInstance('min_only');
      if (instanceId) player.hand.push(instanceId);

      await playCard(instanceId!, 'enemy1');

      const state = getGameState();
      const target = state.characters.find(c => c.id === 'enemy1')!;
      // Distance 1 < minRange 2 → card should not play
      expect(target.hp).toBe(100);
      const p = state.characters.find(c => c.id === 'player1')!;
      expect(p.energy).toBe(5);
    });
  });
});

