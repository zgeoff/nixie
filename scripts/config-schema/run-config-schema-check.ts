import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { runIntoSummary } from '../lib/run-into-summary.ts';
import { runProgram } from '../run-program.ts';

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

  const io = {
    runCommand: (argv: readonly string[]) =>
      runProgram(argv, { cwd: process.cwd(), env: process.env }),
    writeOutput: (text: string) => process.stdout.write(text),
    writeError: (text: string) => process.stderr.write(text),
  };

  const shown = await $`git show ${`origin/${base}:apps/server/config.schema.json`}`
    .nothrow()
    .quiet();

  if (shown.exitCode !== 0) {
    process.exitCode = runIntoSummary([...check, '--title', title], summaryPath, io);

    return;
  }

  const basePath = join(getStepEnv(process.env, 'RUNNER_TEMP'), 'base-config.schema.json');

  writeFileSync(basePath, shown.stdout);

  process.exitCode = runIntoSummary(
    [...check, '--released', basePath, '--last-tag', base, '--title', title],
    summaryPath,
    io,
  );
}

if (import.meta.main) {
  await runCLI();
}
