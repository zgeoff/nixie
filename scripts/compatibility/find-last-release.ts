import { appendFileSync } from 'node:fs';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { writeStepValues } from '../lib/write-step-values.ts';

// The last release is the newest v* tag reachable from the base, and before the first release the
// tag output is empty.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('find-last-release.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const base = getStepEnv(process.env, 'BASE');
  const outputPath = getStepEnv(process.env, 'GITHUB_OUTPUT');
  const summaryPath = getStepEnv(process.env, 'GITHUB_STEP_SUMMARY');

  const described = await $`git describe --tags --abbrev=0 --match ${'v*'} ${base}`
    .nothrow()
    .quiet();

  const tag = described.exitCode === 0 ? described.stdout.toString().trim() : '';

  writeStepValues(outputPath, { tag });
  appendFileSync(summaryPath, `Last release: ${tag === '' ? 'none yet' : tag}\n`);
}

if (import.meta.main) {
  await runCLI();
}
