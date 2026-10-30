import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-write-sandbox-manifest-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');

  mkdirSync(join(directory, 'apps', 'server'), { recursive: true });
  writeFileSync(callsPath, '');

  return {
    repoPath: directory,
    binPath: join(directory, 'bin'),
    callsPath,
    scriptPath: join(import.meta.dir, 'write-sandbox-manifest.ts'),
  };
}

test('it writes the manifest that the build script prints for both sandbox images', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'bash'), {
    callsPath: ctx.callsPath,
    answers: {
      '.github/scripts/build-sandbox-manifest.sh localhost:5000/nixie-conversation@sha256:aa11 localhost:5000/nixie-fetch@sha256:bb22':
        {
          stdout:
            '{"conversation":"localhost:5000/nixie-conversation@sha256:aa11","fetch":"localhost:5000/nixie-fetch@sha256:bb22"}\n',
        },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({
      PATH: ctx.binPath,
      CONVERSATION: 'localhost:5000/nixie-conversation@sha256:aa11',
      FETCH: 'localhost:5000/nixie-fetch@sha256:bb22',
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(join(ctx.repoPath, 'apps', 'server', 'sandbox-manifest.json'), 'utf8')).toBe(
    '{"conversation":"localhost:5000/nixie-conversation@sha256:aa11","fetch":"localhost:5000/nixie-fetch@sha256:bb22"}\n',
  );
});
