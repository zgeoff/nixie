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
  const binaries = readFileSync(binariesPath, 'utf8');

  const printed =
    await $`docker run --rm --network none --entrypoint restic ${backup} version`.text();

  process.stdout.write(printed);

  if (!isPinnedResticPrinted(binaries, printed)) {
    console.log(`::error::the backup image runs another restic than ${binariesPath} pins`);

    process.exitCode = 1;

    return;
  }

  await $`docker run --rm --network none --read-only ${backup} --help`;
}

function isPinnedResticPrinted(binaries: string, printed: string): boolean {
  const pinned = binaries
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .map((line) => line.split(/\s+/u))
    .find((fields) => fields[0] === 'restic')?.[1];

  return (
    pinned !== undefined && printed.split('\n').some((line) => line.startsWith(`restic ${pinned} `))
  );
}

if (import.meta.main) {
  await runCLI();
}
