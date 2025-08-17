import type { CardDefinition } from '../domain/types';

export const sampleCards: Record<string, CardDefinition> = {
  strike_common: {
    id: 'strike_common',
    name: 'Strike',
    rarity: 'common',
    cost: { energy: 1 },
    exhausts: false,
    targetSide: 'enemy',
    targeting: 'single',
    effects: [{ kind: 'damage', amount: 6 }],
  },
  defend_common: {
    id: 'defend_common',
    name: 'Recharge',
    rarity: 'common',
    cost: { energy: 0 },
    exhausts: false,
    targetSide: 'self',
    targeting: 'single',
    effects: [{ kind: 'energy', amount: 1 }],
  },
  blast_rare: {
    id: 'blast_rare',
    name: 'Blast',
    rarity: 'rare',
    cost: { energy: 2 },
    exhausts: false,
    targetSide: 'enemy',
    targeting: 'single',
    effects: [{ kind: 'damage', amount: 45 }],
  },
  overclock_mythic: {
    id: 'overclock_mythic',
    name: 'Overclock',
    rarity: 'mythic',
    cost: { energy: 1 },
    exhausts: true,
    targetSide: 'ally',
    targeting: 'single',
    effects: [
      { kind: 'energy', amount: 2 },
      { kind: 'speed', amount: 2 },
    ],
  },
};


