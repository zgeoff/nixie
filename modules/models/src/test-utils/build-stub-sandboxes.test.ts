import { expect, test } from 'bun:test';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { decodeTurnFrame, encodeTurnFrame, guestFrameSchema } from '@heynixie/wire';
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
