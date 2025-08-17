import yaml from 'js-yaml';
import { CardYamlSchema, type CardYaml } from './schema';
import type { CardDefinition, CardId } from '../domain/types';

export interface LoadResult {
  cards: Record<CardId, CardDefinition>;
  errors: string[];
}

function normalizeCardYaml(card: CardYaml): CardDefinition {
  const targetingMap: Record<CardYaml['targeting'], { side: 'ally' | 'enemy' | 'self' | 'any'; targeting: 'single' | 'all' }> = {
    self: { side: 'self', targeting: 'single' },
    ally: { side: 'ally', targeting: 'single' },
    enemy: { side: 'enemy', targeting: 'single' },
    allEnemies: { side: 'enemy', targeting: 'all' },
    allAllies: { side: 'ally', targeting: 'all' },
  };
  const tt = targetingMap[card.targeting ?? 'enemy'];
  return {
    id: card.id,
    name: card.name,
    rarity: card.rarity,
    cost: { energy: card.cost },
    exhausts: card.exhaust,
    targetSide: tt.side,
    targeting: tt.targeting,
    effects: card.effects,
  };
}

export async function loadAllContent(): Promise<LoadResult> {
  const files = import.meta.glob('/content/**/*.yaml', { as: 'raw', eager: true });
  const cards: Record<string, CardDefinition> = {};
  const errors: string[] = [];
  for (const [path, raw] of Object.entries(files)) {
    try {
      const doc = yaml.load(raw as string);
      const parsed = CardYamlSchema.safeParse(doc);
      if (!parsed.success) {
        errors.push(`${path}: ${parsed.error.message}`);
        continue;
      }
      const def = normalizeCardYaml(parsed.data);
      cards[def.id] = def;
    } catch (e) {
      errors.push(`${path}: ${(e as Error).message}`);
    }
  }
  return { cards, errors };
}


