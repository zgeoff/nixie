import { expect, mock, test } from 'bun:test';
import { createMemoryItem } from '@heynixie/memory/test-utils';
import { pickText, startTestNotebook } from '@heynixie/notebook/test-utils';
import { conversationTaskID } from '@heynixie/tasks';
import {
  buildTestDefinitionReaders,
  buildTestRunSettings,
  buildTestTaskRunners,
} from '@heynixie/tasks/test-utils';
import { runTurnInputForget } from './run-turn-input-forget';

async function setupTest() {
  const notebook = await startTestNotebook();

  const closeCaptures = mock(() => Promise.resolve());
  const removeForgotten = mock(() => Promise.resolve());

  return {
    ...notebook,
    closeCaptures,
    removeForgotten,
    forget: (cause: Parameters<typeof runTurnInputForget>[1]) =>
      runTurnInputForget(
        {
          context: {
            log: notebook.log,
            clock: notebook.log.writer.clock,
            definitions: () => ({ snapshotHash: 'sha256:test' }),
            runSettings: buildTestRunSettings(),
            ...buildTestDefinitionReaders(),
            runners: buildTestTaskRunners(),
          },
          turnInputs: { closeCaptures, removeForgotten },
        },
        cause,
      ),
  };
}

test('it removes every request taken in at or after a forgotten record, on every thread', async () => {
  const ctx = await setupTest();

  await ctx.forget({ recordSequence: 42 });

  expect(ctx.removeForgotten).toHaveBeenCalledWith({ threads: [], fromSequence: 42 });
});

test('it covers the conversation thread for a forgotten memory item', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory, { text: 'Is allergic to peanuts' });

  await ctx.forget({ itemID: item.itemID });

  expect(ctx.removeForgotten).toHaveBeenCalledWith({
    threads: [conversationTaskID],
    fromSequence: expect.any(Number),
  });
});

test('it ends every open capture, on every thread, for a forgotten memory item', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory, { text: 'Is allergic to peanuts' });

  await ctx.forget({ itemID: item.itemID });

  expect(ctx.closeCaptures).toHaveBeenCalledExactlyOnceWith({ cause: 'forget' });
});

test('it removes the requests from the first record of a forgotten memory item on', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory, { text: 'Is allergic to peanuts' });

  await ctx.forget({ itemID: item.itemID });

  expect(ctx.removeForgotten).toHaveBeenCalledWith({
    threads: [conversationTaskID],
    fromSequence: expect.any(Number),
  });
});

test('it removes every request when no record names the forgotten item', async () => {
  const ctx = await setupTest();

  await ctx.forget({ itemID: crypto.randomUUID() });

  expect(ctx.removeForgotten).toHaveBeenCalledWith({
    threads: [conversationTaskID],
    fromSequence: null,
  });
});

test('it ends every open capture of a record forget before it removes any request', async () => {
  const ctx = await setupTest();

  await ctx.forget({ recordSequence: 7 });

  expect(ctx.closeCaptures).toHaveBeenCalledBefore(ctx.removeForgotten);
  expect(ctx.closeCaptures).toHaveBeenCalledWith({ cause: 'forget' });
});

test('it fails the forget when a capture key could not be shredded', async () => {
  const ctx = await setupTest();

  ctx.closeCaptures.mockRejectedValueOnce(new Error('key store busy'));

  const forgetting = ctx.forget({ recordSequence: 7 });

  await Promise.allSettled([forgetting]);

  expect(forgetting).rejects.toThrow('key store busy');
  expect(ctx.removeForgotten).not.toHaveBeenCalled();
});

test('it removes the requests from the first record of a forgotten note on, and names no thread', async () => {
  const ctx = await setupTest();

  await ctx.seed.ownerMessages(['an earlier message']);

  const written = await ctx.call('notebook.write', { title: 'Boiler', body: 'Body.' });

  expect(written.status).toBe('ok');

  const [first] = await ctx.readRecords(['notebook.note_written']);

  await ctx.call('notebook.edit', {
    note: pickText(first?.record.payload['shortID']),
    append: 'x',
  });

  await ctx.forget({ noteID: pickText(first?.record.payload['note']) });

  expect(ctx.removeForgotten).toHaveBeenCalledWith({
    threads: [],
    fromSequence: first?.record.sequence,
  });
});

test('it ends every open capture of a note forget before it removes any request', async () => {
  const ctx = await setupTest();

  await ctx.forget({ noteID: crypto.randomUUID() });

  expect(ctx.closeCaptures).toHaveBeenCalledBefore(ctx.removeForgotten);
  expect(ctx.closeCaptures).toHaveBeenCalledWith({ cause: 'forget' });
});

test('it removes every request when no record names the forgotten note', async () => {
  const ctx = await setupTest();

  await ctx.forget({ noteID: crypto.randomUUID() });

  expect(ctx.removeForgotten).toHaveBeenCalledWith({ threads: [], fromSequence: null });
});
