import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';
import { imageSizeBudgets } from './image-size-budgets.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-image-size-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  return {
    repoPath: directory,
    binPath: join(directory, 'bin'),
    scriptPath: join(import.meta.dir, 'check-image-size.ts'),
    pullArgs: ['pull', '--quiet', 'r/nixie-fetch@sha256:ee55'],
    inspectArgs: ['image', 'inspect', '--format', '{{.Size}}', 'r/nixie-fetch@sha256:ee55'],
  };
}

test('it passes an image within its budget after it pulls the image', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'docker', {
    answers: [
      { args: ctx.pullArgs },
      { args: ctx.inspectArgs, stdout: `${imageSizeBudgets.fetch * 1024 * 1024}\n` },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath} fetch`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, IMAGE: 'r/nixie-fetch@sha256:ee55' })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, calls: readStubCalls(ctx.binPath) }).toMatchObject({
    exitCode: 0,
    calls: [
      { name: 'docker', argv: ctx.pullArgs },
      { name: 'docker', argv: ctx.inspectArgs },
    ],
  });
});

test('it fails an image over its budget and names its size', async () => {
  const ctx = setupTest();
  const budgetMiB = imageSizeBudgets.fetch;

  createStubBin(ctx.binPath, 'docker', {
    answers: [
      { args: ctx.pullArgs },
      { args: ctx.inspectArgs, stdout: `${(budgetMiB + 5) * 1024 * 1024}\n` },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath} fetch`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, IMAGE: 'r/nixie-fetch@sha256:ee55' })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 1,
    stdout: `::error::fetch is ${budgetMiB + 5} MiB, over its ${budgetMiB} MiB budget\n`,
  });
});

test('it refuses a name that is no image', async () => {
  const ctx = setupTest();

  const result = await $`${process.execPath} ${ctx.scriptPath} unknown`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, IMAGE: 'r/nixie-fetch@sha256:ee55' })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(2);
});
