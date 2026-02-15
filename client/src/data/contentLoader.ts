// Content loading from YAML files

import jsyaml from 'js-yaml';
import type { Card, CardEffect, CharacterDefinition, LoadedContent, EffectTarget, AoePattern } from '../core/types.js';

/**
 * Load YAML content (cards and characters)
 */
export async function loadContent(): Promise<LoadedContent> {
  try {
    // Load cards - include all existing YAML files
    const cardFiles: string[] = [ 
      'content/core/cards/shockwave.yaml',
      'content/core/cards/fireball.yaml',
      'content/core/cards/chain_lightning.yaml',
      'content/core/cards/strike.yaml',
      'content/core/cards/defend.yaml',
      'content/core/cards/blast.yaml',
      'content/core/cards/heal.yaml',
      'content/core/cards/overclock.yaml',
      'content/core/cards/linebreaker.yaml'
    ];

    /**
     * targeting | aoe enum
     * innate
     * maxRange
     * optimalRange 0-7
     */
    
    const characterFiles: string[] = [
      'content/core/characters/jacob_techblade.yaml',
      'content/core/characters/didi_sharpshooter.yaml',
      'content/core/characters/kael_tactician.yaml',
      'content/core/characters/nyx_corrupter.yaml'
    ];
    /**
     * speed: influences with small randomness what order turn happen in. also how many slots can be moved for one energy
     * durationTurnsPerStack:
     * stacksPerApplication
     */
    
    const enemyFiles: string[] = [
      'content/core/enemies/scrapling_swarm.yaml',
      'content/core/enemies/fanatic_zealot.yaml',
      'content/core/enemies/rustbeast_quadruped.yaml',
      'content/core/enemies/neural_stalker.yaml',
      'content/core/enemies/fanatic_sprinter.yaml'
    ];
    
    console.log('Enemy files to load:', enemyFiles);
    
    // Load all files
    const cards: Record<string, Card> = {};
    const characters: Record<string, CharacterDefinition> = {};
    
    for (const file of cardFiles) {
      try {
        const response = await fetch(file);
        const yamlText = await response.text();
        const cardData = jsyaml.load(yamlText) as any;
        // Determine targetSide from targeting
        let targetSide: 'self' | 'ally' | 'enemy' = 'enemy';
        if (cardData.targeting === 'self') {
          targetSide = 'self';
        } else if (cardData.targeting === 'ally' || cardData.targeting === 'allAllies') {
          targetSide = 'ally';
        } else {
          targetSide = 'enemy';
        }
        
        // Determine targeting - use YAML value if it's a valid targeting type, otherwise derive from targetSide
        let targeting: 'single' | 'aoe' | 'self' | 'ally' | 'enemy' | 'allEnemies' | 'allAllies' = 'single';
        if (cardData.targeting === 'allEnemies' || cardData.targeting === 'allAllies') {
          targeting = cardData.targeting;
        } else if (cardData.targeting === 'aoe') {
          targeting = 'aoe';
        } else if (cardData.targeting === 'self' || cardData.targeting === 'ally' || cardData.targeting === 'enemy') {
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
          // Remove animationConfig if it's empty
          if (!animationConfig.damage && !animationConfig.heal) {
            animationConfig = undefined;
          }
        }
        
        // Parse effects with per-effect targeting fields
        const parsedEffects: CardEffect[] = (cardData.effects ?? []).map((e: any) => {
          const parsed: any = { ...e };
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
          aoeSlots: cardData.aoeSlots, // Optional: number of slots for AOE targeting (2, 3, or 4)
          copies: cardData.copies || 1,
          type: cardData.type,
          tags: cardData.tags || [],
          exhaust: cardData.exhaust || false,
          expires_after_turns: cardData.expires_after_turns || 0,
          maxRange: cardData.maxRange,
          optimalRange: cardData.optimalRange,
          rarity: cardData.rarity,
          animationConfig: animationConfig
        };
      } catch (e) {
        console.warn(`Failed to load ${file}:`, e);
      }
    }
    
    for (const file of characterFiles) {
      try {
        const response = await fetch(file);
        const yamlText = await response.text();
        const charData = jsyaml.load(yamlText) as any;
        if (charData.stats && charData.stats.moveEnergyCost === undefined) {
          charData.stats.moveEnergyCost = 1;
        }
        characters[charData.id] = charData;
      } catch (e) {
        console.warn(`Failed to load ${file}:`, e);
      }
    }
    
    console.log('Starting enemy file loading...');
    for (const file of enemyFiles) {
      try {
        console.log(`Loading enemy file: ${file}`);
        const response = await fetch(file);
        if (!response.ok) {
          console.error(`Failed to fetch ${file}: ${response.status} ${response.statusText}`);
          continue;
        }
        const yamlText = await response.text();
        const charData = jsyaml.load(yamlText) as any;
        if (charData.stats && charData.stats.moveEnergyCost === undefined) {
          charData.stats.moveEnergyCost = 1;
        }
        console.log(`Loaded enemy: ${charData.name} (${charData.id})`);
        characters[charData.id] = charData;
      } catch (e) {
        console.warn(`Failed to load ${file}:`, e);
      }
    }
    
    console.log('Loaded cards:', Object.keys(cards));
    console.log('Loaded characters:', Object.keys(characters));
    console.error('Starting CHAD CAHHH file loading...');

    
    return { cards, characters };
  } catch (error) {
    console.error('Failed to load content:', error);
    return { cards: {}, characters: {} };
  }
}

