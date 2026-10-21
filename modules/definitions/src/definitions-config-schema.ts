import { z } from 'zod';

const pathSourceSchema = z.strictObject({ kind: z.literal('path'), path: z.string().min(1) });

const exportSchema = z.strictObject({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/u, 'use owner/name'),
  base: z.string().min(1).default('main'),
  api_url: z.url({ protocol: /^https$/u }).default('https://api.github.com'),
});

export interface DefinitionsExportConfig {
  readonly repository: string;
  readonly base: string;
  readonly apiURL: string;
}

export interface DefinitionsConfig {
  readonly source: { readonly kind: 'path'; readonly path: string };
  readonly probeIntervalMs: number;
  readonly export?: DefinitionsExportConfig;
}

export const definitionsConfigSchema = z
  .strictObject({
    source: z.discriminatedUnion('kind', [pathSourceSchema]),
    probe_interval_ms: z.number().int().positive().default(300_000),
    export: exportSchema.optional(),
  })
  .transform((config): DefinitionsConfig => ({
    source: config.source,
    probeIntervalMs: config.probe_interval_ms,
    ...(config.export === undefined
      ? {}
      : {
          export: {
            repository: config.export.repository,
            base: config.export.base,
            apiURL: config.export.api_url,
          },
        }),
  }));
