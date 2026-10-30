import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

const manifestPath = 'apps/server/sandbox-manifest.json';

async function runCLI(): Promise<void> {
  const command = parseStepCommand('check-carried-manifest.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const nixie = getStepEnv(process.env, 'NIXIE');
  const carriedPath = join(getStepEnv(process.env, 'RUNNER_TEMP'), 'carried.json');

  const carried =
    await $`docker run --rm --entrypoint cat ${nixie} /app/sandbox-manifest.json`.text();

  writeFileSync(carriedPath, carried);

  process.stdout.write(carried);

  const carriedManifest: unknown = JSON.parse(carried);
  const writtenManifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));

  if (!Bun.deepEquals(carriedManifest, writtenManifest)) {
    console.log(`::error::the nixie image carries another sandbox manifest than ${manifestPath}`);

    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await runCLI();
}
