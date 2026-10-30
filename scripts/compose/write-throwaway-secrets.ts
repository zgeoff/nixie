import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { writeStepValues } from '../lib/write-step-values.ts';

// A plain secrets file with a throwaway key, which the test build's stand-in for sops reads, and an
// invented age key. Each is mode 0600 and owned by the runner's user, as a host's files are, so the
// recipe's start proves that setup hands both to nixie's user.
function runCLI(): void {
  const command = parseStepCommand('write-throwaway-secrets.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const runnerTemp = getStepEnv(process.env, 'RUNNER_TEMP');
  const githubEnv = getStepEnv(process.env, 'GITHUB_ENV');
  const secretsPath = join(runnerTemp, 'secrets.yaml');
  const ageKeyPath = join(runnerTemp, 'age.key');
  const key = randomBytes(32).toString('base64');

  writeFileSync(
    secretsPath,
    `deployment_key: ${key}\nmodel_credentials:\n  anthropic: invented-placeholder\n`,
    { mode: 0o600 },
  );

  writeFileSync(ageKeyPath, 'invented-age-key-for-the-compose-check\n', { mode: 0o600 });
  writeStepValues(githubEnv, { NIXIE_SECRETS_FILE: secretsPath, NIXIE_AGE_KEY_FILE: ageKeyPath });
}

if (import.meta.main) {
  runCLI();
}
