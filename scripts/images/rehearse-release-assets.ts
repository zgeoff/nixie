import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { releaseImagesSchema } from '../../apps/server/src/release-images-schema.ts';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

const migrationCheckPath = 'libs/db/src/run-migration-check.ts';
const configSchemaCheckPath = 'apps/server/src/run-config-schema-check.ts';
const releaseManifestPath = 'apps/server/src/run-release-manifest.ts';

// The release's assets stage on the rehearsal digests, with the summaries the notes stage writes:
// every image that release.json names must resolve its tag to its digest, and the upload script
// runs against a stand-in for gh.
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

  await $`bun ${releaseManifestPath} --version 0.0.0-rehearsal --commit ${getStepEnv(process.env, 'GITHUB_SHA')} --server ${getStepEnv(process.env, 'NIXIE')} --web ${getStepEnv(process.env, 'WEB')} --conversation ${getStepEnv(process.env, 'CONVERSATION')} --fetch ${getStepEnv(process.env, 'FETCH')} --migrations ${migrationsPath} --config-schema ${configSchemaPath} --out ${releasePath}`;

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

  await $`bash .github/scripts/check-publish-release-assets.sh ${releasePath}`;

  appendFileSync(summaryPath, `## release.json\n\n\`\`\`json\n${release}\`\`\`\n`);
}

if (import.meta.main) {
  await runCLI();
}
