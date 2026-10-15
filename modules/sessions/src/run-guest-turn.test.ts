import { expect, mock, test } from 'bun:test';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import type { InboxMessage } from '@heynixie/wire';
import { buildMockTurnFrame } from '@heynixie/wire/test-utils';
import { runGuestTurn } from './run-guest-turn';
import { buildStubSandboxes } from './test-utils/build-stub-sandboxes';

function setupTest() {
  return { stub: buildStubSandboxes() };
}

test('it collects the frames the guest sent for the turn', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));

  const turn = await runGuestTurn({
    sandbox,
    command: { argv: ['guest'], env: {} },
    turn: buildMockTurnFrame({
      input: [{ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Hi.' }],
    }),
    messages: [],
    signal: new AbortController().signal,
  });

  expect(turn).toStrictEqual({
    assistants: [
      { type: 'assistant', messageID: expect.toBeString(), text: 'Hello.', toolUses: [] },
    ],
    read: ['6e697869-0000-8000-8000-000000000002'],
    ended: [expect.objectContaining({ type: 'ended', subtype: 'success' })],
    compactions: [],
    failure: null,
  });
});

test('it collects each compaction that came before the last result, and drops one after it', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));

  const replyID = '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01';

  ctx.stub.setGuestScript(() => [
    { type: 'compacted', trigger: 'auto', preTokens: 150_000, postTokens: 400 },
    { type: 'assistant', messageID: replyID, text: 'Hello.', toolUses: [] },
    {
      type: 'ended',
      boundary: { sessionID: '5d2b1e0c-7f3a-4e8b-9c6d-2a1b3c4d5e6f', messageID: replyID },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
    { type: 'compacted', trigger: 'auto', preTokens: 160_000, postTokens: null },
  ]);

  const turn = await runGuestTurn({
    sandbox,
    command: { argv: ['guest'], env: {} },
    turn: buildMockTurnFrame(),
    messages: [],
    signal: new AbortController().signal,
  });

  expect(turn.compactions).toStrictEqual([
    { type: 'compacted', trigger: 'auto', preTokens: 150_000, postTokens: 400 },
  ]);
});

test('it drops the reads and replies a guest sent after its last result when it dies before the next', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));

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
    sandbox,
    command: { argv: ['guest'], env: {} },
    turn: buildMockTurnFrame({
      input: [{ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Hi.' }],
    }),
    messages: [],
    signal: new AbortController().signal,
  });

  expect(turn).toStrictEqual({
    assistants: [{ type: 'assistant', messageID: replyID, text: 'Hello.', toolUses: [] }],
    read: ['6e697869-0000-8000-8000-000000000002'],
    ended: [expect.objectContaining({ type: 'ended', turns: 1 })],
    compactions: [],
    failure: null,
  });
});

test('it reports the mark it read at each compaction and at the last result, before a guest that died sent more', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));

  const replyID = '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01';

  const readRecallMark = mock(() => Promise.resolve(0))
    .mockResolvedValueOnce(17)
    .mockResolvedValueOnce(42);

  ctx.stub.setGuestScript(() => [
    { type: 'compacted', trigger: 'auto', preTokens: 150_000, postTokens: 400 },
    { type: 'assistant', messageID: replyID, text: 'Hello.', toolUses: [] },
    {
      type: 'ended',
      boundary: { sessionID: '5d2b1e0c-7f3a-4e8b-9c6d-2a1b3c4d5e6f', messageID: replyID },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
    { type: 'assistant', messageID: crypto.randomUUID(), text: 'And eggs.', toolUses: [] },
  ]);

  const turn = await runGuestTurn({
    sandbox,
    command: { argv: ['guest'], env: {} },
    turn: buildMockTurnFrame(),
    messages: [],
    signal: new AbortController().signal,
    readRecallMark,
  });

  expect(turn.compactions).toStrictEqual([
    { type: 'compacted', trigger: 'auto', preTokens: 150_000, postTokens: 400, mark: 17 },
  ]);

  expect(turn.endedMark).toBe(42);
  expect(readRecallMark).toHaveBeenCalledTimes(2);
});

test('it passes each live message into the running turn', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));

  const live: InboxMessage[] = [{ uuid: '6e697869-0000-8000-8000-000000000003', text: 'And?' }];

  ctx.stub.setGuestScript(async (_turn, guest) => {
    const message = await guest.waitForMessage();

    return [{ type: 'failed', reason: 'error', detail: message.text }];
  });

  const turn = await runGuestTurn({
    sandbox,
    command: { argv: ['guest'], env: {} },
    turn: buildMockTurnFrame({
      input: [{ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Hi.' }],
    }),
    messages: live,
    signal: new AbortController().signal,
  });

  expect(turn.failure).toStrictEqual({ type: 'failed', reason: 'error', detail: 'And?' });
});

test('it throws when the guest exits before it ends or fails its turn', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));

  ctx.stub.setGuestScript(() => []);

  expect(
    runGuestTurn({
      sandbox,
      command: { argv: ['guest'], env: {} },
      turn: buildMockTurnFrame({
        input: [{ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Hi.' }],
      }),
      messages: [],
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow(
    'the conversation guest exited with code 0 and signal null before it ended its turn: ',
  );
});

test('it stops the guest and sends no turn when the signal aborted while the guest started', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));

  const forget = new AbortController();

  forget.abort(new Error('a forget invalidated the session'));

  const turn = runGuestTurn({
    sandbox,
    command: { argv: ['guest'], env: {} },
    turn: buildMockTurnFrame(),
    messages: [],
    signal: forget.signal,
  });

  await turn.catch(() => {});

  expect(turn).rejects.toThrow('a forget invalidated the session');
  expect(ctx.stub.turns).toStrictEqual([]);
});

test('it stops the guest when the step signal aborts', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));

  const lease = new AbortController();

  ctx.stub.setGuestScript(async (_turn, guest) => {
    lease.abort();

    await guest.waitForMessage();

    return [];
  });

  expect(
    runGuestTurn({
      sandbox,
      command: { argv: ['guest'], env: {} },
      turn: buildMockTurnFrame({
        input: [{ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Hi.' }],
      }),
      messages: [],
      signal: lease.signal,
    }),
  ).rejects.toThrow('the conversation guest exited with code null and signal SIGTERM');
});
