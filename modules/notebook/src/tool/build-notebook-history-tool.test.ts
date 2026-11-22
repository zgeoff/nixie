import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startTestNotebook } from '../test-utils';

async function setupTest() {
  const ctx = await startTestNotebook();

  const write = async () => {
    const outcome = await ctx.call('notebook.write', { title: 'Boiler', body: 'one' });

    invariant(outcome.status === 'ok');

    return String(outcome.result['note']);
  };

  return { ...ctx, write };
}

test('it lists the versions newest first with the time, the writer, the model and the size', async () => {
  const ctx = await setupTest();
  const note = await ctx.write();

  ctx.clock.advance(60_000);

  await ctx.call('notebook.edit', { note, append: ' two' }, { thread: 'task-4', model: 'model-b' });

  const outcome = await ctx.call('notebook.history', { note });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      note,
      versions: [
        { version: 2, at: '2026-11-21T08:01:00Z', writer: 'task-4', model: 'model-b', chars: 7 },
        {
          version: 1,
          at: '2026-11-21T08:00:00Z',
          writer: 'conversation',
          model: 'model-a',
          chars: 3,
        },
      ],
      next: null,
    },
  });
});

test('it lists 50 versions a call, with a cursor for the older ones', async () => {
  const ctx = await setupTest();
  const note = await ctx.write();

  for (let count = 0; count < 54; count += 1) {
    await ctx.call('notebook.edit', { note, append: 'x' });
  }

  const first = await ctx.call('notebook.history', { note });

  invariant(first.status === 'ok');

  const next = first.result['next'];

  invariant(typeof next === 'string');

  const second = await ctx.call('notebook.history', { note, after: next });

  invariant(second.status === 'ok');

  expect([
    first.result['versions'],
    second.result['versions'],
    second.result['next'],
  ]).toStrictEqual([expect.toBeArrayOfSize(50), expect.toBeArrayOfSize(5), null]);
});

test('it refuses an unknown note with UNKNOWN_NOTE', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.call('notebook.history', { note: 'zzzzzzzzzz' });

  expect(outcome).toMatchObject({ refusalCode: 'UNKNOWN_NOTE' });
});
