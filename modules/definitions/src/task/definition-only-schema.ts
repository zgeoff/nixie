import { destinationPatternSchema } from '@heynixie/policy';
import { z } from 'zod';

export const definitionOnlyKeys = [
  'enabled',
  'trigger',
  'context',
  'wakeable',
  'step',
  'destinations',
  'maxCalls',
  'skills',
] as const;

export const definitionOnlySchema = z.object({
  enabled: z.boolean().default(true),
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
  skills: z.array(z.string()).optional(),
});

export const maxCallsSchema = z.record(z.string(), z.number()).default({});
