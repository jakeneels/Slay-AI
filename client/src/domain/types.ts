export type CharacterId = string;
export type CardId = string;

export type Rarity = 'common' | 'rare' | 'mythic';

export interface CharacterStats {
  maxHealth: number;
  speed: number; // higher = earlier turn
  maxEnergy: number;
  energyRegenPerTurn: number;
}

export interface CharacterState {
  id: CharacterId;
  name: string;
  stats: CharacterStats;
  currentHealth: number;
  currentEnergy: number;
  deck: CardId[]; // full draw pile at combat start (with duplicates representing rarity weighting)
  drawPile: CardId[];
  hand: CardId[];
  discardPile: CardId[];
  exhaustPile: CardId[];
  isDefeated: boolean;
}

export interface CardCost {
  energy: number; // energy cost to play
}

export type TargetSide = 'ally' | 'enemy' | 'self' | 'any';
export type Targeting = 'single' | 'all';

export interface CardDefinitionBase {
  id: CardId;
  name: string;
  rarity: Rarity;
  cost: CardCost;
  exhausts?: boolean;
  targetSide: TargetSide;
  targeting: Targeting;
}

export interface DamageEffect {
  kind: 'damage';
  amount: number;
}

export interface HealEffect {
  kind: 'heal';
  amount: number;
}

export interface EnergyEffect {
  kind: 'energy';
  amount: number; // positive to restore/gain energy
}

export interface SpeedEffect {
  kind: 'speed';
  amount: number; // temporary change applied this combat; affects ordering next rounds
}

export type CardEffect = DamageEffect | HealEffect | EnergyEffect | SpeedEffect;

export interface CardDefinition extends CardDefinitionBase {
  effects: CardEffect[];
}

export interface BattleState {
  party: CharacterState[]; // player side
  enemies: CharacterState[]; // enemy side
  cardLibrary: Record<CardId, CardDefinition>;
  turnIndex: number; // index within current turnOrder array
  turnOrder: CharacterId[]; // recomputed at round start by speed
  activeCharacterId: CharacterId | null;
  round: number;
  rngSeed: string;
  battleOutcome?: 'victory' | 'defeat' | null;
  combatLog: string[];
}

export interface PlayCardAction {
  type: 'playCard';
  by: CharacterId;
  cardId: CardId;
  targetIds: CharacterId[];
}

export interface EndTurnAction {
  type: 'endTurn';
}

export interface StartTurnAction {
  type: 'startTurn';
}

export interface InitializeBattleAction {
  type: 'initializeBattle';
}

export type EngineAction =
  | PlayCardAction
  | EndTurnAction
  | StartTurnAction
  | InitializeBattleAction;


