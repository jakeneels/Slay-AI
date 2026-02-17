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
  duration?: number; // Optional duration in rounds (overrides status default)
}

export type StatusModifyOp = 'set' | 'add' | 'multiply';

export interface StatusModifyEffect extends BaseCardEffect {
  kind: 'status_modify';
  status: string;
  op: StatusModifyOp;
  amount: number;
}

export type StatusSpreadSide = 'same' | 'opposing' | 'both';

export interface StatusSpreadEffect extends BaseCardEffect {
  kind: 'status_spread';
  status: string;
  fraction: number;
  round?: 'floor' | 'ceil';
  // Slot distance from source target to include for spread (default 1).
  spreadRange?: number;
  // Which side(s) to spread to relative to the source target (default 'same').
  spreadSide?: StatusSpreadSide;
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
  | StatusModifyEffect
  | StatusSpreadEffect
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
  minRange?: number;
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
  speed?: number;              // Speed stat: determines movement efficiency AND turn order priority (default 0)
  suppression?: number;        // How much ranged-attack penalty this character projects to nearby enemies (default 0)
  suppressionResist?: number;  // How much suppression penalty this character can ignore (default 0)
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
  slotSize?: number;          // Number of contiguous slots occupied from slotIndex (front-anchored, default 1)
  speed: number;              // Speed stat: determines movement efficiency AND turn order priority (0 = baseline)
  moveCharges: number;        // Remaining free move charges this turn (resets to 0 each turn)
  suppression: number;        // How much ranged-attack penalty this character projects to nearby enemies
  suppressionResist: number;  // How much suppression penalty this character can ignore
  gear: Record<GearSlot, GearDefinition | null>; // Equipped gear per slot
}

export type CharacterVisualPreset = 'humanoid' | 'small' | 'large' | 'beast';

export interface CharacterVisualProfile {
  preset?: CharacterVisualPreset;
  scale?: number;
  anchorX?: number; // 0-1, where 0.5 keeps sprite centered on slot
  anchorY?: number; // 0-1, where 1 aligns sprite feet to ground line
  offsetX?: number; // Pixel nudge from slot center
  offsetY?: number; // Pixel nudge from ground line
}

export interface CharacterDefinition extends Character {
  sprite?: string;
  visual?: CharacterVisualProfile;
  // Legacy visual fields. Kept for backward compatibility with older YAML.
  spriteScale?: number;
  spriteAnchorX?: number; // 0–1 horizontal anchor override (default 0.5 = center)
  spriteAnchorY?: number; // 0–1 vertical anchor override (default 0.5 = center)
  spriteOffsetX?: number;
  spriteOffsetY?: number;
  spriteVisualPreset?: CharacterVisualPreset;
  spriteSheet?: string; // Optional sprite sheet for attack/hit animation (e.g. 2x2 grid)
  spriteSheetLayout?: [number, number]; // [cols, rows] for frame extraction
  startingDeck?: string[];
  stats: CharacterStats;
}

export interface GameStats {
  cumulativeDamage: number;
  maxDamage: number;
  cumulativeHeal?: number;
}

// ── Modifier Pipeline types ─────────────────────────────────────────

/** What value a modifier targets (extensible string key). */
export type ModifierTarget = string;

/** Who a modifier applies to. */
export type ModifierScope =
  | { kind: 'global' }
  | { kind: 'character'; characterId: string }
  | { kind: 'team'; team: 'player' | 'enemy' }
  | { kind: 'tag'; tag: string };

/** Optional condition for when a modifier applies. */
export interface ModifierCondition {
  cardType?: 'attack' | 'skill' | 'power' | 'summon';
  cardTag?: string;
  [key: string]: any;
}

/** A single modifier that adjusts a game value. */
export interface GameModifier {
  id: string;
  target: ModifierTarget;
  op: 'add' | 'multiply' | 'set' | 'min' | 'max';
  value: number;
  source: string;               // e.g. 'balance', 'passive:jacob', 'gear:power_cell', 'devpanel'
  scope: ModifierScope;
  condition?: ModifierCondition;
  priority?: number;            // evaluation order within same op (lower = earlier, default 0)
}

/** Context passed to the modifier resolver to check scope/conditions. */
export interface ModifierContext {
  character?: Character;
  card?: Card;
  team?: 'player' | 'enemy';
}

// ── Gear types ───────────────────────────────────────────────────────

export type GearSlot = 'weapon' | 'armor' | 'accessory';

export interface GearDefinition {
  id: string;
  name: string;
  description: string;
  slot: GearSlot;
  rarity: 'common' | 'uncommon' | 'rare';
  modifiers: Array<{
    target: string;    // e.g. 'maxHp', 'damage_dealt', 'maxEnergy'
    op: 'add' | 'multiply';
    value: number;
  }>;
}

// ── Status definition types ──────────────────────────────────────────

export type StatusCadence = 'round_start';

export type DecayMode = 'none' | 'linear' | 'half_life';

export interface StatusDefinition {
  id: string;
  name: string;
  description: string;
  cadence: StatusCadence;
  dot: { damage_per_stack: number; ignores_block: boolean } | null;
  hot?: { heal_per_stack: number } | null;
  duration?: number;
  decay: {
    mode: DecayMode;
    round?: 'floor' | 'ceil';
    min_remove?: number;
  };
  apply?: {
    requires_zero_block?: boolean;
  };
  display?: {
    iconColor?: number;
    bgColor?: number;
    borderColor?: number;
    icon?: string;
  };
}

// ── Played card stack entry ──────────────────────────────────────────

export interface PlayedCardEntry {
  templateId: string;
  playerName: string;
  isPlayer: boolean;
}

// ── Game state ───────────────────────────────────────────────────────

export interface GameState {
  characters: Character[];
  cardLibrary: Record<string, Card>;
  characterLibrary: Record<string, CharacterDefinition>;
  gearLibrary: Record<string, GearDefinition>;
  statusLibrary: Record<string, StatusDefinition>;
  cardInstances: Record<string, CardInstance>;
  selectedCardId: string | null;
  currentPlayerId: string;
  turnIndex: number;
  turnQueue: string[];         // Ordered character IDs for current round
  turnQueueIndex: number;      // Current position in queue
  roundNumber: number;         // Full round counter
  combatLog: string[];
  isProcessingTurn: boolean;
  nextCardInstanceId: number;
  stats: GameStats;
  combatResult: 'ongoing' | 'victory' | 'defeat';
  pendingReward: GearDefinition | null;
  waveNumber: number;
  currentMap: string;
  playedCardsStack: PlayedCardEntry[];
}

export interface LoadedContent {
  cards: Record<string, Card>;
  characters: Record<string, CharacterDefinition>;
  gear: Record<string, GearDefinition>;
}

