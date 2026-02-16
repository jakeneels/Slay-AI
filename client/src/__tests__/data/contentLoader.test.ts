import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadContent, normalizeCharacterVisualConfig } from '../../data/contentLoader.js';
import jsyaml from 'js-yaml';

// Mock fetch
global.fetch = vi.fn();

// Mock console methods to avoid noise in test output
const originalWarn = console.warn;
const originalError = console.error;
const originalLog = console.log;

describe('contentLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch mock completely
    (global.fetch as any).mockReset();
    console.warn = vi.fn();
    console.error = vi.fn();
    console.log = vi.fn();
  });

  afterEach(() => {
    console.warn = originalWarn;
    console.error = originalError;
    console.log = originalLog;
  });

  it('should load cards and characters from YAML files', async () => {
    const mockCardYaml = {
      id: 'test_card',
      name: 'Test Card',
      cost: 2,
      targeting: 'enemy',
      effects: [{ kind: 'damage', amount: 5 }]
    };

    const mockCharacterYaml = {
      id: 'test_character',
      name: 'Test Character',
      hp: 100,
      maxHp: 100,
      energy: 3,
      maxEnergy: 3,
      isPlayer: true,
      deck: []
    };

    const mockEnemyYaml = {
      id: 'test_enemy',
      name: 'Test Enemy',
      hp: 50,
      maxHp: 50,
      energy: 2,
      maxEnergy: 2,
      isPlayer: false,
      deck: []
    };

    // Mock fetch responses
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => jsyaml.dump(mockCardYaml)
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => jsyaml.dump(mockCardYaml)
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => jsyaml.dump(mockCardYaml)
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => jsyaml.dump(mockCardYaml)
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => jsyaml.dump(mockCardYaml)
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => jsyaml.dump(mockCardYaml)
      })
      // Character files
      .mockResolvedValueOnce({
        ok: true,
        text: async () => jsyaml.dump(mockCharacterYaml)
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => jsyaml.dump(mockCharacterYaml)
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => jsyaml.dump(mockCharacterYaml)
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => jsyaml.dump(mockCharacterYaml)
      })
      // Enemy files
      .mockResolvedValueOnce({
        ok: true,
        text: async () => jsyaml.dump(mockEnemyYaml)
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => jsyaml.dump(mockEnemyYaml)
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => jsyaml.dump(mockEnemyYaml)
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => jsyaml.dump(mockEnemyYaml)
      });

    const result = await loadContent();

    expect(result.cards).toHaveProperty('test_card');
    expect(result.cards['test_card'].id).toBe('test_card');
    expect(result.cards['test_card'].name).toBe('Test Card');
    expect(result.cards['test_card'].cost.energy).toBe(2);
    expect(result.characters).toHaveProperty('test_character');
    expect(result.characters['test_character'].id).toBe('test_character');
  });

  it('should handle self targeting correctly', async () => {
    const mockCardYaml = {
      id: 'self_card',
      name: 'Self Card',
      cost: 1,
      targeting: 'self',
      effects: [{ kind: 'heal', amount: 10 }]
    };

    const mockCharacterYaml = { id: 'test_character', name: 'Test', hp: 100, maxHp: 100, isPlayer: true, deck: [] };
    const mockEnemyYaml = { id: 'test_enemy', name: 'Enemy', hp: 50, maxHp: 50, isPlayer: false, deck: [] };

    // Mock fetch: 3 card files, 4 character files, 4 enemy files = 11 total
    (global.fetch as any)
      // 3 card files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      // 4 character files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      // 4 enemy files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) });

    const result = await loadContent();

    expect(result.cards['self_card']).toBeDefined();
    expect(result.cards['self_card'].targetSide).toBe('self');
    expect(result.cards['self_card'].targeting).toBe('self');
  });

  it('should handle ally targeting correctly', async () => {
    const mockCardYaml = {
      id: 'ally_card',
      name: 'Ally Card',
      cost: 1,
      targeting: 'ally',
      effects: [{ kind: 'heal', amount: 10 }]
    };

    const mockCharacterYaml = { id: 'test_character', name: 'Test', hp: 100, maxHp: 100, isPlayer: true, deck: [] };
    const mockEnemyYaml = { id: 'test_enemy', name: 'Enemy', hp: 50, maxHp: 50, isPlayer: false, deck: [] };

    // Mock fetch: 3 card files, 4 character files, 4 enemy files = 11 total
    (global.fetch as any)
      // 3 card files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      // 4 character files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      // 4 enemy files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) });

    const result = await loadContent();

    expect(result.cards['ally_card']).toBeDefined();
    expect(result.cards['ally_card'].targetSide).toBe('ally');
    expect(result.cards['ally_card'].targeting).toBe('ally');
  });

  it('should handle allEnemies targeting correctly', async () => {
    const mockCardYaml = {
      id: 'aoe_card',
      name: 'AOE Card',
      cost: 3,
      targeting: 'allEnemies',
      effects: [{ kind: 'aoe_damage', amount: 10 }]
    };

    const mockCharacterYaml = { id: 'test_character', name: 'Test', hp: 100, maxHp: 100, isPlayer: true, deck: [] };
    const mockEnemyYaml = { id: 'test_enemy', name: 'Enemy', hp: 50, maxHp: 50, isPlayer: false, deck: [] };

    // Mock fetch: 3 card files, 4 character files, 4 enemy files = 11 total
    (global.fetch as any)
      // 3 card files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      // 4 character files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      // 4 enemy files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) });

    const result = await loadContent();

    expect(result.cards['aoe_card']).toBeDefined();
    expect(result.cards['aoe_card'].targetSide).toBe('enemy');
    expect(result.cards['aoe_card'].targeting).toBe('allEnemies');
  });

  it('should handle allAllies targeting correctly', async () => {
    const mockCardYaml = {
      id: 'mass_heal',
      name: 'Mass Heal',
      cost: 2,
      targeting: 'allAllies',
      effects: [{ kind: 'heal', amount: 20 }]
    };

    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      // Character files
      .mockResolvedValue({ ok: true, text: async () => jsyaml.dump({ id: 'test' }) });

    const result = await loadContent();

    expect(result.cards['mass_heal'].targetSide).toBe('ally');
    expect(result.cards['mass_heal'].targeting).toBe('allAllies');
  });

  it('should handle animation config parsing', async () => {
    const mockCardYaml = {
      id: 'animated_card',
      name: 'Animated Card',
      cost: 2,
      targeting: 'enemy',
      effects: [{ kind: 'damage', amount: 10 }],
      animation: {
        damage: {
          projectileColor: 0xff0000,
          projectileSpeed: 1500,
          impactSize: 60
        }
      }
    };

    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      // Character files
      .mockResolvedValue({ ok: true, text: async () => jsyaml.dump({ id: 'test' }) });

    const result = await loadContent();

    expect(result.cards['animated_card'].animationConfig).toBeDefined();
    expect(result.cards['animated_card'].animationConfig?.damage?.projectileColor).toBe(0xff0000);
    expect(result.cards['animated_card'].animationConfig?.damage?.projectileSpeed).toBe(1500);
    expect(result.cards['animated_card'].animationConfig?.damage?.impactSize).toBe(60);
  });

  it('should handle heal animation config', async () => {
    const mockCardYaml = {
      id: 'heal_card',
      name: 'Heal Card',
      cost: 1,
      targeting: 'self',
      effects: [{ kind: 'heal', amount: 20 }],
      animation: {
        heal: {
          particleColor: 0x00ff00,
          glowIntensity: 0.5
        }
      }
    };

    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      // Character files
      .mockResolvedValue({ ok: true, text: async () => jsyaml.dump({ id: 'test' }) });

    const result = await loadContent();

    expect(result.cards['heal_card'].animationConfig).toBeDefined();
    expect(result.cards['heal_card'].animationConfig?.heal?.particleColor).toBe(0x00ff00);
    expect(result.cards['heal_card'].animationConfig?.heal?.glowIntensity).toBe(0.5);
  });

  it('should clear animationConfig when both damage and heal are empty', async () => {
    const mockCardYaml = {
      id: 'empty_anim_card',
      name: 'Empty Anim Card',
      cost: 1,
      targeting: 'enemy',
      effects: [{ kind: 'damage', amount: 5 }],
      animation: {
        damage: {}, // Empty damage config
        heal: {} // Empty heal config
      }
    };

    const mockCharacterYaml = { id: 'test_character', name: 'Test', hp: 100, maxHp: 100, isPlayer: true, deck: [] };
    const mockEnemyYaml = { id: 'test_enemy', name: 'Enemy', hp: 50, maxHp: 50, isPlayer: false, deck: [] };

    // Mock fetch: 3 card files, 4 character files, 4 enemy files = 11 total
    (global.fetch as any)
      // 3 card files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      // 4 character files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      // 4 enemy files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) });

    const result = await loadContent();

    expect(result.cards['empty_anim_card']).toBeDefined();
    // animationConfig should be undefined when both damage and heal are empty
    expect(result.cards['empty_anim_card'].animationConfig).toBeUndefined();
  });

  it('should handle card with optional fields', async () => {
    const mockCardYaml = {
      id: 'optional_card',
      name: 'Optional Card',
      cost: 1,
      targeting: 'enemy',
      effects: [{ kind: 'damage', amount: 5 }],
      copies: 3,
      type: 'skill',
      tags: ['melee'],
      exhaust: true,
      expires_after_turns: 2,
      rarity: 'rare'
    };

    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      // Character files
      .mockResolvedValue({ ok: true, text: async () => jsyaml.dump({ id: 'test' }) });

    const result = await loadContent();

    expect(result.cards['optional_card'].copies).toBe(3);
    expect(result.cards['optional_card'].type).toBe('skill');
    expect(result.cards['optional_card'].tags).toEqual(['melee']);
    expect(result.cards['optional_card'].exhaust).toBe(true);
    expect(result.cards['optional_card'].expires_after_turns).toBe(2);
    expect(result.cards['optional_card'].rarity).toBe('rare');
  });

  it('should use default values for optional fields', async () => {
    const mockCardYaml = {
      id: 'default_card',
      name: 'Default Card',
      cost: 1,
      targeting: 'enemy',
      effects: [{ kind: 'damage', amount: 5 }]
    };

    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      // Character files
      .mockResolvedValue({ ok: true, text: async () => jsyaml.dump({ id: 'test' }) });

    const result = await loadContent();

    expect(result.cards['default_card'].copies).toBe(1);
    expect(result.cards['default_card'].tags).toEqual([]);
    expect(result.cards['default_card'].exhaust).toBe(false);
    expect(result.cards['default_card'].expires_after_turns).toBe(0);
  });

  it('should handle fetch failures gracefully', async () => {
    (global.fetch as any)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'test_card', name: 'Test', cost: 1, targeting: 'enemy', effects: [] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'test_card', name: 'Test', cost: 1, targeting: 'enemy', effects: [] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'test_card', name: 'Test', cost: 1, targeting: 'enemy', effects: [] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'test_card', name: 'Test', cost: 1, targeting: 'enemy', effects: [] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'test_card', name: 'Test', cost: 1, targeting: 'enemy', effects: [] }) })
      // Character files
      .mockResolvedValue({ ok: true, text: async () => jsyaml.dump({ id: 'test' }) });

    const result = await loadContent();

    // Should still return valid result with other cards loaded
    expect(result).toBeDefined();
    expect(result.cards).toBeDefined();
    expect(result.characters).toBeDefined();
  });

  it('should handle enemy file loading errors', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'test_card', name: 'Test', cost: 1, targeting: 'enemy', effects: [] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'test_card', name: 'Test', cost: 1, targeting: 'enemy', effects: [] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'test_card', name: 'Test', cost: 1, targeting: 'enemy', effects: [] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'test_card', name: 'Test', cost: 1, targeting: 'enemy', effects: [] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'test_card', name: 'Test', cost: 1, targeting: 'enemy', effects: [] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'test_card', name: 'Test', cost: 1, targeting: 'enemy', effects: [] }) })
      // Character files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'test' }) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'test' }) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'test' }) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'test' }) })
      // Enemy files - one fails
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'enemy1', name: 'Enemy', hp: 50, maxHp: 50, energy: 2, maxEnergy: 2, isPlayer: false, deck: [] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'enemy2', name: 'Enemy', hp: 50, maxHp: 50, energy: 2, maxEnergy: 2, isPlayer: false, deck: [] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump({ id: 'enemy3', name: 'Enemy', hp: 50, maxHp: 50, energy: 2, maxEnergy: 2, isPlayer: false, deck: [] }) });

    const result = await loadContent();

    // Should continue loading other enemies
    expect(result.characters).toBeDefined();
  });

  it('should parse aoeSlots from YAML', async () => {
    const mockCardYaml = {
      id: 'aoe_card_with_slots',
      name: 'AOE Card with Slots',
      cost: 3,
      targeting: 'aoe',
      aoeSlots: 2,
      effects: [{ kind: 'damage', amount: 10 }]
    };

    const mockCharacterYaml = { id: 'test_character', name: 'Test', hp: 100, maxHp: 100, isPlayer: true, deck: [] };
    const mockEnemyYaml = { id: 'test_enemy', name: 'Enemy', hp: 50, maxHp: 50, isPlayer: false, deck: [] };

    // Mock fetch: 3 card files, 4 character files, 4 enemy files = 11 total
    (global.fetch as any)
      // 3 card files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      // 4 character files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      // 4 enemy files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) });

    const result = await loadContent();

    expect(result.cards['aoe_card_with_slots']).toBeDefined();
    expect(result.cards['aoe_card_with_slots'].targeting).toBe('aoe');
    expect(result.cards['aoe_card_with_slots'].aoeSlots).toBe(2);
  });

  it('should handle aoeSlots being undefined (optional field)', async () => {
    const mockCardYaml = {
      id: 'aoe_card_no_slots',
      name: 'AOE Card No Slots',
      cost: 3,
      targeting: 'aoe',
      // aoeSlots not specified
      effects: [{ kind: 'damage', amount: 10 }]
    };

    const mockCharacterYaml = { id: 'test_character', name: 'Test', hp: 100, maxHp: 100, isPlayer: true, deck: [] };
    const mockEnemyYaml = { id: 'test_enemy', name: 'Enemy', hp: 50, maxHp: 50, isPlayer: false, deck: [] };

    // Mock fetch: 3 card files, 4 character files, 4 enemy files = 11 total
    (global.fetch as any)
      // 3 card files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCardYaml) })
      // 4 character files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockCharacterYaml) })
      // 4 enemy files
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) })
      .mockResolvedValueOnce({ ok: true, text: async () => jsyaml.dump(mockEnemyYaml) });

    const result = await loadContent();

    expect(result.cards['aoe_card_no_slots']).toBeDefined();
    expect(result.cards['aoe_card_no_slots'].targeting).toBe('aoe');
    expect(result.cards['aoe_card_no_slots'].aoeSlots).toBeUndefined();
  });

  it('should return empty objects on complete failure', async () => {
    // Mock fetch to reject for all calls
    (global.fetch as any).mockImplementation(() => {
      return Promise.reject(new Error('Complete failure'));
    });

    const result = await loadContent();

    // On complete failure, should return empty objects (cards and characters arrays are empty)
    expect(Object.keys(result.cards)).toHaveLength(0);
    expect(Object.keys(result.characters)).toHaveLength(0);
  });

  it('should normalize visual profile from legacy sprite fields', () => {
    const normalized = normalizeCharacterVisualConfig({
      id: 'legacy_char',
      spriteScale: 1.25,
      spriteAnchorX: 0.3,
      spriteAnchorY: 0.8,
      spriteOffsetX: 12,
      spriteOffsetY: -6,
    });

    expect(normalized.visual?.scale).toBe(1.25);
    expect(normalized.visual?.anchorX).toBe(0.3);
    expect(normalized.visual?.anchorY).toBe(0.8);
    expect(normalized.visual?.offsetX).toBe(12);
    expect(normalized.visual?.offsetY).toBe(-6);
  });

  it('should infer small preset when scale is tiny', () => {
    const normalized = normalizeCharacterVisualConfig({
      id: 'tiny_enemy',
      spriteScale: 0.5,
    });

    expect(normalized.visual?.preset).toBe('small');
    expect(normalized.visual?.anchorY).toBe(1);
  });
});

