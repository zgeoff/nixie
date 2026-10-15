import { expect, test } from 'bun:test';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { decodeTurnFrame, encodeTurnFrame, guestFrameSchema } from '@heynixie/wire';
import { buildMockSummarizeFrame } from '@heynixie/wire/test-utils';
import { buildStubSandboxes } from './build-stub-sandboxes';

function setupTest() {
  return { stub: buildStubSandboxes() };
}

test('it answers a turn frame with the script frames, then exits', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));
  const stream = await sandbox.spawn({ argv: ['guest'], maxMessageBytes: 1024 });

  ctx.stub.setGuestScript((turn) => [{ type: 'read', uuids: [turn.input[0]?.uuid ?? ''] }]);

  await stream.send(
    encodeTurnFrame({
      type: 'turn',
      profile: {
        model: 'model-a',
        baseURL: 'https://api.anthropic.com',
        effort: 'low',
        authHeader: 'x-api-key',
        contextTokens: null,
      },
      tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
      resume: null,
      systemPrompt: 'You are nixie.',
      input: [{ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Hi.' }],
    }),
  );

  const messages = await Array.fromAsync(stream.messages);
  const exit = await stream.exit;

  expect(messages.map((message) => decodeTurnFrame(guestFrameSchema, message))).toStrictEqual([
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000002'] },
  ]);

  expect(exit).toMatchObject({ code: 0, signal: null });
});

test('it answers a purge frame as purged, records the sandbox, then exits', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));
  const stream = await sandbox.spawn({ argv: ['guest'], maxMessageBytes: 1024 });

  await stream.send(encodeTurnFrame({ type: 'purge' }));

  const messages = await Array.fromAsync(stream.messages);
  const exit = await stream.exit;

  expect(messages.map((message) => decodeTurnFrame(guestFrameSchema, message))).toStrictEqual([
    { type: 'purged' },
  ]);

  expect(exit).toMatchObject({ code: 0, signal: null });
  expect(ctx.stub.purged).toStrictEqual([sandbox.id]);
});

test('it answers a purge frame with the frames a test sets', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));

  ctx.stub.setPurgeAnswer([{ type: 'failed', reason: 'error', detail: 'the disk is read-only' }]);

  const stream = await sandbox.spawn({ argv: ['guest'], maxMessageBytes: 1024 });

  await stream.send(encodeTurnFrame({ type: 'purge' }));

  const messages = await Array.fromAsync(stream.messages);

  expect(messages.map((message) => decodeTurnFrame(guestFrameSchema, message))).toStrictEqual([
    { type: 'failed', reason: 'error', detail: 'the disk is read-only' },
  ]);
});

test('it answers a summarize frame with a summary at a new chain entry, records the frame, then exits', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));
  const stream = await sandbox.spawn({ argv: ['guest'], maxMessageBytes: 1024 });

  const frame = buildMockSummarizeFrame();

  await stream.send(encodeTurnFrame(frame));

  const messages = await Array.fromAsync(stream.messages);
  const exit = await stream.exit;

  expect(messages.map((message) => decodeTurnFrame(guestFrameSchema, message))).toStrictEqual([
    {
      type: 'summarized',
      boundary: { sessionID: expect.toBeString(), messageID: expect.toBeString() },
      text: 'Open threads: none.',
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);

  expect(exit).toMatchObject({ code: 0, signal: null });
  expect(ctx.stub.summaries).toStrictEqual([frame]);
});

test('it answers a summarize frame with the script a test sets', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));

  ctx.stub.setSummaryScript((frame) => [
    { type: 'failed', reason: 'error', detail: `no summary at ${frame.resume.messageID}` },
  ]);

  const stream = await sandbox.spawn({ argv: ['guest'], maxMessageBytes: 1024 });

  await stream.send(
    encodeTurnFrame(
      buildMockSummarizeFrame({
        resume: {
          sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
          messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
        },
      }),
    ),
  );

  const messages = await Array.fromAsync(stream.messages);

  expect(messages.map((message) => decodeTurnFrame(guestFrameSchema, message))).toStrictEqual([
    {
      type: 'failed',
      reason: 'error',
      detail: 'no summary at 7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
  ]);
});

test('it lists a sandbox by its owner until it is destroyed', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation', owner: 'conversation' }),
  );

  const listed = await ctx.stub.adapter.list('conversation');

  await sandbox.destroy();

  const after = await ctx.stub.adapter.list('conversation');

  expect(listed).toStrictEqual([sandbox]);
  expect(after).toStrictEqual([]);
  expect(ctx.stub.destroyed).toStrictEqual([sandbox.id]);
});

test('it records each secret it is given', async () => {
  const ctx = setupTest();

  const secret = {
    name: 'model-chat-1',
    value: 'not-a-real-key',
    host: 'api.anthropic.com',
    header: 'x-api-key',
  } as const;

  await ctx.stub.adapter.addSecret(secret);

  expect(ctx.stub.secrets).toStrictEqual([secret]);
});
