// Modifier Pipeline – central registry for all game value modifiers.
//
// Resolution order for a given target + base value:
//   1. Collect all modifiers matching (target, scope, condition)
//   2. Apply SET ops (last one wins)
//   3. Apply ADD ops (sum all)
//   4. Apply MULTIPLY ops (compound)
//   5. Apply MIN clamps (take highest min)
//   6. Apply MAX clamps (take lowest max)

import type {
  GameModifier,
  ModifierTarget,
  ModifierContext,
  Character,
  Card,
} from './types.js';

// ── ModifierRegistry ─────────────────────────────────────────────────

export class ModifierRegistry {
  /** Internal storage: target -> list of modifiers. */
  private byTarget = new Map<ModifierTarget, GameModifier[]>();

  /** Fast lookup by modifier id for removal. */
  private byId = new Map<string, GameModifier>();

  // ── Mutation ──────────────────────────────────────────────────────

  /** Register a modifier. Replaces any existing modifier with the same id. */
  add(mod: GameModifier): void {
    // Remove old if id already exists
    if (this.byId.has(mod.id)) {
      this.remove(mod.id);
    }
    this.byId.set(mod.id, mod);
    let list = this.byTarget.get(mod.target);
    if (!list) {
      list = [];
      this.byTarget.set(mod.target, list);
    }
    list.push(mod);
  }

  /** Remove a modifier by id. */
  remove(id: string): boolean {
    const mod = this.byId.get(id);
    if (!mod) return false;
    this.byId.delete(id);
    const list = this.byTarget.get(mod.target);
    if (list) {
      const idx = list.indexOf(mod);
      if (idx !== -1) list.splice(idx, 1);
      if (list.length === 0) this.byTarget.delete(mod.target);
    }
    return true;
  }

  /** Remove all modifiers from a given source (e.g. 'devpanel', 'balance'). */
  clearSource(source: string): void {
    const toRemove: string[] = [];
    for (const mod of this.byId.values()) {
      if (mod.source === source) {
        toRemove.push(mod.id);
      }
    }
    for (const id of toRemove) {
      this.remove(id);
    }
  }

  /** Remove every modifier in the registry. */
  clearAll(): void {
    this.byTarget.clear();
    this.byId.clear();
  }

  // ── Resolution ────────────────────────────────────────────────────

  /**
   * Resolve a value through the modifier pipeline.
   *
   * @param target     Modifier target key (e.g. 'maxEnergy', 'damage_dealt')
   * @param baseValue  The raw value before modifiers
   * @param ctx        Context for scope / condition checks
   * @returns          The modified value
   */
  resolve(target: ModifierTarget, baseValue: number, ctx: ModifierContext = {}): number {
    const list = this.byTarget.get(target);
    if (!list || list.length === 0) return baseValue;

    // Filter to matching modifiers
    const matching = list.filter(m => this.matches(m, ctx));
    if (matching.length === 0) return baseValue;

    // Sort by priority (lower first)
    matching.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    let value = baseValue;

    // 1. SET ops – last one wins
    const sets = matching.filter(m => m.op === 'set');
    if (sets.length > 0) {
      value = sets[sets.length - 1].value;
    }

    // 2. ADD ops – sum all
    for (const m of matching) {
      if (m.op === 'add') value += m.value;
    }

    // 3. MULTIPLY ops – compound
    for (const m of matching) {
      if (m.op === 'multiply') value *= m.value;
    }

    // 4. MIN clamps – enforce a floor (take the highest min)
    const mins = matching.filter(m => m.op === 'min');
    if (mins.length > 0) {
      const floor = Math.max(...mins.map(m => m.value));
      value = Math.max(floor, value);
    }

    // 5. MAX clamps – enforce a ceiling (take the lowest max)
    const maxes = matching.filter(m => m.op === 'max');
    if (maxes.length > 0) {
      const ceiling = Math.min(...maxes.map(m => m.value));
      value = Math.min(ceiling, value);
    }

    return value;
  }

  // ── Query ─────────────────────────────────────────────────────────

  /** Get all registered modifiers (read-only snapshot). */
  getAll(): GameModifier[] {
    return [...this.byId.values()];
  }

  /** Get all modifiers for a specific target. */
  getByTarget(target: ModifierTarget): GameModifier[] {
    return [...(this.byTarget.get(target) ?? [])];
  }

  /** Get all modifiers from a specific source. */
  getBySource(source: string): GameModifier[] {
    return this.getAll().filter(m => m.source === source);
  }

  /** Check if a modifier with a given id exists. */
  has(id: string): boolean {
    return this.byId.has(id);
  }

  // ── Scope & condition matching ────────────────────────────────────

  private matches(mod: GameModifier, ctx: ModifierContext): boolean {
    // Scope check
    if (!this.scopeMatches(mod, ctx)) return false;
    // Condition check
    if (mod.condition && !this.conditionMatches(mod.condition, ctx)) return false;
    return true;
  }

  private scopeMatches(mod: GameModifier, ctx: ModifierContext): boolean {
    const scope = mod.scope;
    switch (scope.kind) {
      case 'global':
        return true;

      case 'character':
        return ctx.character?.id === scope.characterId;

      case 'team': {
        if (!ctx.character) return false;
        const charTeam = ctx.character.isPlayer ? 'player' : 'enemy';
        return charTeam === scope.team;
      }

      case 'tag':
        return ctx.character
          ? hasTag(ctx.character, scope.tag)
          : false;

      default:
        return true;
    }
  }

  private conditionMatches(cond: ModifierCondition, ctx: ModifierContext): boolean {
    if (cond.cardType && ctx.card?.type !== cond.cardType) return false;
    if (cond.cardTag && !ctx.card?.tags?.includes(cond.cardTag)) return false;
    return true;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Check if a character has a given tag.
 * Tags live on the character definition, not the runtime Character object,
 * so we check the characterLibrary via a lazy import to avoid circular deps.
 */
function hasTag(character: Character, tag: string): boolean {
  // Characters loaded from YAML have tags on the definition object.
  // At runtime Character doesn't carry tags, so we check a simple heuristic:
  // the character id is the key into characterLibrary which is set on GameState.
  // Since we don't want a circular dep on gameState here, the tag scope
  // is best-effort: we store tags on Character if available, or fall back.
  return false; // TODO: wire up when character tags are on runtime object
}

// ── Singleton ────────────────────────────────────────────────────────

let _registry: ModifierRegistry | null = null;

/** Get (or create) the global modifier registry singleton. */
export function getModifierRegistry(): ModifierRegistry {
  if (!_registry) {
    _registry = new ModifierRegistry();
  }
  return _registry;
}

/** Replace the global registry (e.g. on game reset). */
export function setModifierRegistry(registry: ModifierRegistry): void {
  _registry = registry;
}
