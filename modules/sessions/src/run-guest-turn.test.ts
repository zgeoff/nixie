import { expect, mock, test } from 'bun:test';
import { once } from 'node:events';
import { buildMockSandboxSpec, buildStubSandboxes } from '@heynixie/sandbox/test-utils';
import { waitForCondition } from '@heynixie/testing';
import type { InboxMessage } from '@heynixie/wire';
import { buildMockTurnFrame } from '@heynixie/wire/test-utils';
import invariant from 'tiny-invariant';
import { runGuestTurn } from './run-guest-turn';

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
    failure: null,
  });
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
      boundary: {
        harness: 'agent-sdk',
        sessionID: '5d2b1e0c-7f3a-4e8b-9c6d-2a1b3c4d5e6f',
        messageID: replyID,
      },
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
    failure: null,
  });
});

test('it keeps every reply of a turn that failed after its last result', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));

  ctx.stub.setGuestScript(() => [
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000002'] },
    {
      type: 'assistant',
      messageID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01',
      text: 'Let me check the calendar.',
      toolUses: [],
    },
    {
      type: 'failed',
      reason: 'model_api',
      error: 'quota',
      detail: 'API Error: Request rejected (429) · Weekly allowance used up',
    },
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
    assistants: [
      {
        type: 'assistant',
        messageID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01',
        text: 'Let me check the calendar.',
        toolUses: [],
      },
    ],
    read: [],
    ended: [],
    failure: {
      type: 'failed',
      reason: 'model_api',
      error: 'quota',
      detail: 'API Error: Request rejected (429) · Weekly allowance used up',
    },
  });
});

test('it reports the mark it read at the last result, before a guest that died sent more', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));

  const replyID = '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01';
  const readRecallMark = mock(() => Promise.resolve(0)).mockResolvedValueOnce(42);

  ctx.stub.setGuestScript(() => [
    { type: 'assistant', messageID: replyID, text: 'Hello.', toolUses: [] },
    {
      type: 'ended',
      boundary: {
        harness: 'agent-sdk',
        sessionID: '5d2b1e0c-7f3a-4e8b-9c6d-2a1b3c4d5e6f',
        messageID: replyID,
      },
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

  expect(turn.endedMark).toBe(42);
  expect(readRecallMark).toHaveBeenCalledOnce();
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

test('it sends the guest an interrupt frame when the interrupt signal aborts', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));

  const interrupt = new AbortController();

  ctx.stub.setGuestScript(async (_turn, guest) => {
    invariant(guest.interrupt);

    interrupt.abort();

    await once(guest.interrupt, 'abort');

    return [{ type: 'failed', reason: 'error', detail: 'interrupted' }];
  });

  const turn = await runGuestTurn({
    sandbox,
    command: { argv: ['guest'], env: {} },
    turn: buildMockTurnFrame({
      input: [{ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Hi.' }],
    }),
    messages: [],
    signal: new AbortController().signal,
    interrupt: interrupt.signal,
  });

  expect(turn.failure).toStrictEqual({ type: 'failed', reason: 'error', detail: 'interrupted' });
});

test('it hands each model call to the caller before it reads the next frame, so an interrupt the caller raises reaches the guest before its next call', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));

  const interrupt = new AbortController();

  const events: string[] = [];

  ctx.stub.setGuestScript(async (_turn, guest) => {
    invariant(guest.interrupt && guest.emit);

    guest.emit([
      {
        type: 'call',
        usage: {
          uncachedInputTokens: 900,
          cacheReadTokens: 0,
          cacheWrite5mTokens: 0,
          cacheWrite1hTokens: 0,
          outputTokens: 20,
        },
      },
    ]);

    await once(guest.interrupt, 'abort');

    events.push('interrupt');

    return [
      {
        type: 'call',
        usage: {
          uncachedInputTokens: 30,
          cacheReadTokens: 0,
          cacheWrite5mTokens: 0,
          cacheWrite1hTokens: 0,
          outputTokens: 5,
        },
      },
      { type: 'failed', reason: 'error', detail: 'interrupted' },
    ];
  });

  await runGuestTurn({
    sandbox,
    command: { argv: ['guest'], env: {} },
    turn: buildMockTurnFrame({
      input: [{ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Hi.' }],
    }),
    messages: [],
    signal: new AbortController().signal,
    interrupt: interrupt.signal,
    onCall: (usage) => {
      events.push(`call ${usage.uncachedInputTokens}`);
      interrupt.abort();

      return Promise.resolve();
    },
  });

  expect(events).toStrictEqual(['call 900', 'interrupt', 'call 30']);
});

test('it waits for the caller to finish with a model call before it reads the next frame', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.stub.adapter.create(buildMockSandboxSpec({ kind: 'conversation' }));

  const callUsage = {
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens: 0,
  };

  const interrupt = new AbortController();

  const held = Promise.withResolvers<void>();
  const guestAnswered = Promise.withResolvers<void>();
  const seen: number[] = [];

  ctx.stub.setGuestScript(async (_turn, guest) => {
    invariant(guest.interrupt && guest.emit);

    guest.emit([{ type: 'call', usage: { ...callUsage, uncachedInputTokens: 900 } }]);

    await once(guest.interrupt, 'abort');

    guestAnswered.resolve();

    return [
      { type: 'call', usage: { ...callUsage, uncachedInputTokens: 30 } },
      { type: 'failed', reason: 'error', detail: 'stopped' },
    ];
  });

  const turn = runGuestTurn({
    sandbox,
    command: { argv: ['guest'], env: {} },
    turn: buildMockTurnFrame({
      input: [{ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Hi.' }],
    }),
    messages: [],
    signal: new AbortController().signal,
    interrupt: interrupt.signal,
    onCall: (usage) => {
      seen.push(usage.uncachedInputTokens);

      if (seen.length === 1) {
        interrupt.abort();

        return held.promise;
      }

      return Promise.resolve();
    },
  });

  await guestAnswered.promise;

  const secondCallRead = waitForCondition(() => seen.length > 1, { timeoutMs: 200 });

  await expect(secondCallRead).toReject();

  const seenWhileHeld = [...seen];

  held.resolve();

  await turn;

  expect({ seenWhileHeld, seenAtEnd: seen }).toStrictEqual({
    seenWhileHeld: [900],
    seenAtEnd: [900, 30],
  });
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
