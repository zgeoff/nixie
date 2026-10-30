import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

const releaseManifestPath = 'apps/server/src/run-release-manifest.ts';

// Publishes release.json, the config schema and the definitions manifest schema; a re-run replaces
// the assets of an earlier attempt, so it publishes the same files.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('publish-release-json.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const runnerTemp = getStepEnv(process.env, 'RUNNER_TEMP');
  const tag = getStepEnv(process.env, 'TAG');
  const migrationsPath = join(runnerTemp, 'migrations.json');
  const configSchemaPath = join(runnerTemp, 'config-schema.json');
  const releasePath = join(runnerTemp, 'release.json');

  writeFileSync(migrationsPath, `${getStepEnv(process.env, 'MIGRATIONS')}\n`);
  writeFileSync(configSchemaPath, `${getStepEnv(process.env, 'CONFIG_SCHEMA')}\n`);

  await $`bun ${releaseManifestPath} --version ${getStepEnv(process.env, 'VERSION')} --commit ${getStepEnv(process.env, 'SHA')} --server ${getStepEnv(process.env, 'NIXIE')} --web ${getStepEnv(process.env, 'WEB')} --conversation ${getStepEnv(process.env, 'CONVERSATION')} --fetch ${getStepEnv(process.env, 'FETCH')} --migrations ${migrationsPath} --config-schema ${configSchemaPath} --out ${releasePath}`;
  await $`bash .github/scripts/publish-release-assets.sh ${tag} ${releasePath}`;

  appendFileSync(
    getStepEnv(process.env, 'GITHUB_STEP_SUMMARY'),
    `## release.json\n\n\`\`\`json\n${readFileSync(releasePath, 'utf8')}\`\`\`\n`,
  );
}

if (import.meta.main) {
  await runCLI();
}
