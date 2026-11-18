import { appendFileSync, chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { releaseImagesSchema } from '../../apps/server/src/release/release-images-schema.ts';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

const migrationCheckPath = 'libs/db/src/run-migration-check.ts';
const configSchemaCheckPath = 'apps/server/src/run-config-schema-check.ts';
const releaseManifestPath = 'apps/server/src/run-release-manifest.ts';

// The release's assets stage on the rehearsal digests, with the summaries the notes stage writes:
// every image that release.json names must resolve its tag to its digest, and the upload script
// runs against a stand-in for gh that accepts each upload of an existing file.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('rehearse-release-assets.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const runnerTemp = getStepEnv(process.env, 'RUNNER_TEMP');
  const summaryPath = getStepEnv(process.env, 'GITHUB_STEP_SUMMARY');
  const migrationsPath = join(runnerTemp, 'migrations.json');
  const configSchemaPath = join(runnerTemp, 'config-schema.json');
  const releasePath = join(runnerTemp, 'release.json');

  await $`bun ${migrationCheckPath} --summary ${migrationsPath}`.quiet();
  await $`bun ${configSchemaCheckPath} --summary ${configSchemaPath}`.quiet();

  await $`bun ${releaseManifestPath} --version 0.0.0-rehearsal --commit ${getStepEnv(process.env, 'GITHUB_SHA')} --server ${getStepEnv(process.env, 'NIXIE')} --web ${getStepEnv(process.env, 'WEB')} --sandbox-manifest apps/server/sandbox-manifest.json --backup ${getStepEnv(process.env, 'BACKUP')} --migrations ${migrationsPath} --config-schema ${configSchemaPath} --out ${releasePath}`;

  const release = readFileSync(releasePath, 'utf8');
  const releaseImages = releaseImagesSchema.parse(JSON.parse(release));

  const refs = [
    ...Object.values(releaseImages.images),
    ...Object.values(releaseImages.sandboxImages),
  ];

  for (const ref of refs) {
    const [image = ''] = ref.split('@');

    const inspected =
      await $`docker buildx imagetools inspect ${image} --format ${'{{.Manifest.Digest}}'}`.text();

    const named = inspected.trim();

    if (`${image}@${named}` !== ref) {
      console.log(`::error::release.json names ${ref}, but ${image} names ${named}`);

      process.exitCode = 1;

      return;
    }

    console.log(`${ref} resolves`);
  }

  // the upload script reaches GitHub only through gh, so a gh that accepts each upload of an
  // existing file rehearses it
  const stubPath = join(runnerTemp, 'gh-stub');

  mkdirSync(stubPath, { recursive: true });
  writeFileSync(join(stubPath, 'gh'), '#!/usr/bin/env bash\ntest -f "$4"\n');
  chmodSync(join(stubPath, 'gh'), 0o755);

  await $`bash scripts/release/publish-release-assets.sh v0.0.0-rehearsal ${releasePath}`.env({
    ...process.env,
    PATH: `${stubPath}:${process.env['PATH'] ?? ''}`,
  });

  appendFileSync(summaryPath, `## release.json\n\n\`\`\`json\n${release}\`\`\`\n`);
}

if (import.meta.main) {
  await runCLI();
}
