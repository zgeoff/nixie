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
  'connections',
] as const;

const connectionsSchema = z.record(z.string(), z.array(z.string()));

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

  // The short IDs of the connections each connector tool of the list may use. A version with no key
  // pins nothing, and a connector tool that the map leaves out reaches every live connection.
  connections: connectionsSchema.optional(),
});

export const maxCallsSchema = z.record(z.string(), z.number()).default({});
