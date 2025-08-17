import { DeterministicRng } from './rng';
import type {
  BattleState,
  CardDefinition,
  CardId,
  CharacterId,
  CharacterState,
  EngineAction,
} from './types';

const DRAW_PER_TURN = 3;

export function initializeBattle(state: BattleState): BattleState {
  const rng = new DeterministicRng(state.rngSeed);
  // Initialize piles and start stats
  const initChar = (c: CharacterState): CharacterState => {
    const drawPile = [...c.deck];
    rng.shuffleInPlace(drawPile);
    return {
      ...c,
      currentHealth: c.stats.maxHealth,
      currentEnergy: c.stats.maxEnergy,
      drawPile,
      hand: [],
      discardPile: [],
      exhaustPile: [],
      isDefeated: false,
    };
  };
  const party = state.party.map(initChar);
  const enemies = state.enemies.map(initChar);
  const turnOrder = computeTurnOrder([...party, ...enemies]);
  const activeCharacterId = turnOrder[0] ?? null;
  const next: BattleState = {
    ...state,
    party,
    enemies,
    turnOrder,
    activeCharacterId,
    turnIndex: 0,
    round: 1,
    battleOutcome: null,
    combatLog: [],
  };
  return drawCardsForActive(next, rng);
}

export function reducer(state: BattleState, action: EngineAction): BattleState {
  switch (action.type) {
    case 'initializeBattle':
      return initializeBattle(state);
    case 'startTurn': {
      const rng = new DeterministicRng(state.rngSeed + ':' + state.round);
      let s = regenerateEnergyForActive(state);
      s = drawCardsForActive(s, rng);
      return s;
    }
    case 'playCard': {
      return playCard(state, action.by, action.cardId, action.targetIds);
    }
    case 'endTurn':
      return advanceTurn(state);
    default:
      return state;
  }
}

function computeTurnOrder(all: CharacterState[]): CharacterId[] {
  return all
    .filter((c) => !c.isDefeated)
    .sort((a, b) => b.stats.speed - a.stats.speed)
    .map((c) => c.id);
}

function getAllCharacters(state: BattleState): CharacterState[] {
  return [...state.party, ...state.enemies];
}

function findCharacter(state: BattleState, id: CharacterId): { side: 'party' | 'enemies'; index: number; char: CharacterState } {
  const pIndex = state.party.findIndex((c) => c.id === id);
  if (pIndex >= 0) return { side: 'party', index: pIndex, char: state.party[pIndex] };
  const eIndex = state.enemies.findIndex((c) => c.id === id);
  if (eIndex >= 0) return { side: 'enemies', index: eIndex, char: state.enemies[eIndex] };
  throw new Error('Character not found: ' + id);
}

function updateCharacter(state: BattleState, updated: CharacterState): BattleState {
  const { side, index } = findCharacter(state, updated.id);
  if (side === 'party') {
    const party = state.party.slice();
    party[index] = updated;
    return { ...state, party };
  }
  const enemies = state.enemies.slice();
  enemies[index] = updated;
  return { ...state, enemies };
}

function activeCharacter(state: BattleState): CharacterState | null {
  if (!state.activeCharacterId) return null;
  const { char } = findCharacter(state, state.activeCharacterId);
  return char;
}

function drawCardsForActive(state: BattleState, rng: DeterministicRng): BattleState {
  const active = activeCharacter(state);
  if (!active) return state;
  const drawCount = Math.max(0, DRAW_PER_TURN - active.hand.length);
  const drawPile = active.drawPile.slice();
  const hand = active.hand.slice();
  const discardPile = active.discardPile.slice();
  for (let i = 0; i < drawCount; i += 1) {
    if (drawPile.length === 0) {
      // reshuffle discard into draw
      rng.shuffleInPlace(discardPile);
      drawPile.push(...discardPile.splice(0));
    }
    if (drawPile.length === 0) break;
    hand.push(drawPile.pop() as CardId);
  }
  return updateCharacter(state, { ...active, drawPile, hand, discardPile });
}

function regenerateEnergyForActive(state: BattleState): BattleState {
  const active = activeCharacter(state);
  if (!active) return state;
  const currentEnergy = Math.min(
    active.stats.maxEnergy,
    active.currentEnergy + active.stats.energyRegenPerTurn,
  );
  return updateCharacter(state, { ...active, currentEnergy });
}

function playCard(state: BattleState, by: CharacterId, cardId: CardId, targetIds: CharacterId[]): BattleState {
  const { char: actor } = findCharacter(state, by);
  const card = state.cardLibrary[cardId] as CardDefinition | undefined;
  if (!card) return state;
  if (actor.currentEnergy < card.cost.energy) return state;
  if (!actor.hand.includes(cardId)) return state;

  let s = state;

  // spend energy
  s = updateCharacter(s, { ...actor, currentEnergy: actor.currentEnergy - card.cost.energy });

  // apply effects with reporting
  const perTargetLogs: string[] = [];
  const defeatLogs: string[] = [];
  for (const targetId of targetIds) {
    const { char: target } = findCharacter(s, targetId);
    const report = applyCardEffectsAndReport(target, card);
    s = updateCharacter(s, report.updated);
    perTargetLogs.push(...report.logs);
    if (report.killed) {
      defeatLogs.push(`${report.updated.name} is defeated`);
    }
  }

  // move card to discard or exhaust
  const { char: actorAfter } = findCharacter(s, by);
  const newHand = actorAfter.hand.filter((id) => id !== cardId);
  const newDiscard = card.exhausts ? actorAfter.discardPile : [...actorAfter.discardPile, cardId];
  const newExhaust = card.exhausts ? [...actorAfter.exhaustPile, cardId] : actorAfter.exhaustPile;
  s = updateCharacter(s, { ...actorAfter, hand: newHand, discardPile: newDiscard, exhaustPile: newExhaust });

  // log
  const actorName = findCharacter(s, by).char.name;
  const targetNames = targetIds.map((id) => findCharacter(s, id).char.name).join(', ');
  const header = `${actorName} plays ${card.name} → ${targetNames}`;
  const lines = [header, ...perTargetLogs, ...defeatLogs];
  const newestFirst = lines.reverse();
  s = { ...s, combatLog: [...newestFirst, ...s.combatLog].slice(0, 100) };

  // handle defeats
  s = checkDefeats(s);

  return s;
}

function applyCardEffectsAndReport(target: CharacterState, card: CardDefinition): { updated: CharacterState; logs: string[]; killed: boolean } {
  const logs: string[] = [];
  let t = { ...target };
  const startHp = t.currentHealth;
  for (const effect of card.effects) {
    switch (effect.kind) {
      case 'damage': {
        const before = t.currentHealth;
        const after = Math.max(0, before - effect.amount);
        const dealt = before - after;
        t.currentHealth = after;
        logs.push(`${t.name} takes ${dealt} damage (${after}/${t.stats.maxHealth} HP)`);
        break;
      }
      case 'heal': {
        const before = t.currentHealth;
        const after = Math.min(t.stats.maxHealth, before + effect.amount);
        const healed = after - before;
        t.currentHealth = after;
        logs.push(`${t.name} heals ${healed} HP (${after}/${t.stats.maxHealth} HP)`);
        break;
      }
      case 'energy': {
        const before = t.currentEnergy;
        const after = Math.min(t.stats.maxEnergy, Math.max(0, before + effect.amount));
        const delta = after - before;
        t.currentEnergy = after;
        logs.push(`${t.name} ${delta >= 0 ? 'gains' : 'loses'} ${Math.abs(delta)} energy (${after}/${t.stats.maxEnergy})`);
        break;
      }
      case 'speed': {
        const before = t.stats.speed;
        const speed = Math.max(0, before + effect.amount);
        t.stats = { ...t.stats, speed };
        logs.push(`${t.name} speed ${effect.amount >= 0 ? '+' : ''}${effect.amount} (now ${speed})`);
        break;
      }
    }
  }
  const killed = startHp > 0 && t.currentHealth <= 0;
  return { updated: t, logs, killed };
}

function checkDefeats(state: BattleState): BattleState {
  const mark = (c: CharacterState): CharacterState => ({ ...c, isDefeated: c.currentHealth <= 0 });
  let s: BattleState = {
    ...state,
    party: state.party.map(mark),
    enemies: state.enemies.map(mark),
  };
  const partyAlive = s.party.some((c) => !c.isDefeated);
  const enemiesAlive = s.enemies.some((c) => !c.isDefeated);
  if (!partyAlive || !enemiesAlive) {
    s = { ...s, battleOutcome: !enemiesAlive ? 'victory' : 'defeat' };
  }
  // Remove defeated from turn order immediately
  const aliveIds = new Set<string>([...s.party, ...s.enemies].filter((c) => !c.isDefeated).map((c) => c.id));
  let turnOrder = s.turnOrder.filter((id) => aliveIds.has(id));
  let turnIndex = Math.min(s.turnIndex, Math.max(0, turnOrder.length - 1));
  const activeCharacterId = turnOrder[turnIndex] ?? null;
  return { ...s, turnOrder, turnIndex, activeCharacterId };
}

function advanceTurn(state: BattleState): BattleState {
  if (state.battleOutcome) return state;
  let turnIndex = state.turnIndex + 1;
  let round = state.round;
  let turnOrder = state.turnOrder;
  if (turnIndex >= turnOrder.length) {
    // new round
    round += 1;
    turnIndex = 0;
    const all = getAllCharacters(state);
    turnOrder = computeTurnOrder(all);
  }
  const activeCharacterId = turnOrder[turnIndex] ?? null;
  return { ...state, turnIndex, round, turnOrder, activeCharacterId };
}


