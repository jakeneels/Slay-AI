import type { CardDefinition, CardId, CharacterState } from '../domain/types';
import { useBattleStore } from '../state/store';

interface HandProps {
  selectedCardId: CardId | null;
  onSelectCard: (cardId: CardId | null) => void;
}

export default function Hand({ selectedCardId, onSelectCard }: HandProps) {
  const { state } = useBattleStore();
  const activeId = state.activeCharacterId;
  if (!activeId) return null;

  const actor: CharacterState | undefined = [...state.party, ...state.enemies].find(
    (c) => c.id === activeId,
  );
  if (!actor) return null;

  const getCard = (id: CardId): CardDefinition | undefined => state.cardLibrary[id];

  return (
    <div className="mt-1">
      <div className="text-sm font-semibold text-neutral-200">Hand</div>
      <div className="mt-2 flex flex-wrap gap-3">
        {actor.hand.length === 0 && (
          <div className="text-sm text-neutral-500">No cards in hand. Start turn to draw.</div>
        )}
        {actor.hand.map((id) => {
          const card = getCard(id);
          if (!card) return null;
          const canAfford = actor.currentEnergy >= card.cost.energy;
          const isSelected = selectedCardId === id;
          return (
            <button
              key={id}
              className={`rounded border px-4 py-3 text-left text-sm bg-neutral-900 ${
                isSelected ? 'border-emerald-400' : 'border-neutral-700'
              } ${canAfford ? 'hover:bg-neutral-800' : 'opacity-60'}`}
              onClick={() => onSelectCard(isSelected ? null : id)}
              disabled={!canAfford}
              title={!canAfford ? 'Not enough energy' : ''}
              style={{ cursor: canAfford ? 'pointer' : 'not-allowed' }}
            >
              <div className="font-semibold tracking-wide">{isSelected ? '[Selected] ' : ''}{card.name}</div>
              <div className="mt-1 text-xs text-neutral-400 flex gap-3">
                <span>Cost {card.cost.energy}</span>
                <span className="capitalize">{card.rarity}</span>
                {card.exhausts && <span>exhausts</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}


