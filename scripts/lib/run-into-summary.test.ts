import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubProgram } from '../test-utils/create-stub-program.ts';
import { runIntoSummary } from './run-into-summary.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-run-into-summary-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');
  const summaryPath = join(directory, 'summary');

  writeFileSync(callsPath, '');

  return { directoryPath: directory, callsPath, summaryPath };
}

test('it appends the command output to the summary and returns its exit code', async () => {
  const ctx = setupTest();
  const programPath = join(ctx.directoryPath, 'run-check');

  writeFileSync(ctx.summaryPath, '# Checks\n');

  createStubProgram(programPath, {
    callsPath: ctx.callsPath,
    answers: { '--last-tag v1.2.0': { stdout: 'No migrations since v1.2.0\n', exitCode: 1 } },
  });

  const exitCode = await runIntoSummary([programPath, '--last-tag', 'v1.2.0'], ctx.summaryPath);

  expect(exitCode).toBe(1);
  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe('# Checks\nNo migrations since v1.2.0\n');
});
