import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { runProgram } from '../run-program.ts';

// Runs the formatter check that the definitions repo runs over the files a task export writes. That
// repo has no formatter config, so the samples sit beside an empty one, which stops the formatter
// from reading nixie's own.
function runCLI(): void {
  const command = parseStepCommand('check-task-yaml-format.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const directory = mkdtempSync(join(tmpdir(), 'nixie-task-yaml-format-'));

  try {
    writeFileSync(join(directory, '.oxfmtrc.json'), '{}\n');

    const steps = [
      { argv: ['bun', 'modules/definitions/src/run-task-yaml-samples.ts', directory], cwd: '.' },
      { argv: ['oxfmt', '--check', '.'], cwd: directory },
    ];

    for (const step of steps) {
      const result = runProgram(step.argv, { cwd: step.cwd, env: process.env });

      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);

      if (result.exitCode !== 0) {
        process.exitCode = result.exitCode;

        return;
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  runCLI();
}
