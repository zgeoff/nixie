import { z } from 'zod';

// The definitions section of the deployment configuration: the source the seed reads, and how often
// nixie probes it for a new revision, every 5 min by default. Slice 1 builds the path source only,
// so the source is a directory on the host or a volume mounted into the container.
const pathSourceSchema = z.strictObject({ kind: z.literal('path'), path: z.string().min(1) });

export interface DefinitionsConfig {
  readonly source: { readonly kind: 'path'; readonly path: string };
  readonly probeIntervalMs: number;
}

export const definitionsConfigSchema = z
  .strictObject({
    source: z.discriminatedUnion('kind', [pathSourceSchema]),
    probe_interval_ms: z.number().int().positive().default(300_000),
  })
  .transform((config): DefinitionsConfig => ({
    source: config.source,
    probeIntervalMs: config.probe_interval_ms,
  }));
