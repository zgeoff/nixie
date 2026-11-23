import { z } from 'zod';
import { buildTemplateSchema } from '../template/build-template-schema';
import { skillExportMessagePlaceholders } from './skill-export-message-placeholders';
import { skillExportTitlePlaceholders } from './skill-export-title-placeholders';

const pathSourceSchema = z.strictObject({ kind: z.literal('path'), path: z.string().min(1) });

const appSchema = z.strictObject({
  client_id: z.string().min(1),
  installation_id: z.number().int().positive(),
});

const exportSchema = z.strictObject({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/u, 'use owner/name'),
  base: z.string().min(1).default('main'),
  api_url: z.url({ protocol: /^https$/u }).default('https://api.github.com'),
  app: appSchema.optional(),
  title: buildTemplateSchema(skillExportTitlePlaceholders).optional(),
  message: buildTemplateSchema(skillExportMessagePlaceholders).optional(),
});

export interface DefinitionsExportConfig {
  readonly repository: string;
  readonly base: string;
  readonly apiURL: string;

  // the GitHub App that signs the export in, with its private key in the secrets file
  readonly app: { readonly clientID: string; readonly installationID: number } | null;

  readonly title: string | null;
  readonly message: string | null;
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
            app:
              config.export.app === undefined
                ? null
                : {
                    clientID: config.export.app.client_id,
                    installationID: config.export.app.installation_id,
                  },
            title: config.export.title ?? null,
            message: config.export.message ?? null,
          },
        }),
  }));
