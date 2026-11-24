import { expect, mock, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildRelatedMemoryLookup } from '@heynixie/memory';
import {
  buildMockProvenance,
  buildStubEncoder,
  createMemoryItem,
  readItemShortID,
  startTestMemory,
} from '@heynixie/memory/test-utils';
import { readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { buildReminderSetTool } from '@heynixie/reminders';
import { buildReminderToolCall, startTestReminders } from '@heynixie/reminders/test-utils';
import type { RelatedMemoryLookup } from '@heynixie/tools';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { buildMockToolContext } from '@heynixie/tools/test-utils';

async function setupTest() {
  const memory = await startTestMemory({
    semanticSearch: {
      encoder: buildStubEncoder([['tomatoes', 'greenhouse'], ['piano']]),
      onError: mock<(error: unknown) => void>(),
    },
  });

  const reminders = await startTestReminders();

  const set = buildReminderSetTool({
    ...reminders.reminders,
    relatedMemory: buildRelatedMemoryLookup(() => memory.store, mock<RelatedMemoryLookup['log']>()),
  });

  const registry = buildToolRegistry([set]);

  const setTomatoes = {
    name: 'Tomatoes',
    note: 'Water the greenhouse tomatoes.',
    trigger: { at: '2027-03-10T08:00:00Z' },
  };

  return {
    memory,
    remember: async (text: string) => {
      const item = await createMemoryItem(memory.store, { text });

      return { ...item, shortID: await readItemShortID(memory.log, item.itemID) };
    },
    runSetTomatoes: async () => {
      await memory.store.waitForSemanticIndex();

      return set.run(buildReminderToolCall('reminder.set', setTomatoes), buildMockToolContext());
    },
    callSetTomatoes: async () => {
      await memory.store.waitForSemanticIndex();

      return runToolCall(
        { tool: 'reminder.set', input: setTomatoes, toolUseID: null },
        {
          runID: 'run-1',
          thread: 'conversation',
          logThread: 'conversation',
          tools: ['reminder.set'],
          model: { model: 'model-a', profile: 'chat-direct' },
        },
        {
          registry,
          decide: readStarterDecisionPoint(
            (tool) => registry.findTool(tool)?.definition.declaration ?? null,
          ),
          log: memory.log,
          definitions: () => ({ snapshotHash: 'sha256:test' }),
          queue: {
            enqueue: () => Promise.reject(new Error('reminder.set runs direct')),
            readOpenRepeat: () => Promise.resolve(null),
            readOpenAsk: () => Promise.resolve(null),
            waitForOutcome: () => Promise.resolve(null),
          },
          queuedWaitMs: 1000,
        },
      );
    },
    readStoredText: async () => {
      const entries = await readRecords(memory.log, { afterSequence: 0 });

      return JSON.stringify(entries);
    },
  };
}

test('it sets a reminder and returns the active memory item that its text matches', async () => {
  const ctx = await setupTest();
  const tomatoes = await ctx.remember('The tomatoes live in the greenhouse');

  await ctx.remember('The piano is tuned in spring');

  const outcome = await ctx.runSetTomatoes();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      reminder: expect.stringMatching(/^[0-9a-z]{10}$/u),
      rendered: 'once on Wed 10 Mar at 08:00',
      next: ['2027-03-10T08:00:00+00:00'],
      related: [{ shortID: tomatoes.shortID, text: 'The tomatoes live in the greenhouse' }],
    },
    record: {
      reminder: expect.stringMatching(/^[0-9a-z]{10}$/u),
      rendered: 'once on Wed 10 Mar at 08:00',
      next: ['2027-03-10T08:00:00+00:00'],
    },
  });
});

test('it sets a reminder with no related field when no memory item matches', async () => {
  const ctx = await setupTest();

  await ctx.remember('The piano is tuned in spring');

  const outcome = await ctx.runSetTomatoes();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      reminder: expect.stringMatching(/^[0-9a-z]{10}$/u),
      rendered: 'once on Wed 10 Mar at 08:00',
      next: ['2027-03-10T08:00:00+00:00'],
    },
  });
});

test('it sets a reminder with no related field when the only match is retired', async () => {
  const ctx = await setupTest();
  const tomatoes = await ctx.remember('The tomatoes live in the greenhouse');

  await ctx.memory.store.retire({ target: tomatoes, provenance: buildMockProvenance() });

  const outcome = await ctx.runSetTomatoes();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      reminder: expect.stringMatching(/^[0-9a-z]{10}$/u),
      rendered: 'once on Wed 10 Mar at 08:00',
      next: ['2027-03-10T08:00:00+00:00'],
    },
  });
});

test('it keeps the text of a related item out of the stored result, so a forget leaves no copy', async () => {
  const ctx = await setupTest();
  const tomatoes = await ctx.remember('The tomatoes live in the greenhouse');

  await ctx.callSetTomatoes();
  await ctx.memory.store.forget({ target: tomatoes, provenance: buildMockProvenance() });
  await ctx.memory.store.finishForgets([tomatoes.itemID]);

  const stored = await ctx.readStoredText();

  expect(stored).not.toContain('The tomatoes live in the greenhouse');
});
