import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runIntoSummary } from './run-into-summary.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-run-into-summary-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  return { summaryPath: join(directory, 'summary') };
}

test('it appends the command output to the summary and returns its exit code', () => {
  const ctx = setupTest();

  writeFileSync(ctx.summaryPath, '# Checks\n');

  const exitCode = runIntoSummary(
    ['bun', 'run-check.ts', '--last-tag', 'v1.2.0'],
    ctx.summaryPath,
    {
      runCommand: () => ({ exitCode: 1, stdout: 'No migrations since v1.2.0\n', stderr: '' }),
      writeOutput: () => {},
      writeError: () => {},
    },
  );

  expect(exitCode).toBe(1);
  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe('# Checks\nNo migrations since v1.2.0\n');
});

test('it runs the command it is given', () => {
  const ctx = setupTest();
  const runCommand = mock(() => ({ exitCode: 0, stdout: '', stderr: '' }));

  writeFileSync(ctx.summaryPath, '');

  runIntoSummary(['bun', 'run-check.ts', '--last-tag', 'v1.2.0'], ctx.summaryPath, {
    runCommand,
    writeOutput: () => {},
    writeError: () => {},
  });

  expect(runCommand).toHaveBeenCalledExactlyOnceWith([
    'bun',
    'run-check.ts',
    '--last-tag',
    'v1.2.0',
  ]);
});

test('it passes the command output and errors to the step log', () => {
  const ctx = setupTest();
  const writeOutput = mock();
  const writeError = mock();

  writeFileSync(ctx.summaryPath, '');

  runIntoSummary(['bun', 'run-check.ts'], ctx.summaryPath, {
    runCommand: () => ({
      exitCode: 1,
      stdout: 'The release reads no migration\n',
      stderr: 'error: migration 12 drops a column\n',
    }),
    writeOutput,
    writeError,
  });

  expect(writeOutput).toHaveBeenCalledExactlyOnceWith('The release reads no migration\n');
  expect(writeError).toHaveBeenCalledExactlyOnceWith('error: migration 12 drops a column\n');
});
