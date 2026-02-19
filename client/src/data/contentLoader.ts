// Content loading from YAML files
// Uses Vite's import.meta.glob to auto-discover all YAML content at build time.
// Just drop a .yaml file into the appropriate folder and it gets loaded automatically.

import jsyaml from 'js-yaml';
import type {
  Card,
  CardEffect,
  CharacterDefinition,
  CharacterVisualPreset,
  GearDefinition,
  StatusDefinition,
  StatusCadence,
  DecayMode,
  LoadedContent,
  EffectTarget,
  AoePattern,
  GameModifier,
  ModifierScope,
} from '../core/types.js';
import { getModifierRegistry } from '../core/modifiers.js';

// Auto-discover all YAML files via Vite glob imports (eager, raw strings)
const cardYamlModules = import.meta.glob('/content/core/cards/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const characterYamlModules = import.meta.glob('/content/core/characters/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const enemyYamlModules = import.meta.glob('/content/core/enemies/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const gearYamlModules = import.meta.glob('/content/core/gear/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const statusYamlModules = import.meta.glob('/content/core/statuses/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const balanceYamlModules = import.meta.glob('/content/core/balance.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const VISUAL_PRESET_DEFAULTS: Record<CharacterVisualPreset, Required<NonNullable<CharacterDefinition['visual']>>> = {
  humanoid: { preset: 'humanoid', scale: 1, anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 0 },
  small: { preset: 'small', scale: 0.8, anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 0 },
  large: { preset: 'large', scale: 1.35, anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 0 },
  beast: { preset: 'beast', scale: 1.1, anchorX: 0.5, anchorY: 0.9, offsetX: 0, offsetY: 0 },
};

function clamp01(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeSlotSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  const whole = Math.floor(value);
  return Math.max(1, Math.min(3, whole));
}

function normalizeAggression(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 5;
  return Math.max(0, Math.min(10, value));
}

function inferPreset(charData: any): CharacterVisualPreset {
  const explicit = charData.visual?.preset ?? charData.spriteVisualPreset;
  if (explicit && VISUAL_PRESET_DEFAULTS[explicit as CharacterVisualPreset]) {
    return explicit as CharacterVisualPreset;
  }

  const scaleHint = toFiniteNumber(charData.visual?.scale ?? charData.spriteScale, 1);
  if (scaleHint >= 1.45) return 'large';
  if (scaleHint <= 0.65) return 'small';
  return 'humanoid';
}

export function normalizeCharacterVisualConfig(charData: any): CharacterDefinition {
  const preset = inferPreset(charData);
  const presetDefaults = VISUAL_PRESET_DEFAULTS[preset];
  const visualInput = charData.visual ?? {};

  const visual = {
    preset,
    scale: toFiniteNumber(visualInput.scale ?? charData.spriteScale, presetDefaults.scale),
    anchorX: clamp01(toFiniteNumber(visualInput.anchorX ?? charData.spriteAnchorX, presetDefaults.anchorX), presetDefaults.anchorX),
    anchorY: clamp01(toFiniteNumber(visualInput.anchorY ?? charData.spriteAnchorY, presetDefaults.anchorY), presetDefaults.anchorY),
    offsetX: toFiniteNumber(visualInput.offsetX ?? charData.spriteOffsetX, presetDefaults.offsetX),
    offsetY: toFiniteNumber(visualInput.offsetY ?? charData.spriteOffsetY, presetDefaults.offsetY),
  };

  return {
    ...charData,
    slotSize: normalizeSlotSize(charData.slotSize),
    visual,
    // Keep legacy fields in sync so older renderer/tests stay stable.
    spriteScale: visual.scale,
    spriteAnchorX: visual.anchorX,
    spriteAnchorY: visual.anchorY,
    spriteOffsetX: visual.offsetX,
    spriteOffsetY: visual.offsetY,
    spriteVisualPreset: visual.preset,
  } as CharacterDefinition;
}

/**
 * Load YAML content (cards, characters, enemies)
 */
export async function loadContent(): Promise<LoadedContent> {
  try {
    const cards: Record<string, Card> = {};
    const characters: Record<string, CharacterDefinition> = {};
    
    // --- Load all card YAML files ---
    for (const [filePath, yamlText] of Object.entries(cardYamlModules)) {
      try {
        const cardData = jsyaml.load(yamlText) as any;
        // Determine targetSide from targeting
        let targetSide: 'self' | 'ally' | 'enemy' = 'enemy';
        if (cardData.targeting === 'self' || cardData.targeting === 'slot') {
          targetSide = 'self';
        } else if (cardData.targeting === 'ally' || cardData.targeting === 'allAllies') {
          targetSide = 'ally';
        } else {
          targetSide = 'enemy';
        }
        // Allow explicit targetSide override from YAML (e.g., AOE cards targeting allies)
        if (cardData.targetSide === 'ally' || cardData.targetSide === 'enemy' || cardData.targetSide === 'self') {
          targetSide = cardData.targetSide;
        }
        
        // Determine targeting - use YAML value if it's a valid targeting type, otherwise derive from targetSide
        let targeting: 'single' | 'aoe' | 'self' | 'ally' | 'enemy' | 'allEnemies' | 'allAllies' | 'slot' = 'single';
        if (cardData.targeting === 'allEnemies' || cardData.targeting === 'allAllies') {
          targeting = cardData.targeting;
        } else if (cardData.targeting === 'aoe') {
          targeting = 'aoe';
        } else if (
          cardData.targeting === 'self' ||
          cardData.targeting === 'ally' ||
          cardData.targeting === 'enemy' ||
          cardData.targeting === 'slot'
        ) {
          targeting = cardData.targeting;
        } else {
          // Default to 'single' for backwards compatibility
          targeting = 'single';
        }
        
        // Parse optional animation config
        let animationConfig: Card['animationConfig'] = undefined;
        if (cardData.animation) {
          animationConfig = {};
          if (cardData.animation.damage) {
            animationConfig.damage = {
              projectileColor: cardData.animation.damage.projectileColor,
              projectileSpeed: cardData.animation.damage.projectileSpeed,
              impactSize: cardData.animation.damage.impactSize,
            };
            // Remove undefined fields
            if (!animationConfig.damage.projectileColor) delete animationConfig.damage.projectileColor;
            if (!animationConfig.damage.projectileSpeed) delete animationConfig.damage.projectileSpeed;
            if (!animationConfig.damage.impactSize) delete animationConfig.damage.impactSize;
            if (Object.keys(animationConfig.damage).length === 0) delete animationConfig.damage;
          }
          if (cardData.animation.heal) {
            animationConfig.heal = {
              particleColor: cardData.animation.heal.particleColor,
              glowIntensity: cardData.animation.heal.glowIntensity,
            };
            // Remove undefined fields
            if (!animationConfig.heal.particleColor) delete animationConfig.heal.particleColor;
            if (!animationConfig.heal.glowIntensity) delete animationConfig.heal.glowIntensity;
            if (Object.keys(animationConfig.heal).length === 0) delete animationConfig.heal;
          }
          if (cardData.animation.jump) {
            animationConfig.jump = {
              anticipationMs: cardData.animation.jump.anticipationMs,
              arcMs: cardData.animation.jump.arcMs,
              landingMs: cardData.animation.jump.landingMs,
              arcHeight: cardData.animation.jump.arcHeight,
            };
            if (!animationConfig.jump.anticipationMs) delete animationConfig.jump.anticipationMs;
            if (!animationConfig.jump.arcMs) delete animationConfig.jump.arcMs;
            if (!animationConfig.jump.landingMs) delete animationConfig.jump.landingMs;
            if (!animationConfig.jump.arcHeight) delete animationConfig.jump.arcHeight;
            if (Object.keys(animationConfig.jump).length === 0) delete animationConfig.jump;
          }
          // Remove animationConfig if it's empty
          if (!animationConfig.damage && !animationConfig.heal && !animationConfig.jump) {
            animationConfig = undefined;
          }
        }
        
        // Parse effects with per-effect targeting fields
        const parsedEffects: CardEffect[] = (cardData.effects ?? []).map((e: any) => {
          const parsed: any = { ...e };
          if (parsed.kind === 'jump') {
            parsed.amount = typeof parsed.amount === 'number' ? parsed.amount : 0;
            parsed.destination = parsed.destination === 'anyEmptySlot' ? 'anyEmptySlot' : 'anyEmptySlot';
            if (parsed.rangeLimit !== undefined && typeof parsed.rangeLimit !== 'number') {
              delete parsed.rangeLimit;
            }
            if (parsed.energyPerEnemyJumped !== undefined && typeof parsed.energyPerEnemyJumped !== 'number') {
              delete parsed.energyPerEnemyJumped;
            }
            if (parsed.energyPerOccupiedSlot !== undefined && typeof parsed.energyPerOccupiedSlot !== 'number') {
              delete parsed.energyPerOccupiedSlot;
            }
          }
          if (parsed.kind === 'thorns') {
            parsed.stacks = typeof parsed.stacks === 'number' ? Math.max(1, Math.floor(parsed.stacks)) : 1;
            parsed.reflectDamage = typeof parsed.reflectDamage === 'number' ? Math.max(0, Math.floor(parsed.reflectDamage)) : 0;
            if (parsed.duration !== undefined) {
              parsed.duration = typeof parsed.duration === 'number' ? Math.max(1, Math.floor(parsed.duration)) : undefined;
            }
            if (parsed.reflectPerStack !== undefined && typeof parsed.reflectPerStack !== 'boolean') {
              delete parsed.reflectPerStack;
            }
            if (parsed.debuffStatus !== undefined && typeof parsed.debuffStatus !== 'string') {
              delete parsed.debuffStatus;
            }
            if (parsed.debuffStacks !== undefined) {
              parsed.debuffStacks = typeof parsed.debuffStacks === 'number' ? Math.max(1, Math.floor(parsed.debuffStacks)) : undefined;
            }
            if (parsed.debuffDuration !== undefined) {
              parsed.debuffDuration = typeof parsed.debuffDuration === 'number' ? Math.max(1, Math.floor(parsed.debuffDuration)) : undefined;
            }
          }
          // Carry over per-effect targeting if present
          if (e.effectTarget) {
            parsed.effectTarget = e.effectTarget as EffectTarget;
          }
          if (e.aoeSlots !== undefined) {
            parsed.aoeSlots = e.aoeSlots;
          }
          if (e.aoePattern) {
            parsed.aoePattern = e.aoePattern as AoePattern;
          }
          return parsed as CardEffect;
        });

        cards[cardData.id] = {
          id: cardData.id,
          name: cardData.name,
          cost: { energy: cardData.cost },
          effects: parsedEffects,
          targetSide: targetSide,
          targeting: targeting,
          aoeSlots: cardData.aoeSlots, // Optional: number of slots for AOE targeting (commonly 2-6)
          allowEmptySlotTarget: cardData.allowEmptySlotTarget === true,
          copies: cardData.copies || 1,
          type: cardData.type,
          tags: cardData.tags || [],
          exhaust: cardData.exhaust || false,
          expires_after_turns: cardData.expires_after_turns || 0,
          maxRange: cardData.maxRange,
          minRange: cardData.minRange,
          optimalRange: cardData.optimalRange,
          rarity: cardData.rarity,
          description: cardData.description || undefined,
          animationConfig: animationConfig
        };
      } catch (e) {
        console.warn(`Failed to load card ${filePath}:`, e);
      }
    }
    
    // --- Load all character YAML files ---
    for (const [filePath, yamlText] of Object.entries(characterYamlModules)) {
      try {
        const charData = jsyaml.load(yamlText) as any;
        if (!charData.stats) {
          charData.stats = {};
        }
        // Default speed to 0 (baseline: 1 energy = 1 slot) if not specified
        if (charData.stats.speed === undefined) {
          charData.stats.speed = 0;
        }
        // Default aggression to neutral and clamp to [0, 10].
        charData.stats.aggression = normalizeAggression(charData.stats.aggression);
        characters[charData.id] = normalizeCharacterVisualConfig(charData);
      } catch (e) {
        console.warn(`Failed to load character ${filePath}:`, e);
      }
    }
    
    // --- Load all enemy YAML files ---
    for (const [filePath, yamlText] of Object.entries(enemyYamlModules)) {
      try {
        const charData = jsyaml.load(yamlText) as any;
        if (!charData.stats) {
          charData.stats = {};
        }
        // Default speed to 0 (baseline: 1 energy = 1 slot) if not specified
        if (charData.stats.speed === undefined) {
          charData.stats.speed = 0;
        }
        // Default aggression to neutral and clamp to [0, 10].
        charData.stats.aggression = normalizeAggression(charData.stats.aggression);
        console.log(`Loaded enemy: ${charData.name} (${charData.id})`);
        characters[charData.id] = normalizeCharacterVisualConfig(charData);
      } catch (e) {
        console.warn(`Failed to load enemy ${filePath}:`, e);
      }
    }
    
    // --- Load all gear YAML files ---
    const gear: Record<string, GearDefinition> = {};
    for (const [filePath, yamlText] of Object.entries(gearYamlModules)) {
      try {
        const gearData = jsyaml.load(yamlText) as any;
        gear[gearData.id] = {
          id: gearData.id,
          name: gearData.name,
          description: gearData.description || '',
          slot: gearData.slot,
          rarity: gearData.rarity || 'common',
          modifiers: (gearData.modifiers ?? []).map((m: any) => ({
            target: m.target,
            op: m.op,
            value: m.value,
          })),
        };
      } catch (e) {
        console.warn(`Failed to load gear ${filePath}:`, e);
      }
    }

    // --- Load all status YAML files ---
    const statuses: Record<string, StatusDefinition> = {};
    for (const [filePath, yamlText] of Object.entries(statusYamlModules)) {
      try {
        const d = jsyaml.load(yamlText) as any;
        statuses[d.id] = {
          id: d.id,
          name: d.name || d.id,
          description: d.description || '',
          cadence: (d.cadence || 'round_start') as StatusCadence,
          dot: d.dot === null || d.dot === undefined ? null : {
            damage_per_stack: d.dot.damage_per_stack ?? 1,
            ignores_block: d.dot.ignores_block ?? false,
          },
          hot: d.hot === null || d.hot === undefined ? null : {
            heal_per_stack: d.hot.heal_per_stack ?? 1,
          },
          duration: d.duration === undefined ? undefined : Math.max(1, Math.floor(d.duration)),
          decay: {
            mode: (d.decay?.mode || 'none') as DecayMode,
            round: d.decay?.round || 'ceil',
            min_remove: d.decay?.min_remove ?? 1,
          },
          apply: {
            requires_zero_block: d.apply?.requires_zero_block ?? false,
          },
          display: d.display ? {
            iconColor: d.display.iconColor,
            bgColor: d.display.bgColor,
            borderColor: d.display.borderColor,
            icon: d.display.icon,
          } : undefined,
        };
      } catch (e) {
        console.warn(`Failed to load status ${filePath}:`, e);
      }
    }

    console.log('Loaded cards:', Object.keys(cards));
    console.log('Loaded characters:', Object.keys(characters));
    console.log('Loaded gear:', Object.keys(gear));
    console.log('Loaded statuses:', Object.keys(statuses));

    // --- Load balance.yaml modifiers ---
    loadBalanceModifiers();
    
    return { cards, characters, gear, statuses };
  } catch (error) {
    console.error('Failed to load content:', error);
    return { cards: {}, characters: {}, gear: {}, statuses: {} };
  }
}

// ── Balance YAML → Modifier parsing ─────────────────────────────────

/**
 * Parse balance.yaml and register all modifiers in the global registry.
 * Called once during content loading.
 */
function loadBalanceModifiers(): void {
  const registry = getModifierRegistry();
  // Clear any previously loaded balance modifiers (e.g. on HMR reload)
  registry.clearSource('balance');

  for (const [filePath, yamlText] of Object.entries(balanceYamlModules)) {
    try {
      const data = jsyaml.load(yamlText) as any;
      if (!data) continue;

      // Global modifiers
      if (data.global && typeof data.global === 'object') {
        for (const [target, ops] of Object.entries(data.global as Record<string, any>)) {
          registerOps(registry, target, ops, { kind: 'global' }, 'balance');
        }
      }

      // Team modifiers
      if (data.teams && typeof data.teams === 'object') {
        for (const [team, targets] of Object.entries(data.teams as Record<string, any>)) {
          if (!targets || typeof targets !== 'object') continue;
          const scope: ModifierScope = { kind: 'team', team: team as 'player' | 'enemy' };
          for (const [target, ops] of Object.entries(targets as Record<string, any>)) {
            registerOps(registry, target, ops, scope, 'balance');
          }
        }
      }

      // Per-character modifiers
      if (data.characters && typeof data.characters === 'object') {
        for (const [charId, targets] of Object.entries(data.characters as Record<string, any>)) {
          if (!targets || typeof targets !== 'object') continue;
          const scope: ModifierScope = { kind: 'character', characterId: charId };
          for (const [target, ops] of Object.entries(targets as Record<string, any>)) {
            registerOps(registry, target, ops, scope, 'balance');
          }
        }
      }

      console.log('Loaded balance profile:', data.profile || 'unnamed');
    } catch (e) {
      console.warn(`Failed to load balance config ${filePath}:`, e);
    }
  }
}

/**
 * Register modifier ops from a YAML entry like `{ set: 1 }` or `{ add: 2, multiply: 1.5 }`.
 */
function registerOps(
  registry: ReturnType<typeof getModifierRegistry>,
  target: string,
  ops: any,
  scope: ModifierScope,
  source: string
): void {
  if (!ops || typeof ops !== 'object') return;

  const validOps = ['set', 'add', 'multiply', 'min', 'max'] as const;
  for (const op of validOps) {
    if (ops[op] !== undefined && typeof ops[op] === 'number') {
      // Build a deterministic id from source + scope + target + op
      const scopeKey = scope.kind === 'global' ? 'global'
        : scope.kind === 'team' ? `team:${scope.team}`
        : scope.kind === 'character' ? `char:${scope.characterId}`
        : scope.kind === 'tag' ? `tag:${scope.tag}`
        : 'unknown';
      const id = `${source}:${scopeKey}:${target}:${op}`;

      const mod: GameModifier = {
        id,
        target,
        op,
        value: ops[op],
        source,
        scope,
      };
      registry.add(mod);
    }
  }
}

