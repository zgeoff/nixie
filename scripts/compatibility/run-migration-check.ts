import { join } from 'node:path';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { runIntoSummary } from '../lib/run-into-summary.ts';

// Checks the migrations since the last release against the schema that release reads; before the
// first release, TAG is empty and the check has nothing to compare.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('run-migration-check.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const tag = getStepEnv(process.env, 'TAG');
  const summaryPath = getStepEnv(process.env, 'GITHUB_STEP_SUMMARY');
  const check = ['bun', 'libs/db/src/run-migration-check.ts'];

  if (tag === '') {
    process.exitCode = await runIntoSummary(check, summaryPath);

    return;
  }

  const releasedPath = join(getStepEnv(process.env, 'RUNNER_TEMP'), 'released.json');

  await $`bash .github/scripts/read-released-schema.sh ${tag} ${releasedPath}`;

  process.exitCode = await runIntoSummary(
    [...check, '--released', releasedPath, '--last-tag', tag],
    summaryPath,
  );
}

if (import.meta.main) {
  await runCLI();
}
