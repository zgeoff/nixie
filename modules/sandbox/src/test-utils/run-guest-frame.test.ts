import { expect, test } from 'bun:test';
import { buildMockTurnFrame } from '@heynixie/wire/test-utils';
import invariant from 'tiny-invariant';
import { buildMockSandboxSpec } from './build-mock-sandbox-spec';
import { buildStubGuestSandboxes } from './build-stub-guest-sandboxes';
import { runGuestFrame } from './run-guest-frame';
import { setupTestRecorder } from './setup-test-recorder';

async function setupTest() {
  const recorder = await setupTestRecorder();

  const stub = buildStubGuestSandboxes({
    recorder: recorder.recorder,
    countTokens: (text) => Math.ceil(text.length / 4),
  });

  const sandbox = await stub.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation', owner: 'conversation' }),
  );

  return { stub, sandbox };
}

test('it returns every frame the guest answers with, in order, and the ended frame among them', async () => {
  const ctx = await setupTest();

  ctx.stub.addReplies({ text: 'APPLE' });

  const input = [{ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Say a fruit.' }];

  const run = await runGuestFrame(ctx.sandbox, buildMockTurnFrame({ input }));

  expect(run.frames).toMatchObject([
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000002'] },
    { type: 'assistant', text: 'APPLE', toolUses: [] },
    { type: 'ended', subtype: 'success' },
  ]);

  invariant(run.ended !== null);

  expect(run.frames.at(-1)).toBe(run.ended);
});

test('it returns no ended frame for a guest that fails', async () => {
  const ctx = await setupTest();

  const resume = { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() };

  const run = await runGuestFrame(ctx.sandbox, buildMockTurnFrame({ resume }));

  expect(run).toStrictEqual({
    frames: [
      {
        type: 'failed',
        reason: 'session_missing',
        detail: `No conversation found with session ID: ${resume.sessionID}`,
      },
    ],
    ended: null,
  });
});

test('it starts the guest with the environment given', async () => {
  const ctx = await setupTest();
  const run = await runGuestFrame(ctx.sandbox, buildMockTurnFrame(), {});

  expect(run.frames).toStrictEqual([
    { type: 'failed', reason: 'error', detail: 'the conversation guest needs HOME' },
  ]);
});
