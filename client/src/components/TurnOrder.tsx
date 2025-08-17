import { useBattleStore } from '../state/store';

export default function TurnOrder() {
  const { state } = useBattleStore();
  const items = state.turnOrder.map((id) => {
    const c = [...state.party, ...state.enemies].find((x) => x.id === id);
    return { id, name: c?.name ?? id };
  });
  return (
    <div className="flex flex-wrap gap-2 text-xs text-neutral-300">
      {items.map((it, i) => (
        <div key={it.id} className={`rounded border px-2 py-1 bg-neutral-900 ${state.activeCharacterId === it.id ? 'border-emerald-400' : 'border-neutral-700'}`}>
          <span className="text-neutral-500 mr-1">{i + 1}.</span>
          <span className="font-medium">{it.name}</span>
        </div>
      ))}
    </div>
  );
}


