import { expect, test } from 'bun:test';
import type { InboxMessage } from '@heynixie/wire';
import { buildMockTurnFrame } from '@heynixie/wire/test-utils';
import { readTurnInput } from './read-turn-input';

test('it yields the turn inbox, then each host message, and marks each one pending', async () => {
  const state = {
    pending: new Set<string>(),
    toolsReady: Promise.withResolvers<boolean>(),
    inputFailed: Promise.withResolvers<Error>(),
    ended: Promise.withResolvers<void>(),
  };

  state.toolsReady.resolve(true);

  const input = await Array.fromAsync(
    readTurnInput(
      buildMockTurnFrame({
        input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
      }),
      [{ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Also buy eggs.' }],
      state,
    ),
  );

  expect(input).toMatchObject([
    { type: 'user', message: { content: 'Hi.' }, uuid: '6e697869-0000-8000-8000-000000000001' },
    {
      type: 'user',
      message: { content: 'Also buy eggs.' },
      uuid: '6e697869-0000-8000-8000-000000000002',
    },
  ]);
  expect([...state.pending]).toStrictEqual([
    '6e697869-0000-8000-8000-000000000001',
    '6e697869-0000-8000-8000-000000000002',
  ]);
});

test('it ends the stream when the turn ends while it waits for the host', async () => {
  const state = {
    pending: new Set<string>(),
    toolsReady: Promise.withResolvers<boolean>(),
    inputFailed: Promise.withResolvers<Error>(),
    ended: Promise.withResolvers<void>(),
  };

  state.toolsReady.resolve(true);
  const channel = new TransformStream<InboxMessage, InboxMessage>();
  const input = readTurnInput(buildMockTurnFrame(), channel.readable, state);

  await input.next();

  const next = input.next();

  state.ended.resolve();

  expect(next).resolves.toStrictEqual({ done: true, value: undefined });
});

test('it ends the stream and fails the turn with the error the host stream throws', async () => {
  const state = {
    pending: new Set<string>(),
    toolsReady: Promise.withResolvers<boolean>(),
    inputFailed: Promise.withResolvers<Error>(),
    ended: Promise.withResolvers<void>(),
  };

  state.toolsReady.resolve(true);
  const channel = new TransformStream<InboxMessage, InboxMessage>();

  void channel.writable.getWriter().abort(new Error('a turn is already running'));

  const input = await Array.fromAsync(readTurnInput(buildMockTurnFrame(), channel.readable, state));

  const failure = await state.inputFailed.promise;

  expect(input).toHaveLength(1);
  expect(failure.message).toBe('a turn is already running');
});

test('it fails the turn with an error that names a host stream failure of another type', async () => {
  const state = {
    pending: new Set<string>(),
    toolsReady: Promise.withResolvers<boolean>(),
    inputFailed: Promise.withResolvers<Error>(),
    ended: Promise.withResolvers<void>(),
  };

  state.toolsReady.resolve(true);
  const channel = new TransformStream<InboxMessage, InboxMessage>();

  void channel.writable.getWriter().abort('the host went away');
  await Array.fromAsync(readTurnInput(buildMockTurnFrame(), channel.readable, state));

  const failure = await state.inputFailed.promise;

  expect(failure.message).toBe('the host went away');
});

test('it yields nothing when the turn stops before nixie tool server connects', async () => {
  const state = {
    pending: new Set<string>(),
    toolsReady: Promise.withResolvers<boolean>(),
    inputFailed: Promise.withResolvers<Error>(),
    ended: Promise.withResolvers<void>(),
  };

  state.toolsReady.resolve(false);

  const input = await Array.fromAsync(
    readTurnInput(
      buildMockTurnFrame({
        input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
      }),
      [{ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Also buy eggs.' }],
      state,
    ),
  );

  expect(input).toStrictEqual([]);
  expect([...state.pending]).toStrictEqual([]);
});
