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
import { actionProposedCodec } from '@heynixie/policy';
import { readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { buildReminderSetTool } from '@heynixie/reminders';
import { buildReminderToolCall, startTestReminders } from '@heynixie/reminders/test-utils';
import { renderActionResult } from '@heynixie/sessions';
import type { ApprovedRun, RelatedMemoryLookup, ToolCallOptions, ToolRun } from '@heynixie/tools';
import { buildToolRegistry, runApprovedCall, runToolCall } from '@heynixie/tools';
import { buildMockToolContext, buildStubActionQueue } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';

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
    askSetTomatoes: async () => {
      await memory.store.waitForSemanticIndex();

      const run: ToolRun = {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: ['reminder.set'],
        model: { model: 'model-a', profile: 'chat-direct' },
      };

      const options: ToolCallOptions = {
        registry,
        decide: readStarterDecisionPoint(
          (tool) => registry.findTool(tool)?.definition.declaration ?? null,
          {
            extraRules: [
              {
                id: 'ask-reminders',
                revision: 2,
                rule: { id: 'ask-reminders', outcome: 'ask', tools: ['reminder.set'] },
              },
            ],
          },
        ),
        log: memory.log,
        definitions: () => ({ snapshotHash: 'sha256:test' }),
        queue: buildStubActionQueue().queue,
        queuedWaitMs: 1000,
      };

      await runToolCall(
        { tool: 'reminder.set', input: setTomatoes, toolUseID: null },
        run,
        options,
      );

      const entries = await readRecords(memory.log, { afterSequence: 0 });

      const proposed = entries.find((entry) => entry.record.kind === 'policy.action_proposed');

      invariant(proposed, 'the call asks');

      const proposal = actionProposedCodec.decode(proposed.record.payload);

      return {
        approve: () =>
          runApprovedCall(
            {
              actionID: proposal.proposalID,
              tool: 'reminder.set',
              input: setTomatoes,
              callSequence: proposal.callSequence,
              actionHash: proposal.actionHash,
            },
            run,
            options,
          ),
      };
    },
    readApprovedRender: async (approved: ApprovedRun) => {
      invariant(approved.status === 'done', 'the approved call ran');

      const entries = await readRecords(memory.log, { afterSequence: 0 });

      const result = entries.find((entry) => entry.record.sequence === approved.resultSequence);

      invariant(result, 'the approved call wrote its result');

      return renderActionResult(result.record, {
        result: approved.result,
        images: approved.images,
      }).text;
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

test('it renders the result of an approved reminder with no trace of a related item forgotten before the render', async () => {
  const ctx = await setupTest();
  const tomatoes = await ctx.remember('The tomatoes live in the greenhouse');
  const asked = await ctx.askSetTomatoes();
  const approved = await asked.approve();

  await ctx.memory.store.forget({ target: tomatoes, provenance: buildMockProvenance() });

  const rendered = await ctx.readApprovedRender(approved);

  expect(rendered).not.toContain('The tomatoes live in the greenhouse');
});
