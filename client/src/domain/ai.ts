import type { BattleState, CardDefinition, CardId, CharacterId, CharacterState } from './types';
import { reducer } from './engine';

function allChars(state: BattleState): CharacterState[] {
  return [...state.party, ...state.enemies];
}

function findById(state: BattleState, id: CharacterId): CharacterState | undefined {
  return allChars(state).find((c) => c.id === id);
}

function chooseTargets(state: BattleState, by: CharacterId, card: CardDefinition): CharacterId[] {
  const actorIsEnemy = state.enemies.some((e) => e.id === by);
  const friends = (actorIsEnemy ? state.enemies : state.party).filter((c) => !c.isDefeated);
  const foes = (actorIsEnemy ? state.party : state.enemies).filter((c) => !c.isDefeated);
  switch (card.targetSide) {
    case 'enemy': {
      // lowest HP foe
      const target = foes.slice().sort((a, b) => a.currentHealth - b.currentHealth)[0];
      return target ? [target.id] : [];
    }
    case 'ally': {
      // prefer self if available, else first friend
      const self = friends.find((a) => a.id === by);
      if (self) return [self.id];
      return friends[0] ? [friends[0].id] : [];
    }
    case 'self':
      return [by];
    case 'any': {
      const target = foes[0] ?? friends[0];
      return target ? [target.id] : [];
    }
  }
}

export function runEnemyTurn(state: BattleState): BattleState {
  let s = state;
  if (!s.activeCharacterId) return s;
  const actor = findById(s, s.activeCharacterId);
  if (!actor) return s;
  // Start turn (draw + regen)
  s = reducer(s, { type: 'startTurn' });

  // Play in-hand order until out of energy or no playable cards
  let playedSomething = true;
  while (playedSomething) {
    playedSomething = false;
    const current = findById(s, s.activeCharacterId!);
    if (!current) break;
    for (const cardId of current.hand) {
      const card = s.cardLibrary[cardId];
      if (!card) continue;
      if (current.currentEnergy < card.cost.energy) continue;
      const targets = chooseTargets(s, current.id, card);
      if (targets.length === 0) continue;
      s = reducer(s, { type: 'playCard', by: current.id, cardId: cardId as CardId, targetIds: targets });
      playedSomething = true;
      break; // re-evaluate hand/energy after each play
    }
  }

  // End turn
  s = reducer(s, { type: 'endTurn' });
  return s;
}


