import { join } from 'node:path';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

// The lane runs on the restic the backup image carries, so it proves the forget against the binary
// that ships.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('run-restic-lane.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const backup = getStepEnv(process.env, 'BACKUP');
  const restic = join(getStepEnv(process.env, 'RUNNER_TEMP'), 'restic');

  const created = await $`docker create ${backup}`.text();

  const container = created.trim();

  await $`docker cp ${`${container}:/usr/local/bin/restic`} ${restic}`;

  await $`docker rm ${container}`.quiet();

  const lane = await $`bun run test:restic`
    .env({ ...process.env, NIXIE_RESTIC_BINARY: restic })
    .nothrow();

  process.exitCode = lane.exitCode;
}

if (import.meta.main) {
  await runCLI();
}
