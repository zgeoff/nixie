import { z } from 'zod';

const egressSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('public') }),
  z.object({ kind: z.literal('allow'), hosts: z.string().array().readonly() }),
]);

const grantSchema = z.object({
  secret: z.string(),
  host: z.string(),
  env: z.record(z.string(), z.string()),
});

const limitsSchema = z.object({
  vcpus: z.number(),
  memoryMiB: z.number(),
  diskMiB: z.number(),
});

// A sandbox's spec as its created record holds it, which the projection keeps for crash recovery.
export const sandboxSpecSchema = z.object({
  kind: z.enum(['conversation', 'checker', 'worker', 'code_run', 'fetch', 'coding']),
  image: z.string(),
  owner: z.string(),
  egress: egressSchema,
  grants: grantSchema.array().readonly(),
  toolRoute: z.boolean(),
  limits: limitsSchema,
});
