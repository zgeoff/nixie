import { expect, test } from 'bun:test';
import { removeThreadKeys } from '@heynixie/log';
import type { ToolRun } from '@heynixie/tools';
import { createFakeClock } from '@zgeoff/testing/clock';
import { seedImage } from '../test-utils/seed-image';
import { startTestLog } from '../test-utils/start-test-log';
import { codeRunLimits } from './code-run-limits';
import { resolveCodeRunInputs } from './resolve-code-run-inputs';

async function setupTest() {
  const log = await startTestLog(createFakeClock({ startMs: 1_000_000 }));

  const run: ToolRun = {
    runID: 'run-1',
    thread: 'conversation',
    logThread: 'conversation',
    tools: ['code.run'],
    model: { model: 'model-a', profile: 'chat-direct' },
  };

  const resolve = (files: { path: string; image: string }[]) =>
    resolveCodeRunInputs(
      {
        log,
        notes: { readBody: () => Promise.resolve(null) },
        readSkills: () => Promise.resolve({ kind: 'ok', skills: [] }),
      },
      run,
      { language: 'bash', program: 'true', files, skills: [] },
    );

  // the seeded images live on the conversation thread, so this forgets them
  const forgetImages = () => removeThreadKeys(log, 'conversation');

  return { log, resolve, forgetImages };
}

test('it puts the stored bytes of an image at its path in the work folder', async () => {
  const ctx = await setupTest();

  const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

  await seedImage(ctx.log, { image: 'im4k9q2x7a', source: 'draw', bytes });

  const resolution = await ctx.resolve([{ path: 'in.png', image: 'im4k9q2x7a' }]);

  expect(resolution).toStrictEqual({
    kind: 'ok',
    inputs: {
      files: [{ path: '/work/in.png', content: bytes }],
      skills: [],
      skillFiles: [],
    },
  });
});

test('it refuses an image that no ID names', async () => {
  const ctx = await setupTest();
  const resolution = await ctx.resolve([{ path: 'in.png', image: 'nosuchimag' }]);

  expect(resolution).toStrictEqual({
    kind: 'refused',
    message: 'No image has the ID nosuchimag.',
  });
});

test('it refuses a forgotten image', async () => {
  const ctx = await setupTest();

  await seedImage(ctx.log, {
    image: 'im4k9q2x7a',
    source: 'draw',
    bytes: new Uint8Array(30),
  });

  await ctx.forgetImages();

  const resolution = await ctx.resolve([{ path: 'in.png', image: 'im4k9q2x7a' }]);

  expect(resolution).toStrictEqual({
    kind: 'refused',
    message: 'The image im4k9q2x7a was forgotten.',
  });
});

test('it refuses an image that takes the inputs past the size limit', async () => {
  const ctx = await setupTest();

  await seedImage(ctx.log, {
    image: 'im4k9q2x7a',
    source: 'draw',
    bytes: new Uint8Array(codeRunLimits.inputBytes),
  });

  const resolution = await ctx.resolve([{ path: 'in.png', image: 'im4k9q2x7a' }]);

  expect(resolution.kind).toBe('refused');

  expect(resolution).toMatchObject({
    message: expect.stringContaining('past the limit'),
  });
});
