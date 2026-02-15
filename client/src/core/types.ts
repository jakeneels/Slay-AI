// Core type definitions for the game

export interface CardCost {
  energy: number;
}

// Per-effect targeting — determines who each individual effect applies to.
// Defaults to 'target' (inherits the card's interaction targeting).
export type EffectTarget =
  | 'target'       // whoever the card targets (default)
  | 'self'         // always the caster
  | 'allAllies'    // all living allies of caster
  | 'allEnemies'   // all living enemies of caster
  | 'aoe';         // AOE from primary target (uses effect-level aoeSlots)

export type AoePattern = 'adjacent' | 'spread';

// Base effect interface - all effects have kind and amount
export interface BaseCardEffect {
  kind: string;
  amount: number;
  effectTarget?: EffectTarget;  // defaults to 'target' when omitted
  aoeSlots?: number;            // 2/3/4, only relevant when effectTarget is 'aoe'
  aoePattern?: AoePattern;      // how AOE slots are selected (default 'adjacent')
}

// Specific effect types
export interface DamageEffect extends BaseCardEffect {
  kind: 'damage';
  amount: number;
}

export interface HealEffect extends BaseCardEffect {
  kind: 'heal';
  amount: number;
}

export interface EnergyEffect extends BaseCardEffect {
  kind: 'energy';
  amount: number;
}

export interface SpeedEffect extends BaseCardEffect {
  kind: 'speed';
  amount: number;
}

export interface AoeDamageEffect extends BaseCardEffect {
  kind: 'aoe_damage';
  amount: number;
}

export interface BlockEffect extends BaseCardEffect {
  kind: 'grant_block_layer';
  amount: number; // Block amount
  decay_percent?: number; // Decay percentage (default if not specified)
}

export interface StatusEffect extends BaseCardEffect {
  kind: 'status';
  status: string; // Status ID (e.g., 'disrupt', 'bleed', 'shock', 'radiation')
  stacks?: number; // Number of stacks (default 1)
}

export interface ModifierEffect {
  kind: 'modifier';
  when?: {
    target_has_tag?: string;
    [key: string]: any;
  };
  apply: CardEffect[]; // Effects to apply when condition is met
}

export interface KnockbackEffect extends BaseCardEffect {
  kind: 'knockback';
  amount: number; // Number of slots to push the target back (away from caster)
}

export interface DeckInjectEffect {
  kind: 'deck_inject';
  target: 'allies' | 'self' | 'enemies';
  card: string; // Card template ID to inject
  copies?: number; // Number of copies (default 1)
}

// Union type for all card effects
export type CardEffect = 
  | DamageEffect 
  | HealEffect 
  | EnergyEffect 
  | SpeedEffect 
  | AoeDamageEffect 
  | BlockEffect 
  | StatusEffect 
  | KnockbackEffect
  | ModifierEffect 
  | DeckInjectEffect;

export interface Card {
  id: string;
  name: string;
  cost: CardCost;
  effects: CardEffect[];
  targetSide: 'self' | 'ally' | 'enemy';
  targeting: 'single' | 'aoe' | 'self' | 'ally' | 'enemy' | 'allEnemies' | 'allAllies';
  aoeSlots?: number; // Number of slots to hit with AOE (2, 3, or 4). Defaults to 3 if not specified.
  rarity?: string;
  copies?: number;
  type?: 'attack' | 'skill' | 'power' | 'summon';
  tags?: string[];
  exhaust?: boolean;
  expires_after_turns?: number;
  description?: string;
  maxRange?: number;
  optimalRange?: number;
  animationConfig?: {
    damage?: {
      projectileColor?: number;
      projectileSpeed?: number;
      impactSize?: number;
    };
    heal?: {
      particleColor?: number;
      glowIntensity?: number;
    };
  };
}

export interface CardInstance extends Card {
  instanceId: string;
  templateId: string;
  turnsUntilExpiry?: number; // Tracks expiration countdown for this instance
}

export interface CharacterStats {
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  moveEnergyCost?: number; // Energy cost to move forward or back one slot
}

// Block layer - each block source has its own decay rate
export interface BlockLayer {
  amount: number; // Current remaining amount
  baseAmount: number; // Original amount when block was granted (for decay calculation)
  decay_percent: number; // Percentage to decay each turn (0-100)
  source?: string; // Card ID that created this block (optional)
}

// Status effect on a character
export interface Status {
  id: string; // Status ID (e.g., 'disrupt', 'bleed', 'shock', 'radiation', 'fortify')
  stacks: number; // Stack count
  duration?: number; // Turns remaining (undefined = permanent)
  metadata?: Record<string, any>; // Additional status data
}

export interface Character {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  deck: string[]; // Array of card template IDs
  discardPile: string[]; // Array of card template IDs that were played
  hand: string[]; // Array of card instance IDs
  drawCount: number; // Cards to draw per turn (default 3)
  maxHandSize: number; // Maximum hand size (default 5)
  blockLayers: BlockLayer[]; // Current block layers
  statuses: Status[]; // Active status effects
  isPlayer: boolean;
  slotIndex: number; // Position on battlefield (0 = leftmost ally / rightmost enemy)
}

export interface CharacterDefinition extends Character {
  sprite?: string;
  startingDeck?: string[];
  stats: CharacterStats;
}

export interface GameStats {
  cumulativeDamage: number;
  maxDamage: number;
  cumulativeHeal?: number;
}

export interface GameState {
  characters: Character[];
  cardLibrary: Record<string, Card>;
  characterLibrary: Record<string, CharacterDefinition>;
  cardInstances: Record<string, CardInstance>;
  selectedCardId: string | null;
  currentPlayerId: string;
  turnIndex: number;
  combatLog: string[];
  isProcessingTurn: boolean;
  nextCardInstanceId: number;
  stats: GameStats;
}

export interface LoadedContent {
  cards: Record<string, Card>;
  characters: Record<string, CharacterDefinition>;
}

