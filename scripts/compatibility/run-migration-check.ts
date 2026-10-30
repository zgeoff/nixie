import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { runIntoSummary } from '../lib/run-into-summary.ts';
import { runProgram } from '../run-program.ts';

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

  const io = {
    runCommand: (argv: readonly string[]) =>
      runProgram(argv, { cwd: process.cwd(), env: process.env }),
    writeOutput: (text: string) => process.stdout.write(text),
    writeError: (text: string) => process.stderr.write(text),
    appendSummary: (text: string) => {
      appendFileSync(summaryPath, text);
    },
  };

  if (tag === '') {
    process.exitCode = runIntoSummary(check, io);

    return;
  }

  const releasedPath = join(getStepEnv(process.env, 'RUNNER_TEMP'), 'released.json');

  await $`bash .github/scripts/read-released-schema.sh ${tag} ${releasedPath}`;

  process.exitCode = runIntoSummary([...check, '--released', releasedPath, '--last-tag', tag], io);
}

if (import.meta.main) {
  await runCLI();
}
