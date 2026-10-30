import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-unused-version-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');

  writeFileSync(callsPath, '');

  return {
    binPath: join(directory, 'bin'),
    callsPath,
    scriptPath: join(import.meta.dir, 'check-unused-version.ts'),
  };
}

test('it passes when no image carries the version yet', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: {
      'buildx imagetools inspect ghcr.io/heynixie/nixie-conversation:0.59.0': { exitCode: 1 },
      'buildx imagetools inspect ghcr.io/heynixie/nixie-fetch:0.59.0': { exitCode: 1 },
      'buildx imagetools inspect ghcr.io/heynixie/nixie:0.59.0': { exitCode: 1 },
      'buildx imagetools inspect ghcr.io/heynixie/nixie-web:0.59.0': { exitCode: 1 },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({ PATH: ctx.binPath, OWNER: 'heynixie', VERSION: '0.59.0' })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(ctx.callsPath, 'utf8')).toBe(
    [
      'docker buildx imagetools inspect ghcr.io/heynixie/nixie-conversation:0.59.0',
      'docker buildx imagetools inspect ghcr.io/heynixie/nixie-fetch:0.59.0',
      'docker buildx imagetools inspect ghcr.io/heynixie/nixie:0.59.0',
      'docker buildx imagetools inspect ghcr.io/heynixie/nixie-web:0.59.0',
      '',
    ].join('\n'),
  );
});

test('it refuses a version that an image already carries', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: {
      'buildx imagetools inspect ghcr.io/heynixie/nixie-conversation:0.59.0': { exitCode: 1 },
      'buildx imagetools inspect ghcr.io/heynixie/nixie-fetch:0.59.0': { exitCode: 0 },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({ PATH: ctx.binPath, OWNER: 'heynixie', VERSION: '0.59.0' })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toBe(
    '::error::ghcr.io/heynixie/nixie-fetch:0.59.0 already exists, so the release refuses to rebuild it\n',
  );
});
