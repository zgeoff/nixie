import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-record-sandbox-manifest-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');
  const outputPath = join(directory, 'output');
  const summaryPath = join(directory, 'summary');

  writeFileSync(callsPath, '');
  writeFileSync(outputPath, '');
  writeFileSync(summaryPath, '');

  return {
    binPath: join(directory, 'bin'),
    callsPath,
    outputPath,
    summaryPath,
    scriptPath: join(import.meta.dir, 'record-sandbox-manifest.ts'),
  };
}

test('it outputs the manifest for both sandbox images and adds it to the summary', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'bash'), {
    callsPath: ctx.callsPath,
    answers: {
      '.github/scripts/build-sandbox-manifest.sh ghcr.io/heynixie/nixie-conversation@sha256:aa11 ghcr.io/heynixie/nixie-fetch@sha256:bb22':
        {
          stdout:
            '{"conversation":"ghcr.io/heynixie/nixie-conversation@sha256:aa11","fetch":"ghcr.io/heynixie/nixie-fetch@sha256:bb22"}\n',
        },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      CONVERSATION: 'ghcr.io/heynixie/nixie-conversation@sha256:aa11',
      FETCH: 'ghcr.io/heynixie/nixie-fetch@sha256:bb22',
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(ctx.outputPath, 'utf8')).toBe(
    'json={"conversation":"ghcr.io/heynixie/nixie-conversation@sha256:aa11","fetch":"ghcr.io/heynixie/nixie-fetch@sha256:bb22"}\n',
  );

  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe(
    '{"conversation":"ghcr.io/heynixie/nixie-conversation@sha256:aa11","fetch":"ghcr.io/heynixie/nixie-fetch@sha256:bb22"}\n',
  );
});
