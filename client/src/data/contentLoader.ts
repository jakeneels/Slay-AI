// Content loading from YAML files

import jsyaml from 'js-yaml';
import type { Card, CharacterDefinition, LoadedContent } from '../core/types.js';

/**
 * Load YAML content (cards and characters)
 */
export async function loadContent(): Promise<LoadedContent> {
  try {
    // Load cards
    const cardFiles: string[] = [ 
      // cards should be children of parents, with some common cards that could be imported.
      // should probably move away from the copies thing, chars can start with the basic attacks, like 3 of each then the cards are random. this way dilution is controlled by the player
      'content/core/cards/defend_common.yaml',
      'content/core/cards/blast_rare.yaml', 
      'content/core/cards/strike_common.yaml',
      'content/core/cards/overclock_mythic.yaml',
      'content/core/cards/fireball_rare.yaml',
      'content/core/cards/heal_uncommon.yaml'
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
      'content/core/enemies/neural_stalker.yaml'
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
        } else if (cardData.targeting === 'self' || cardData.targeting === 'ally' || cardData.targeting === 'enemy') {
          targeting = cardData.targeting;
        } else {
          // Default to 'single' for backwards compatibility
          targeting = 'single';
        }
        
        cards[cardData.id] = {
          id: cardData.id,
          name: cardData.name,
          cost: { energy: cardData.cost },
          effects: cardData.effects,
          targetSide: targetSide,
          targeting: targeting,
          copies: cardData.copies || 1,
          type: cardData.type,
          tags: cardData.tags || [],
          exhaust: cardData.exhaust || false,
          expires_after_turns: cardData.expires_after_turns || 0,
          maxRange: cardData.maxRange,
          optimalRange: cardData.optimalRange,
          rarity: cardData.rarity
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

