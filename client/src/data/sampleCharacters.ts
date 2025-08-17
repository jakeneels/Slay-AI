import type { CharacterState } from '../domain/types';

export const sampleParty: CharacterState[] = [
  {
    id: 'p1',
    name: 'Operative',
    stats: { maxHealth: 40, speed: 6, maxEnergy: 3, energyRegenPerTurn: 1 },
    currentHealth: 40,
    currentEnergy: 3,
    deck: [
      // common duplicated copies
      'strike_common', 'strike_common', 'strike_common', 'strike_common',
      'defend_common', 'defend_common', 'defend_common',
      // rare copies
      'blast_rare', 'blast_rare',
      // mythic
      'overclock_mythic',
    ],
    drawPile: [],
    hand: [],
    discardPile: [],
    exhaustPile: [],
    isDefeated: false,
  },
  {
    id: 'p2',
    name: 'Mechanist',
    stats: { maxHealth: 48, speed: 4, maxEnergy: 4, energyRegenPerTurn: 1 },
    currentHealth: 48,
    currentEnergy: 4,
    deck: [
      'strike_common', 'strike_common', 'strike_common',
      'defend_common', 'defend_common',
      'blast_rare',
    ],
    drawPile: [],
    hand: [],
    discardPile: [],
    exhaustPile: [],
    isDefeated: false,
  },
  {
    id: 'p3',
    name: 'Hybrid',
    stats: { maxHealth: 36, speed: 7, maxEnergy: 3, energyRegenPerTurn: 2 },
    currentHealth: 36,
    currentEnergy: 3,
    deck: [
      'strike_common', 'strike_common',
      'defend_common', 'defend_common',
      'blast_rare',
    ],
    drawPile: [],
    hand: [],
    discardPile: [],
    exhaustPile: [],
    isDefeated: false,
  },
  {
    id: 'p4',
    name: 'Mutant',
    stats: { maxHealth: 52, speed: 3, maxEnergy: 5, energyRegenPerTurn: 1 },
    currentHealth: 52,
    currentEnergy: 5,
    deck: [
      'strike_common', 'strike_common', 'strike_common',
      'defend_common', 'defend_common',
      'blast_rare',
    ],
    drawPile: [],
    hand: [],
    discardPile: [],
    exhaustPile: [],
    isDefeated: false,
  },
];

export const sampleEnemies: CharacterState[] = [
  {
    id: 'e1',
    name: 'Rogue Drone',
    stats: { maxHealth: 30, speed: 5, maxEnergy: 3, energyRegenPerTurn: 1 },
    currentHealth: 30,
    currentEnergy: 3,
    deck: ['strike_common', 'strike_common', 'defend_common'],
    drawPile: [],
    hand: [],
    discardPile: [],
    exhaustPile: [],
    isDefeated: false,
  },
  {
    id: 'e2',
    name: 'Sentinel',
    stats: { maxHealth: 42, speed: 2, maxEnergy: 4, energyRegenPerTurn: 1 },
    currentHealth: 42,
    currentEnergy: 4,
    deck: ['strike_common', 'defend_common', 'blast_rare'],
    drawPile: [],
    hand: [],
    discardPile: [],
    exhaustPile: [],
    isDefeated: false,
  },
];


