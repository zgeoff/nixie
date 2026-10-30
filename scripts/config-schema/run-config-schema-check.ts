import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { runIntoSummary } from '../lib/run-into-summary.ts';

// Checks the pull request's config schema against its base's; a base that holds no schema yet
// leaves the check nothing to compare.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('run-config-schema-check.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const base = getStepEnv(process.env, 'BASE');
  const title = getStepEnv(process.env, 'TITLE');
  const summaryPath = getStepEnv(process.env, 'GITHUB_STEP_SUMMARY');
  const check = ['bun', 'apps/server/src/run-config-schema-check.ts'];

  const shown = await $`git show ${`origin/${base}:apps/server/config.schema.json`}`
    .nothrow()
    .quiet();

  if (shown.exitCode !== 0) {
    process.exitCode = await runIntoSummary([...check, '--title', title], summaryPath);

    return;
  }

  const basePath = join(getStepEnv(process.env, 'RUNNER_TEMP'), 'base-config.schema.json');

  writeFileSync(basePath, shown.stdout);

  process.exitCode = await runIntoSummary(
    [...check, '--released', basePath, '--last-tag', base, '--title', title],
    summaryPath,
  );
}

if (import.meta.main) {
  await runCLI();
}
