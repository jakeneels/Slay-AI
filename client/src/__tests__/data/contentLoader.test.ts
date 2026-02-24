import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadContent, normalizeCharacterVisualConfig } from '../../data/contentLoader.js';
import { getModifierRegistry } from '../../core/modifiers.js';

// Mock console methods to avoid noise in test output
const originalWarn = console.warn;
const originalError = console.error;
const originalLog = console.log;

describe('contentLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getModifierRegistry().clearSource('balance');
    console.warn = vi.fn();
    console.error = vi.fn();
    console.log = vi.fn();
  });

  afterEach(() => {
    getModifierRegistry().clearSource('balance');
    console.warn = originalWarn;
    console.error = originalError;
    console.log = originalLog;
  });

  it('loads content from Vite globs with non-empty core datasets', async () => {
    const result = await loadContent();

    expect(Object.keys(result.cards).length).toBeGreaterThan(0);
    expect(Object.keys(result.characters).length).toBeGreaterThan(0);
    expect(Object.keys(result.gear).length).toBeGreaterThan(0);
    expect(Object.keys(result.statuses).length).toBeGreaterThan(0);
  });

  it('keeps card targeting and targetSide in sync for self/ally families', async () => {
    const result = await loadContent();
    const cards = Object.values(result.cards);

    for (const card of cards) {
      if (card.targeting === 'self' || card.targeting === 'slot') {
        expect(card.targetSide).toBe('self');
      }
      if (card.targeting === 'ally' || card.targeting === 'allAllies') {
        expect(card.targetSide).toBe('ally');
      }
    }
  });

  it('parses optional card fields with safe defaults', async () => {
    const result = await loadContent();
    const cards = Object.values(result.cards);

    for (const card of cards) {
      expect(card.cost.energy).toEqual(expect.any(Number));
      expect(card.copies).toEqual(expect.any(Number));
      expect(Array.isArray(card.tags)).toBe(true);
      expect(typeof card.exhaust).toBe('boolean');
      expect(typeof card.expires_after_turns).toBe('number');
    }
  });

  it('parses aoeSlots as optional for aoe cards', async () => {
    const result = await loadContent();
    const aoeCards = Object.values(result.cards).filter(card => card.targeting === 'aoe');

    expect(aoeCards.length).toBeGreaterThan(0);
    for (const card of aoeCards) {
      expect(card.aoeSlots === undefined || typeof card.aoeSlots === 'number').toBe(true);
    }
  });

  it('strips empty animation groups when animationConfig is present', async () => {
    const result = await loadContent();
    const cards = Object.values(result.cards);

    for (const card of cards) {
      if (!card.animationConfig) continue;
      const groups = [card.animationConfig.damage, card.animationConfig.heal, card.animationConfig.jump];
      expect(groups.some(group => group !== undefined)).toBe(true);
    }
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

  it('normalizes lane buff card effect fields', async () => {
    const result = await loadContent();
    const laneBuffCards = Object.values(result.cards).filter(card =>
      card.effects.some(effect => effect.kind === 'lane_buff')
    );

    expect(laneBuffCards.length).toBeGreaterThan(0);
    for (const card of laneBuffCards) {
      for (const effect of card.effects) {
        if (effect.kind !== 'lane_buff') continue;
        expect(effect.duration_turns).toBeGreaterThanOrEqual(1);
        expect(['lane_allies', 'lane_enemies', 'lane_occupants']).toContain(effect.appliesTo ?? 'lane_allies');
        expect(Array.isArray(effect.modifiers)).toBe(true);
        for (const mod of effect.modifiers) {
          expect(typeof mod.target).toBe('string');
          expect(['add', 'multiply', 'set', 'min', 'max']).toContain(mod.op);
          expect(typeof mod.value).toBe('number');
        }
      }
    }
  });

  it('normalizes trigger fields for lane buffs', async () => {
    const result = await loadContent();
    const card = result.cards.lane_sustain;
    expect(card).toBeDefined();
    if (!card) return;

    const effect = card.effects.find(e => e.kind === 'lane_buff');
    expect(effect).toBeDefined();
    if (!effect || effect.kind !== 'lane_buff') return;

    expect(effect.triggers).toBeDefined();
    expect(Array.isArray(effect.triggers)).toBe(true);
    expect(effect.triggers?.length).toBeGreaterThan(0);
    const statusTrigger = effect.triggers?.find(t => t.action === 'apply_status' && t.status === 'regeneration');
    expect(statusTrigger).toBeDefined();
    expect(statusTrigger?.when).toBe('round_start');
    expect(statusTrigger && 'stacks' in statusTrigger ? statusTrigger.stacks : undefined).toBeGreaterThanOrEqual(1);
  });
});

