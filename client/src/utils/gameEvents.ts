/**
 * Structured event logging for game observability.
 * All events use [GAME] prefix for easy filtering (e.g. grep, log aggregation).
 *
 * Key flows:
 * - combat.victory / combat.defeat: all enemies or allies dead
 * - card.hit: X card hit X targets (caster, target names, count)
 * - character.defeated: when a character reaches 0 HP
 * - turn.advance: whose turn it is
 */

const PREFIX = '[GAME]';

export function logGameEvent(
  eventType: string,
  data: Record<string, string | number | string[] | boolean>
): void {
  const payload = JSON.stringify(data);
  console.log(`${PREFIX} ${eventType} ${payload}`);
}

export function logCardHit(
  cardName: string,
  casterName: string,
  casterIsPlayer: boolean,
  targetCount: number,
  targetNames: string[],
  targetSide: 'enemy' | 'ally'
): void {
  logGameEvent('card.hit', {
    card: cardName,
    caster: casterName,
    casterIsPlayer,
    targetCount,
    targets: targetNames,
    targetSide,
  });
}

export function logAllEnemiesDead(): void {
  logGameEvent('combat.victory', { reason: 'all_enemies_dead' });
}

export function logAllAlliesDead(): void {
  logGameEvent('combat.defeat', { reason: 'all_allies_dead' });
}

export function logCharacterDefeated(characterName: string, characterId: string, wasPlayer: boolean): void {
  logGameEvent('character.defeated', {
    name: characterName,
    id: characterId,
    wasPlayer,
  });
}

export function logTurnAdvance(characterName: string, characterId: string, isPlayer: boolean, turnIndex: number): void {
  logGameEvent('turn.advance', {
    character: characterName,
    id: characterId,
    isPlayer,
    turnIndex,
  });
}
