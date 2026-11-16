import { destinationPatternSchema } from '@heynixie/policy';
import { z } from 'zod';

export const definitionOnlyKeys = [
  'enabled',
  'trigger',
  'target',
  'context',
  'wakeable',
  'step',
  'destinations',
  'maxCalls',
] as const;

export const definitionOnlySchema = z.object({
  enabled: z.boolean().default(true),
  target: z.enum(['task', 'conversation']).default('task'),
  context: z.enum(['fresh', 'continuing']).default('fresh'),
  wakeable: z.boolean().default(false),
  step: z
    .strictObject({
      file: z.string().regex(/^[^/]+\.ts$/u, 'a step file is a .ts file'),
      api: z.literal(1),
    })
    .nullable()
    .default(null),
  destinations: z.array(destinationPatternSchema).default([]),
});

export const maxCallsSchema = z.record(z.string(), z.number()).default({});
