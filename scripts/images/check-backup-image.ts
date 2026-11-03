import { readFileSync } from 'node:fs';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

const binariesPath = 'apps/backup-job/binaries.txt';

// The backup image holds the restic that the binaries file pins, and starts the job with no network
// and a read-only root, as a deployment runs it.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('check-backup-image.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const backup = getStepEnv(process.env, 'BACKUP');
  const pinned = findPinnedVersion(readFileSync(binariesPath, 'utf8'), 'restic');

  const printed =
    await $`docker run --rm --network none --entrypoint restic ${backup} version`.text();

  process.stdout.write(printed);

  if (
    pinned === null ||
    !printed.split('\n').some((line) => line.startsWith(`restic ${pinned} `))
  ) {
    console.log(`::error::the backup image runs another restic than ${binariesPath} pins`);

    process.exitCode = 1;

    return;
  }

  await $`docker run --rm --network none --read-only ${backup} --help`;
}

function findPinnedVersion(binaries: string, name: string): string | null {
  const fields = binaries
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .map((line) => line.split(/\s+/u))
    .find((line) => line[0] === name);

  return fields?.[1] ?? null;
}

if (import.meta.main) {
  await runCLI();
}
