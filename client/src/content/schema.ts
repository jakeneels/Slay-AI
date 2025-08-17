import { z } from 'zod';

export const EffectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('damage'), amount: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('heal'), amount: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('energy'), amount: z.number().int() }),
  z.object({ kind: z.literal('speed'), amount: z.number().int() }),
]);

export const CardYamlSchema = z.object({
  schemaVersion: z.number().int().default(1),
  id: z.string(),
  name: z.string(),
  type: z.enum(['attack', 'skill', 'power', 'summon']).optional(),
  rarity: z.enum(['common', 'rare', 'mythic']),
  cost: z.number().int().nonnegative(),
  copies: z.number().int().positive().default(1),
  tags: z.array(z.string()).optional(),
  targeting: z.enum(['self', 'ally', 'enemy', 'allEnemies', 'allAllies']).default('enemy'),
  exhaust: z.boolean().default(false),
  expires_after_turns: z.number().int().nonnegative().default(0),
  effects: z.array(EffectSchema),
});

export type CardYaml = z.infer<typeof CardYamlSchema>;


