import { expect, onTestFinished, test } from 'bun:test';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkReplySchema,
  decodeTurnFrame,
  encodeFrame,
  encodeTurnFrame,
  guestFrameSchema,
  makeFrameDecoder,
} from '@heynixie/wire';
import { buildMockTurnFrame } from '@heynixie/wire/test-utils';
import { readGuestBundles } from './test-utils/read-guest-bundles';
import { startStubHTTPToolServer } from './test-utils/start-stub-http-tool-server';
import { startStubModel } from './test-utils/start-stub-model';

// A folder under the OS temp folder has no node_modules in it or above it, as in the image. Every
// process runs with --no-install, because Bun otherwise installs a package it can't find.
async function setupTest() {
  const bundles = await readGuestBundles();
  const directory = await mkdtemp(join(tmpdir(), 'nixie-guest-bundles-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  await copyFile(join(bundles, 'main.js'), join(directory, 'main.js'));
  await copyFile(join(bundles, 'check.js'), join(directory, 'check.js'));

  const model = startStubModel();

  onTestFinished(() => model.stop());

  return {
    directory,
    model,
    start: (file: string) =>
      Bun.spawn(['bun', '--no-install', join(directory, file)], {
        cwd: directory,
        env: {
          HOME: directory,
          PATH: process.env['PATH'] ?? '',
          ANTHROPIC_API_KEY: 'imp-placeholder',
        },
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      }),
  };
}

test('it answers one turn from the main bundle in a folder with no node_modules', async () => {
  const ctx = await setupTest();
  const tools = await startStubHTTPToolServer();

  onTestFinished(() => tools.stop());

  ctx.model.addReplies({ text: 'Hello.' });

  const guest = ctx.start('main.js');

  const turn = buildMockTurnFrame({
    profile: { baseURL: ctx.model.url },
    tools: { url: tools.config.url, token: 'imp-placeholder' },
  });

  await guest.stdin.write(encodeFrame(encodeTurnFrame(turn)));
  await guest.stdin.end();

  const [stdout, exitCode] = await Promise.all([new Response(guest.stdout).bytes(), guest.exited]);

  const types = makeFrameDecoder(1024 * 1024)(stdout).map(
    (frame) => decodeTurnFrame(guestFrameSchema, frame).type,
  );

  expect({ exitCode, last: types.at(-1) }).toStrictEqual({ exitCode: 0, last: 'ended' });
});

test('it answers one check from the check bundle in a folder with no node_modules', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({
    toolUse: {
      name: 'StructuredOutput',
      input: { verdict: 'asserted', reason: 'The owner states it.' },
    },
  });

  const guest = ctx.start('check.js');

  const request = {
    profile: {
      model: 'claude-sonnet-5-5',
      baseURL: ctx.model.url,
      effort: 'low',
      authHeader: 'x-api-key',
    },
    systemPrompt: 'You check one candidate memory.',
    input: '<owner_message>\nI take my coffee black\n</owner_message>',
  };

  const bytes = new TextEncoder().encode(JSON.stringify(request));

  await guest.stdin.write(encodeFrame(bytes));
  await guest.stdin.end();

  const stdout = await new Response(guest.stdout).bytes();

  const [frame] = makeFrameDecoder(1024 * 1024)(stdout);

  expect(frame && decodeTurnFrame(checkReplySchema, frame)).toStrictEqual({
    kind: 'answer',
    output: { verdict: 'asserted', reason: 'The owner states it.' },
    costUSD: expect.toBeNumber(),
    durationMs: expect.toBeNumber(),
    apiMs: expect.toBeNumber(),
  });
});

test('it fails an import that the build did not follow', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.directory, 'control.js'), "import 'zod';\n");

  const control = ctx.start('control.js');

  const [stderr, exitCode] = await Promise.all([
    new Response(control.stderr).text(),
    control.exited,
  ]);

  expect({ isFailure: exitCode !== 0, stderr }).toStrictEqual({
    isFailure: true,
    stderr: expect.stringContaining('Cannot find package'),
  });
});
