import { expect, mock, test } from 'bun:test';
import { runIntoSummary } from './run-into-summary.ts';

test('it returns the command exit code', () => {
  const exitCode = runIntoSummary(['bun', 'run-check.ts', '--last-tag', 'v1.2.0'], {
    runCommand: () => ({ exitCode: 1, stdout: 'No migrations since v1.2.0\n', stderr: '' }),
    writeOutput: () => {},
    writeError: () => {},
    appendSummary: () => {},
  });

  expect(exitCode).toBe(1);
});

test('it runs the command it is given', () => {
  const runCommand = mock(() => ({ exitCode: 0, stdout: '', stderr: '' }));

  runIntoSummary(['bun', 'run-check.ts', '--last-tag', 'v1.2.0'], {
    runCommand,
    writeOutput: () => {},
    writeError: () => {},
    appendSummary: () => {},
  });

  expect(runCommand).toHaveBeenCalledExactlyOnceWith([
    'bun',
    'run-check.ts',
    '--last-tag',
    'v1.2.0',
  ]);
});

test('it appends the command output to the summary', () => {
  const appendSummary = mock<(text: string) => void>();

  runIntoSummary(['bun', 'run-check.ts'], {
    runCommand: () => ({ exitCode: 0, stdout: 'No migrations since v1.2.0\n', stderr: '' }),
    writeOutput: () => {},
    writeError: () => {},
    appendSummary,
  });

  expect(appendSummary).toHaveBeenCalledExactlyOnceWith('No migrations since v1.2.0\n');
});

test('it passes the command output and errors to the step log', () => {
  const writeOutput = mock<(text: string) => void>();
  const writeError = mock<(text: string) => void>();

  runIntoSummary(['bun', 'run-check.ts'], {
    runCommand: () => ({
      exitCode: 1,
      stdout: 'The release reads no migration\n',
      stderr: 'error: migration 12 drops a column\n',
    }),
    writeOutput,
    writeError,
    appendSummary: () => {},
  });

  expect(writeOutput).toHaveBeenCalledExactlyOnceWith('The release reads no migration\n');
  expect(writeError).toHaveBeenCalledExactlyOnceWith('error: migration 12 drops a column\n');
});
