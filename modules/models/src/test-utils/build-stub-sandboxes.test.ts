import { expect, test } from 'bun:test';
import type { GuestFrame } from '@heynixie/wire';
import { decodeTurnFrame, encodeTurnFrame, guestFrameSchema } from '@heynixie/wire';
import { buildStubSandboxes } from './build-stub-sandboxes';

// a conversation sandbox on the stub adapter, with its guest started
async function setupTest() {
  const stub = buildStubSandboxes();
  const sandbox = await stub.adapter.create({
    kind: 'conversation',
    image: 'conversation',
    owner: 'conversation',
    egress: { kind: 'none' },
    grants: [],
    toolRoute: true,
    limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 2048 },
  });
  const stream = await sandbox.spawn({ argv: ['guest'], maxMessageBytes: 1024 });

  return { stub, sandbox, stream };
}

test('it answers a turn frame with the script frames, then exits', async () => {
  const ctx = await setupTest();
  const frames: GuestFrame[] = [];

  ctx.stub.setGuestScript((turn) => [{ type: 'read', uuids: [turn.input[0]?.uuid ?? ''] }]);
  await ctx.stream.send(
    encodeTurnFrame({
      type: 'turn',
      profile: {
        model: 'model-a',
        baseURL: 'https://api.anthropic.com',
        effort: 'low',
        authHeader: 'x-api-key',
      },
      tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
      resume: null,
      systemPrompt: 'You are nixie.',
      input: [{ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Hi.' }],
    }),
  );
  for await (const message of ctx.stream.messages) {
    frames.push(decodeTurnFrame(guestFrameSchema, message));
  }

  const exit = await ctx.stream.exit;

  expect(frames).toStrictEqual([{ type: 'read', uuids: ['6e697869-0000-8000-8000-000000000002'] }]);
  expect(exit).toMatchObject({ code: 0, signal: null });
});

test('it lists a sandbox by its owner until it is destroyed', async () => {
  const ctx = await setupTest();
  const listed = await ctx.stub.adapter.list('conversation');

  await ctx.sandbox.destroy();

  const after = await ctx.stub.adapter.list('conversation');

  expect(listed).toStrictEqual([ctx.sandbox]);
  expect(after).toStrictEqual([]);
  expect(ctx.stub.destroyed).toStrictEqual([ctx.sandbox.id]);
});

test('it records each secret it is given', async () => {
  const ctx = await setupTest();
  const secret = {
    name: 'model-chat-1',
    value: 'not-a-real-key',
    host: 'api.anthropic.com',
    header: 'x-api-key',
  } as const;

  await ctx.stub.adapter.addSecret(secret);

  expect(ctx.stub.secrets).toStrictEqual([secret]);
});
