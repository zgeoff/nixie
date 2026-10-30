import { readFileSync } from 'node:fs';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

const composeFiles = ['-f', 'compose.yaml', '-f', 'ci/compose.yaml'];
const keyPath = '/etc/nixie/secrets/age.key';

// nixie's user reads the age key that sops would read, and setup gave it to that user alone.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('check-age-key.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const ageKeyFile = getStepEnv(process.env, 'NIXIE_AGE_KEY_FILE');

  const carried = await $`docker compose ${composeFiles} exec -T nixie cat ${keyPath}`
    .cwd('deploy/compose')
    .text();

  if (carried !== readFileSync(ageKeyFile, 'utf8')) {
    console.log(`::error::nixie reads another age key at ${keyPath}`);

    process.exitCode = 1;

    return;
  }

  const stat = await $`docker compose ${composeFiles} exec -T nixie stat -c ${'%a %u'} ${keyPath}`
    .cwd('deploy/compose')
    .text();

  const owner = stat.trim();

  if (owner !== '400 10001') {
    console.log(`::error::${keyPath} has mode and owner ${owner}, not 400 10001`);

    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await runCLI();
}
