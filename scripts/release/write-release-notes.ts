import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { writeStepValues } from '../lib/write-step-values.ts';
import { buildReleaseNoteComparisons } from './build-release-note-comparisons.ts';

const migrationCheckPath = 'libs/db/src/run-migration-check.ts';
const configSchemaCheckPath = 'apps/server/src/run-config-schema-check.ts';

// Appends the migrations, the config schema and the images to the release notes. Both checks
// compare with the last release, and a release before the first one that commits the config
// schema has none to compare.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('write-release-notes.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const tag = getStepEnv(process.env, 'TAG');
  const sha = getStepEnv(process.env, 'SHA');
  const runnerTemp = getStepEnv(process.env, 'RUNNER_TEMP');

  const images = ['CONVERSATION', 'FETCH', 'NIXIE', 'WEB'].map((name) =>
    getStepEnv(process.env, name),
  );

  const bodyPath = join(runnerTemp, 'body.md');
  const migrationsPath = join(runnerTemp, 'migrations.json');
  const configSchemaPath = join(runnerTemp, 'config-schema.json');

  const body = await $`gh release view ${tag} --json body --jq .body`.text();

  writeFileSync(bodyPath, body);

  const described = await $`git describe --tags --abbrev=0 --match ${'v*'} ${`${sha}^`}`
    .nothrow()
    .quiet();

  const last = described.exitCode === 0 ? described.stdout.toString().trim() : '';
  const releasedSchemaPath = join(runnerTemp, 'released.json');
  const releasedConfigPath = join(runnerTemp, 'released-config.schema.json');
  let hasConfigSchema = false;

  if (last !== '') {
    hasConfigSchema = await writeReleasedConfig(last, releasedConfigPath);

    await $`bash .github/scripts/read-released-schema.sh ${last} ${releasedSchemaPath}`;
  }

  const comparisons = buildReleaseNoteComparisons({
    tag: last,
    hasConfigSchema,
    releasedSchemaPath,
    releasedConfigPath,
  });

  await $`bun ${migrationCheckPath} ${comparisons.migrations} --release-body ${bodyPath} --summary ${migrationsPath}`;
  await $`bun ${configSchemaCheckPath} ${comparisons.configSchema} --release-body ${bodyPath} --summary ${configSchemaPath}`;

  writeStepValues(getStepEnv(process.env, 'GITHUB_OUTPUT'), {
    migrations: toCompactJSON(readFileSync(migrationsPath, 'utf8')),
    'config-schema': toCompactJSON(readFileSync(configSchemaPath, 'utf8')),
  });

  appendFileSync(bodyPath, `\n## Images\n\n${images.map((ref) => `- \`${ref}\`\n`).join('')}`);

  await $`gh release edit ${tag} --notes-file ${bodyPath}`;

  appendFileSync(getStepEnv(process.env, 'GITHUB_STEP_SUMMARY'), readFileSync(bodyPath, 'utf8'));
}

// A release from before the config schema was committed holds none, so this returns false.
async function writeReleasedConfig(tag: string, path: string): Promise<boolean> {
  const shown = await $`git show ${`${tag}:apps/server/config.schema.json`}`.nothrow().quiet();

  if (shown.exitCode !== 0) {
    return false;
  }

  writeFileSync(path, shown.stdout);

  return true;
}

function toCompactJSON(text: string): string {
  return JSON.stringify(JSON.parse(text));
}

if (import.meta.main) {
  await runCLI();
}
