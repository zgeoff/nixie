import { expect, test } from 'bun:test';
import type { InboxMessage } from '@heynixie/wire';
import { runGuestTurn } from './run-guest-turn';
import { buildStubSandboxes } from './test-utils/build-stub-sandboxes';

// a conversation sandbox on the stub adapter
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

  return { stub, sandbox };
}

test('it collects the frames the guest sent for the turn', async () => {
  const ctx = await setupTest();
  const turn = await runGuestTurn({
    sandbox: ctx.sandbox,
    command: { argv: ['guest'], env: {} },
    turn: {
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
    },
    messages: [],
    signal: new AbortController().signal,
  });

  expect(turn).toStrictEqual({
    assistants: [
      { type: 'assistant', messageID: expect.toBeString(), text: 'Hello.', toolUses: [] },
    ],
    read: ['6e697869-0000-8000-8000-000000000002'],
    ended: [expect.objectContaining({ type: 'ended', subtype: 'success' })],
    failure: null,
  });
});

test('it drops the reads and replies a guest sent after its last result when it dies before the next', async () => {
  const ctx = await setupTest();

  const replyID = '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01';

  ctx.stub.setGuestScript(() => [
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000002'] },
    { type: 'assistant', messageID: replyID, text: 'Hello.', toolUses: [] },
    {
      type: 'ended',
      boundary: { sessionID: '5d2b1e0c-7f3a-4e8b-9c6d-2a1b3c4d5e6f', messageID: replyID },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000003'] },
    { type: 'assistant', messageID: crypto.randomUUID(), text: 'And eggs.', toolUses: [] },
  ]);

  const turn = await runGuestTurn({
    sandbox: ctx.sandbox,
    command: { argv: ['guest'], env: {} },
    turn: {
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
    },
    messages: [],
    signal: new AbortController().signal,
  });

  expect(turn).toStrictEqual({
    assistants: [{ type: 'assistant', messageID: replyID, text: 'Hello.', toolUses: [] }],
    read: ['6e697869-0000-8000-8000-000000000002'],
    ended: [expect.objectContaining({ type: 'ended', turns: 1 })],
    failure: null,
  });
});

test('it passes each live message into the running turn', async () => {
  const ctx = await setupTest();
  const live: InboxMessage[] = [{ uuid: '6e697869-0000-8000-8000-000000000003', text: 'And?' }];

  ctx.stub.setGuestScript(async (_turn, guest) => {
    const message = await guest.waitForMessage();

    return [{ type: 'failed', reason: 'error', detail: message.text }];
  });

  const turn = await runGuestTurn({
    sandbox: ctx.sandbox,
    command: { argv: ['guest'], env: {} },
    turn: {
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
    },
    messages: live,
    signal: new AbortController().signal,
  });

  expect(turn.failure).toStrictEqual({ type: 'failed', reason: 'error', detail: 'And?' });
});

test('it throws when the guest exits before it ends or fails its turn', async () => {
  const ctx = await setupTest();

  ctx.stub.setGuestScript(() => []);

  expect(
    runGuestTurn({
      sandbox: ctx.sandbox,
      command: { argv: ['guest'], env: {} },
      turn: {
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
      },
      messages: [],
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow(
    'the conversation guest exited with code 0 and signal null before it ended its turn: ',
  );
});

test('it stops the guest when the step signal aborts', async () => {
  const ctx = await setupTest();
  const lease = new AbortController();

  ctx.stub.setGuestScript(async (_turn, guest) => {
    lease.abort();
    await guest.waitForMessage();
    return [];
  });

  expect(
    runGuestTurn({
      sandbox: ctx.sandbox,
      command: { argv: ['guest'], env: {} },
      turn: {
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
      },
      messages: [],
      signal: lease.signal,
    }),
  ).rejects.toThrow('the conversation guest exited with code null and signal SIGTERM');
});
