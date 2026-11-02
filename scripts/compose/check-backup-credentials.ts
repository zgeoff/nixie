import { $ } from 'bun';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { findCredentialBreach } from './find-credential-breach.ts';

const composeFiles = ['-f', 'compose.yaml', '-f', 'ci/compose.yaml'];

async function runCLI(): Promise<void> {
  const command = parseStepCommand('check-backup-credentials.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const config: unknown = await $`docker compose ${composeFiles} config --format json`
    .cwd('deploy/compose')
    .json();

  const breach = findCredentialBreach(config);

  if (breach !== null) {
    console.log(`::error::${breach}`);

    process.exitCode = 1;

    return;
  }

  console.log('the backup credentials stay apart');
}

if (import.meta.main) {
  await runCLI();
}
