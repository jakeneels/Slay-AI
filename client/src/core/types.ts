// Core type definitions for the game

export interface CardCost {
  energy: number;
}

export interface CardEffect {
  kind: 'damage' | 'heal' | 'energy' | 'speed';
  amount: number;
}

export interface Card {
  id: string;
  name: string;
  cost: CardCost;
  effects: CardEffect[];
  targetSide: 'self' | 'ally' | 'enemy';
  targeting: 'single' | 'aoe' | 'self' | 'ally' | 'enemy' | 'allEnemies' | 'allAllies';
  rarity?: string;
  copies?: number;
  type?: 'attack' | 'skill' | 'power' | 'summon';
  tags?: string[];
  exhaust?: boolean;
  expires_after_turns?: number;
  maxRange?: number;
  optimalRange?: number;
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
  isPlayer: boolean;
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

