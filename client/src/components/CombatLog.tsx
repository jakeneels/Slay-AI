import { useBattleStore } from '../state/store';

export default function CombatLog() {
  const { state } = useBattleStore();
  if (!state.combatLog || state.combatLog.length === 0) return null;
  return (
    <div className="text-xs text-neutral-300 space-y-1 max-h-40 overflow-auto">
      {state.combatLog.map((line, idx) => (
        <div key={idx} className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1">
          {line}
        </div>
      ))}
    </div>
  );
}


