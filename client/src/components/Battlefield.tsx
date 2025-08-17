import { useEffect, useState } from 'react';
import { FaHeart, FaBolt } from 'react-icons/fa';
import { useBattleStore } from '../state/store';
// import { sampleCards } from '../data/sampleCards';
import { sampleEnemies, sampleParty } from '../data/sampleCharacters';
import type { BattleState, CardId, CharacterId, CharacterState } from '../domain/types';
import Hand from './Hand';
import TurnOrder from './TurnOrder';
import CombatLog from './CombatLog';
import { loadAllContent } from '../content/loader';
import PixiCanvas from './PixiCanvas';

function CharacterCard({ c, isActive, selectable }: { c: CharacterState; isActive: boolean; selectable: boolean }) {
  return (
    <div
      className={`rounded border p-3 transition bg-neutral-900 ${
        isActive ? 'border-emerald-400' : selectable ? 'border-amber-400' : 'border-neutral-700'
      } ${selectable ? 'cursor-pointer hover:bg-neutral-800' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="font-semibold">{c.name}</div>
        <div className="text-xs text-neutral-400">SPD {c.stats.speed}</div>
      </div>
      <div className="mt-2 text-xs flex items-center gap-4">
        <div className="inline-flex items-center gap-1 text-red-400">
          <FaHeart className="h-3 w-3" />
          <span>{c.currentHealth} / {c.stats.maxHealth}</span>
        </div>
        <div className="inline-flex items-center gap-1 text-blue-400">
          <FaBolt className="h-3 w-3" />
          <span>{c.currentEnergy} / {c.stats.maxEnergy}</span>
        </div>
      </div>
    </div>
  );
}

export default function Battlefield() {
  const { state, hydrate, dispatch } = useBattleStore();
  const [selectedCardId, setSelectedCardId] = useState<CardId | null>(null);

  useEffect(() => {
    (async () => {
      const { cards, errors } = await loadAllContent();
      if (errors.length) {
        console.warn('Content load errors:', errors);
      }
      const initial: BattleState = {
        party: sampleParty,
        enemies: sampleEnemies,
        cardLibrary: cards,
        turnIndex: 0,
        turnOrder: [],
        activeCharacterId: null,
        round: 0,
        rngSeed: 'demo-seed',
        battleOutcome: null,
        combatLog: [],
      };
      hydrate(initial);
      dispatch({ type: 'initializeBattle' });
    })();
  }, [hydrate, dispatch]);

  const activeId = state.activeCharacterId;

  // Clear selection on turn change or when combat ends
  useEffect(() => {
    setSelectedCardId(null);
  }, [activeId, state.battleOutcome]);

  // Ensure selected card belongs to current actor; otherwise clear it
  useEffect(() => {
    if (!selectedCardId) return;
    if (!activeId) {
      setSelectedCardId(null);
      return;
    }
    const actor = [...state.party, ...state.enemies].find((c) => c.id === activeId);
    if (!actor || !actor.hand.includes(selectedCardId)) {
      setSelectedCardId(null);
    }
  }, [selectedCardId, activeId, state.party, state.enemies]);

  const isTargetSelectable = (targetId: CharacterId): boolean => {
    if (!selectedCardId) return false;
    const card = state.cardLibrary[selectedCardId];
    if (!card) return false;
    const isEnemy = state.enemies.some((c) => c.id === targetId);
    const isAlly = state.party.some((c) => c.id === targetId);
    if (card.targetSide === 'enemy') return isEnemy;
    if (card.targetSide === 'ally') return isAlly;
    if (card.targetSide === 'self') return targetId === activeId;
    return true;
  };

  const onClickTarget = (targetId: CharacterId) => {
    if (!selectedCardId) return;
    if (!isTargetSelectable(targetId)) return;
    if (!activeId) return;
    dispatch({ type: 'playCard', by: activeId, cardId: selectedCardId, targetIds: [targetId] });
    setSelectedCardId(null);
  };

  return (
    <div className="grid grid-cols-2 gap-6">
      {state.battleOutcome && (
        <div className="col-span-2 rounded border border-neutral-700 bg-neutral-900 p-4 text-center">
          <div className="text-xl font-bold">
            {state.battleOutcome === 'victory' ? 'Victory' : 'Defeat'}
          </div>
          <div className="mt-1 text-sm text-neutral-400">Combat has ended.</div>
        </div>
      )}
      <div className="space-y-3">
        <div className="text-sm font-semibold text-neutral-200">Party</div>
        <div className="grid grid-cols-2 gap-3">
          {state.party.filter((c) => !c.isDefeated).map((c) => (
            <button
              key={c.id}
              onClick={() => onClickTarget(c.id)}
              className="text-left"
              type="button"
              style={{ cursor: isTargetSelectable(c.id) ? 'pointer' : 'default' }}
            >
              <CharacterCard c={c} isActive={c.id === activeId} selectable={isTargetSelectable(c.id)} />
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="text-sm font-semibold text-neutral-200">Enemies</div>
        <div className="grid grid-cols-2 gap-3">
          {state.enemies.filter((c) => !c.isDefeated).map((c) => (
            <button
              key={c.id}
              onClick={() => onClickTarget(c.id)}
              className="text-left"
              type="button"
              style={{ cursor: isTargetSelectable(c.id) ? 'pointer' : 'default' }}
            >
              <CharacterCard c={c} isActive={c.id === activeId} selectable={isTargetSelectable(c.id)} />
            </button>
          ))}
        </div>
      </div>

      <div className="col-span-2 mt-4 flex items-center justify-between rounded border border-neutral-800 bg-neutral-950 px-4 py-3">
        <div className="text-sm text-neutral-300">
          Round {state.round} · Turn {state.turnIndex + 1} / {state.turnOrder.length}
        </div>
        <div className="space-x-2">
          <button className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium disabled:opacity-50" type="button" onClick={() => { setSelectedCardId(null); dispatch({ type: 'startTurn' }); }} disabled={!!state.battleOutcome}>
            Start Turn
          </button>
          <button className="rounded bg-neutral-800 px-4 py-2 text-sm font-medium disabled:opacity-50" type="button" onClick={() => { setSelectedCardId(null); dispatch({ type: 'endTurn' }); }} disabled={!!state.battleOutcome}>
            End Turn
          </button>
        </div>
      </div>

      <div className="col-span-2 rounded border border-neutral-800 bg-neutral-950 p-3">
        <TurnOrder />
      </div>

      <div className="col-span-2 rounded border border-neutral-800 bg-neutral-950 p-3">
        <div className="mb-2 text-sm font-semibold text-neutral-200">Battlefield</div>
        <PixiCanvas
          selectedCardId={selectedCardId}
          onClickTarget={(id) => onClickTarget(id)}
        />
      </div>

      <div className="col-span-2 rounded border border-neutral-800 bg-neutral-950 p-3">
        <Hand selectedCardId={selectedCardId} onSelectCard={setSelectedCardId} />
        {!selectedCardId && (
          <div className="mt-2 text-xs text-neutral-500">Tip: select a card to highlight valid targets.</div>
        )}
      </div>

      <div className="col-span-2 rounded border border-neutral-800 bg-neutral-950 p-3">
        <div className="mb-2 text-sm font-semibold text-neutral-200">Combat Log</div>
        <CombatLog />
      </div>
    </div>
  );
}


