import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { BattleState, EngineAction } from '../domain/types';
import { reducer } from '../domain/engine';
import { runEnemyTurn } from '../domain/ai';

interface BattleStoreState {
  state: BattleState;
  dispatch: (action: EngineAction) => void;
  hydrate: (initial: BattleState) => void;
}

export const useBattleStore = create<BattleStoreState>()(
  immer((set) => ({
    state: {
      party: [],
      enemies: [],
      cardLibrary: {},
      turnIndex: 0,
      turnOrder: [],
      activeCharacterId: null,
      round: 0,
      rngSeed: 'seed',
    },
    dispatch: (action) =>
      set((draft) => {
        draft.state = reducer(draft.state, action);
        // Auto-run enemy turns until it's a player again or battle finished
        // Trigger only after advancing turn or starting battle
        if (
          action.type === 'endTurn' ||
          action.type === 'initializeBattle' ||
          action.type === 'startTurn'
        ) {
          while (draft.state.activeCharacterId && !draft.state.battleOutcome) {
            const isEnemy = draft.state.enemies.some((e) => e.id === draft.state.activeCharacterId);
            if (!isEnemy) break;
            draft.state = runEnemyTurn(draft.state);
          }
        }
      }),
    hydrate: (initial) => set({ state: initial }),
  })),
);


