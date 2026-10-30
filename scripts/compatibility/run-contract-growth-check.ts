import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

// Compares the contract this commit builds with the one the last release committed.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('run-contract-growth-check.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const tag = getStepEnv(process.env, 'TAG');
  const lastPath = join(getStepEnv(process.env, 'RUNNER_TEMP'), 'last-openapi.json');

  await $`bun run --cwd libs/contract openapi`;

  const lastContract = await $`git show ${`${tag}:libs/contract/openapi.json`}`.text();

  writeFileSync(lastPath, lastContract);

  const check =
    await $`bash .github/scripts/check-contract-growth.sh ${lastPath} libs/contract/openapi.json libs/contract/accepted-breaks.txt`.nothrow();

  process.exitCode = check.exitCode;
}

if (import.meta.main) {
  await runCLI();
}
