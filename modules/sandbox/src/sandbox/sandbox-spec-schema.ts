import { z } from 'zod';

const egressSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('public') }),
  z.object({ kind: z.literal('allow'), hosts: z.string().array().readonly() }),
]);

const grantSchema = z.object({
  secret: z.string(),
  host: z.string(),

  // absent in a spec stored before a grant held a route
  route: z.string().nullable().exactOptional(),
  env: z.record(z.string(), z.string()),

  // absent for a credential the sandbox host holds, and in a spec stored before grants showed them
  reference: z.string().exactOptional(),
  fingerprint: z.string().exactOptional(),

  // absent in a spec stored before a grant held its paths
  paths: z.string().array().readonly().exactOptional(),
});

const limitsSchema = z.object({
  vcpus: z.number(),
  memoryMiB: z.number(),
  diskMiB: z.number(),
});

export const sandboxSpecSchema = z.object({
  kind: z.enum([
    'conversation',
    'checker',
    'worker',
    'code_run',
    'fetch',
    'coding',
    'computer',
    'render',
    'browser',
    'shell',
  ]),
  image: z.string(),
  owner: z.string(),
  egress: egressSchema,
  grants: grantSchema.array().readonly(),
  toolRoute: z.boolean(),
  limits: limitsSchema,
});
