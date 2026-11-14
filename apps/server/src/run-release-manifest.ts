import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { sandboxImageKeys } from '@heynixie/sandbox';
import { z } from 'zod';
import { buildImageShape } from './build-image-shape';
import { buildReleaseManifest } from './build-release-manifest';
import { imageRefSchema } from './load-sandbox-manifest';

const addedMigrationSchema = z.strictObject({ version: z.int().positive(), name: z.string() });

const migrationSummarySchema = z.strictObject({
  since: z.string().nullable(),
  added: z.array(addedMigrationSchema),
  readableByReleaseBefore: z.boolean().nullable(),
});

const configSchemaSummarySchema = z.strictObject({
  since: z.string().nullable(),
  breaking: z.array(z.string()),
});

const required = { type: 'string', default: '' } as const;

const args = parseArgs({
  options: {
    version: required,
    commit: required,
    server: required,
    web: required,
    'sandbox-manifest': required,
    backup: required,
    migrations: required,
    'config-schema': required,
    out: required,
  },
});

const missing = Object.entries(args.values)
  .filter(([, value]) => value === '')
  .map(([name]) => `--${name}`);

if (missing.length > 0) {
  process.stderr.write(`usage: run-release-manifest.ts needs ${missing.join(', ')}\n`);
  process.exit(2);
}

const migrationsText = await readFile(args.values.migrations, 'utf8');
const configSchemaText = await readFile(args.values['config-schema'], 'utf8');
const sandboxManifestText = await readFile(args.values['sandbox-manifest'], 'utf8');

const sandboxImages = buildImageShape(sandboxImageKeys, imageRefSchema, 'required').parse(
  JSON.parse(sandboxManifestText),
);

const manifest = buildReleaseManifest({
  version: args.values.version,
  commit: args.values.commit,
  images: {
    server: args.values.server,
    web: args.values.web,
    backup: args.values.backup,
  },
  sandboxImages,
  migrations: migrationSummarySchema.parse(JSON.parse(migrationsText)),
  configSchema: configSchemaSummarySchema.parse(JSON.parse(configSchemaText)),
});

await writeFile(args.values.out, `${JSON.stringify(manifest, null, 2)}\n`);

process.stdout.write(`wrote ${args.values.out}\n`);
