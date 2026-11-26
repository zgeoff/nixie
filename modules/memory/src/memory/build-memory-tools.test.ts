import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { buildShortIDFromUUID } from '@heynixie/db';
import type { JSONObject, LogTables } from '@heynixie/log';
import { readRecordKeys, readRecords } from '@heynixie/log';
import type { EffectDeclaration, Rule, RuleEntry } from '@heynixie/policy';
import {
  buildAllowingDecisionPoint,
  readStarterDecisionPoint,
  readStarterRules,
} from '@heynixie/policy/test-utils';
import type { ToolCallOptions, ToolRun } from '@heynixie/tools';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { parseFencedResult } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { defaultGateLimits } from '../gate/default-gate-limits';
import type { TestMemoryOptions } from '../test-utils';
import {
  buildMockCheckerAnswer,
  createProposal,
  readItemShortID,
  startTestMemory,
} from '../test-utils';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { buildMockToolContext } from '../test-utils/build-mock-tool-context';
import { writeModelReplyRecord } from '../test-utils/write-model-reply-record';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';
import type { MemoryTables } from '../types';
import { buildMemoryTools } from './build-memory-tools';

async function setupTest(config: TestMemoryOptions = {}) {
  const memory = await startTestMemory(config);

  const registry = buildToolRegistry(
    buildMemoryTools(memory.store, {
      clock: { now: () => Date.now() },
      ownerName: null,
      defaultZone: 'UTC',
    }),
  );

  const toolCallOptions = {
    registry,

    decide: buildAllowingDecisionPoint(),
    log: memory.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),

    queue: {
      enqueue: () => Promise.reject(new Error('no memory tool runs queued')),
      readOpenRepeat: () => Promise.resolve(null),
      readOpenAsk: () => Promise.resolve(null),
      waitForOutcome: () => Promise.resolve(null),
    },
    queuedWaitMs: 1000,
  };

  return {
    memory,
    registry,
    rememberAsTask: (input: Record<string, string>, run: Partial<ToolRun>) => {
      const tool = registry.findTool('memory.remember');

      invariant(tool);

      return tool.definition.run(
        {
          callID: 'call-1',
          tool: 'memory.remember',
          input: {
            gist: 'a gist',
            topic: 'a topic',
            text: 'Allergic to hazelnuts',
            quote: "I'm allergic to hazelnuts",
            ...input,
          },
          toolUseID: null,
        },
        buildMockToolContext(run),
      );
    },
    readRecordKinds: async (afterSequence: number) => {
      const entries = await readRecords(memory.log, { afterSequence, limit: 1000 });

      return entries.map((entry) => entry.record.kind);
    },
    createRelabelledItem: async (text: string) => {
      const item = await memory.store.remember({
        text,
        labels: { gist: 'a first gist', topic: 'home', triggers: [] },
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
      });

      await memory.store.writes.editLabels({
        target: item,
        labels: { gist: 'a second gist', topic: 'home', triggers: ['reminder'] },
        caller: {
          origin: 'conversation',
          thread: 'conversation',
          logThread: 'conversation',
          taskID: 'conversation',
          runID: 'conversation',
          model: 'test-model',
        },
      });

      const [proposal] = await memory.store.proposals.listPending();

      invariant(proposal, 'the label-only edit left no proposal');

      await memory.store.proposals.approve({
        proposalID: proposal.proposalID,
        actionHash: proposal.actionHash,
        identityID: 'host',
      });

      return { itemID: item.itemID, shortID: await readItemShortID(memory.log, item.itemID) };
    },
    buildStarterDecisionPoint: (options: { readonly extraRules?: readonly RuleEntry[] } = {}) =>
      readStarterDecisionPoint(
        (tool) => registry.findTool(tool)?.definition.declaration ?? null,
        options,
      ),
    buildSnapshotDecisionPoint: (tools: ReadonlyMap<string, EffectDeclaration>) =>
      readStarterDecisionPoint((tool) => registry.findTool(tool)?.definition.declaration ?? null, {
        readInputs: () =>
          Promise.resolve({
            rules: readStarterRules(),
            contacts: [],
            tools,
            ownerDestinations: [],
          }),
      }),
    callTool: (
      tool: string,
      input: Record<string, string | number>,
      decide: ToolCallOptions['decide'],
    ) =>
      runToolCall(
        { tool, input, toolUseID: null },
        {
          runID: 'run-1',
          thread: 'conversation',
          logThread: 'conversation',
          tools: [tool],
          model: { model: 'test-model', profile: 'standard' },
        },
        { ...toolCallOptions, decide },
      ),
    toolCallOptions,
  };
}

test('it declares read for the reads, export for export, memory_write for remember, edit, retire and pin, and note for the unpin', async () => {
  const ctx = await setupTest();

  const effects = [
    'memory.recall',
    'memory.pending',
    'memory.remember',
    'memory.edit',
    'memory.retire',
    'memory.pin',
    'memory.unpin',
    'memory.export',
    'moment.keep',
    'moment.edit',
    'moment.link',
    'moment.retire',
    'moment.find',
    'moment.read',
  ].map((name) => [name, ctx.registry.findTool(name)?.definition.declaration.effects]);

  expect(effects).toStrictEqual([
    ['memory.recall', ['read']],
    ['memory.pending', ['read']],
    ['memory.remember', ['memory_write']],
    ['memory.edit', ['memory_write']],
    ['memory.retire', ['memory_write']],
    ['memory.pin', ['memory_write']],
    ['memory.unpin', ['note']],
    ['memory.export', ['export']],
    ['moment.keep', ['note']],
    ['moment.edit', ['note']],
    ['moment.link', ['note']],
    ['moment.retire', ['note']],
    ['moment.find', ['read']],
    ['moment.read', ['read']],
  ]);
});

test('it applies a backed fact with the caller and model of the run, never of the arguments', async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  const tool = ctx.registry.findTool('memory.remember');

  invariant(tool);

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'task-9',
    text: "I'm allergic to hazelnuts",
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: {
        gist: 'a gist',
        topic: 'a topic',
        text: 'Allergic to hazelnuts',
        quote: "I'm allergic to hazelnuts",
      },
      toolUseID: null,
    },
    buildMockToolContext({
      thread: 'task-9',
      model: { model: 'test-model', profile: 'standard' },
    }),
  );

  invariant(outcome.status === 'ok' && typeof outcome.result['itemID'] === 'string');

  const row = await ctx.memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .innerJoin('memory_items', 'memory_items.item_id', 'memory_versions.item_id')
    .select(['origin', 'source', 'task_id', 'model'])
    .where('memory_items.short_id', '=', outcome.result['itemID'])
    .executeTakeFirstOrThrow();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { status: 'applied', itemID: expect.toBeString(), version: 1 },
  });

  expect(tool.parseOutput(outcome.result)).toStrictEqual({ isValid: true });

  expect(row).toStrictEqual({
    origin: 'task',
    source: 'owner',
    task_id: 'task-9',
    model: 'test-model',
  });
});

test('it applies a fact quoted from a message outside the window by its event ID', async () => {
  const ctx = await setupTest({
    gate: {
      check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })),
      limits: { evidenceWindow: 1, proposalLapseMs: 1000, proposalCap: 10, closeMatchScore: 0.6 },
    },
  });

  const tool = ctx.registry.findTool('memory.remember');

  invariant(tool);

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'My bike is the green one',
    spans: [{ start: 0, end: 24, source: 'typed' }],
  });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Thanks',
    spans: [{ start: 0, end: 6, source: 'typed' }],
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: {
        gist: 'a gist',
        topic: 'a topic',
        text: 'Bike is the green one',
        quote: 'My bike is the green one',
        eventID: String(sequence),
      },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { status: 'applied', itemID: expect.toBeString(), version: 1 },
  });
});

test('it returns a proposal with the sentence for its reason, not an error, for a fact with no quote', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.remember');

  invariant(tool);

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: { gist: 'a gist', topic: 'a topic', text: 'Allergic to hazelnuts' },
      toolUseID: null,
    },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  invariant(outcome.status === 'ok');

  expect(outcome.result).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    reason:
      "no_quote: Saved as a proposal for the owner to review. The write gave no quote, or neither the owner's last 20 messages nor the message its eventID names contains it.",
    merged: false,
  });

  expect(tool.parseOutput(outcome.result)).toStrictEqual({ isValid: true });
});

test('it returns a proposal with the photo sentence for a fact from an image of the owner', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'I ride this green cargo bike',
    spans: [{ start: 0, end: 28, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const tool = ctx.registry.findTool('memory.remember');

  invariant(tool);

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: {
        gist: 'a gist',
        topic: 'a topic',
        text: 'Rides a green cargo bike',
        quote: 'I ride this green cargo bike',
        image: { eventID: `#${String(photo)}`, number: 1 },
      },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  const [proposal] = await ctx.memory.store.proposals.listPending();

  invariant(proposal);

  expect(outcome).toStrictEqual({
    status: 'ok',
    hidden: {
      uuids: { [buildShortIDFromUUID(proposal.proposalID)]: proposal.proposalID },
    },
    result: {
      status: 'proposed',
      proposalID: buildShortIDFromUUID(proposal.proposalID),
      reason:
        'from_photo: Saved as a proposal for the owner to review. It comes from a photo, and a memory from a photo waits for their review unless an allow rule covers it.',
      merged: false,
    },
  });
});

test('it returns an image source that is no image of the owner to the model as an error', async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'I ride a green cargo bike',
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const tool = ctx.registry.findTool('memory.remember');

  invariant(tool);

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: {
        gist: 'a gist',
        topic: 'a topic',
        text: 'Rides a green cargo bike',
        image: { eventID: String(message), number: 1 },
      },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: `#${String(message)} holds no image 1 of the owner's in this thread, so nothing was saved.`,
  });
});

test.each(['shared', 'self'] as const)(
  'it proposes a memory with the %s subject the call names',
  async (subject) => {
    const ctx = await setupTest();

    const tool = ctx.registry.findTool('memory.remember');

    invariant(tool);

    await tool.definition.run(
      {
        callID: 'call-1',
        tool: 'memory.remember',
        input: {
          gist: 'a gist',
          topic: 'a topic',
          text: 'Calls the garden shed the cabin',
          subject,
        },
        toolUseID: null,
      },
      {
        callSequence: 1,
        run: {
          runID: 'run-1',
          thread: 'conversation',
          logThread: 'conversation',
          tools: [],
          model: { model: 'test-model', profile: 'standard' },
        },
      },
    );

    const pending = await ctx.memory.store.proposals.listPending();

    expect(pending.map((proposal) => [proposal.subject, proposal.text])).toStrictEqual([
      [subject, 'Calls the garden shed the cabin'],
    ]);
  },
);

test('it gives the token sentence for a fact with a number its typed quote lacks', async () => {
  const ctx = await setupTest({ gate: { ownerName: 'Avery' } });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'My phone number changed',
    spans: [{ start: 0, end: 23, source: 'typed' }],
  });

  const result = await runToolCall(
    {
      tool: 'memory.remember',
      input: {
        gist: 'a gist',
        topic: 'a topic',
        text: 'Phone number is 0412 555 019',
        quote: 'My phone number changed',
      },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.remember'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    reason:
      "token_missing: Saved as a proposal for Avery to review. The new text has a number, address, handle or link that isn't in the quote, or in what Avery typed in their last 20 messages.",
    merged: false,
  });
});

test('it applies a write under an allow rule though the owner never typed the number, because the rule is their consent', async () => {
  const ctx = await setupTest({ gate: { ownerName: 'Avery' } });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'My phone number changed',
    spans: [{ start: 0, end: 23, source: 'typed' }],
  });

  const result = await runToolCall(
    {
      tool: 'memory.remember',
      input: {
        gist: 'a gist',
        topic: 'a topic',
        text: 'Phone number is 0412 555 019',
        quote: 'Phone number is 0412 555 019',
      },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.remember'],
      model: { model: 'test-model', profile: 'standard' },
    },
    {
      ...ctx.toolCallOptions,
      decide: buildAllowingDecisionPoint({
        allowing: [{ id: 'rule-a', revision: 2, checks: [] }],
      }),
    },
  );

  expect(result.structuredContent).toStrictEqual({
    status: 'applied',
    itemID: expect.toBeString(),
    version: 1,
  });
});

test("it names the gate's configured window in the sentence for a quote older than that window", async () => {
  const ctx = await setupTest({
    gate: {
      check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })),
      limits: { ...defaultGateLimits, evidenceWindow: 2 },
      ownerName: 'Avery',
    },
  });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'I keep bees on the roof',
    spans: [{ start: 0, end: 23, source: 'typed' }],
  });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'The kettle is broken',
    spans: [{ start: 0, end: 20, source: 'typed' }],
  });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Back by six',
    spans: [{ start: 0, end: 11, source: 'typed' }],
  });

  const result = await runToolCall(
    {
      tool: 'memory.remember',
      input: {
        gist: 'a gist',
        topic: 'a topic',
        text: 'Keeps bees on the roof',
        quote: 'I keep bees on the roof',
      },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.remember'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    reason:
      "no_quote: Saved as a proposal for Avery to review. The write gave no quote, or neither Avery's last 2 messages nor the message its eventID names contains it.",
    merged: false,
  });
});

test('it applies a backed edit of the item its short ID names as a new version and keeps the old version in history', async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  invariant(shortID);

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'I live on Oak Avenue now',
    spans: [{ start: 0, end: 24, source: 'typed' }],
  });

  const result = await runToolCall(
    {
      tool: 'memory.edit',
      input: {
        itemID: shortID,
        version: 1,
        text: 'Lives on Oak Avenue',
        quote: 'I live on Oak Avenue now',
      },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.edit'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(result.structuredContent).toStrictEqual({
    status: 'applied',
    itemID: shortID,
    version: 2,
  });

  expect(history?.versions).toMatchObject([
    { version: 1, change: 'created', text: 'Lives on Elm Street' },
    { version: 2, change: 'edited', origin: 'conversation', text: 'Lives on Oak Avenue' },
  ]);
});

test('it turns an edit with no backing words into a proposal with the sentence for its reason', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Drinks oat milk',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await runToolCall(
    {
      tool: 'memory.edit',
      input: { itemID: item.itemID, version: 1, text: 'Drinks almond milk' },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.edit'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const pending = await ctx.memory.store.proposals.listPending();
  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(result.structuredContent).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    reason:
      "no_quote: Saved as a proposal for the owner to review. The write gave no quote, or neither the owner's last 20 messages nor the message its eventID names contains it.",
    merged: false,
  });

  expect(pending).toMatchObject([
    {
      operation: 'remember',
      itemID: item.itemID,
      targetVersion: 1,
      text: 'Drinks almond milk',
      reason: 'no_quote',
    },
  ]);

  expect(history?.versions).toMatchObject([{ version: 1, text: 'Drinks oat milk' }]);
});

test('it records an edit call with neither its text nor its quote, which the gate has not checked', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Owns a tabby cat called Miso',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await runToolCall(
    {
      tool: 'memory.edit',
      input: {
        itemID: item.itemID,
        version: 1,
        text: 'Owns two tabby cats called Miso and Udon',
        quote: 'Owns two tabby cats called Miso and Udon',
      },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.edit'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  expect(entries.find((entry) => entry.record.kind === 'tool_called')?.record).toMatchObject({
    erasable: {
      status: 'readable',
      fields: { input: { itemID: item.itemID, version: 1 } },
    },
  });

  expect(JSON.stringify(entries)).not.toInclude('Udon');
});

test('it returns a stale edit to the model as an error that names the item by its short ID', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.edit');

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  invariant(tool);

  await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.edit',
      input: { itemID: item.itemID, version: 1, text: 'Lives on Oak Avenue' },
      toolUseID: null,
    },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: `memory item ${shortID} is at version 2, not the version 1 the caller read`,
  });
});

test('it returns an edit of an ID that names no item to the model as an error with that ID', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.edit');

  invariant(tool);

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.edit',
      input: { itemID: 'z9z9z9z9z9', version: 1, text: 'Lives on Oak Avenue' },
      toolUseID: null,
    },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'no memory item z9z9z9z9z9 to change',
  });
});

test('it retires the item its short ID names when the model read it and you asked to retire it', async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  const tool = ctx.registry.findTool('memory.retire');

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const [shortID] = await Promise.all([
    readItemShortID(ctx.memory.log, item.itemID),
    writeOwnerMessageRecord(ctx.memory.log, {
      thread: 'conversation',
      text: 'I moved out of Elm Street',
      spans: [{ start: 0, end: 25, source: 'typed' }],
    }),
  ]);

  invariant(tool);

  await ctx.memory.store.recall({ itemIDs: [item.itemID], thread: 'conversation' });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.retire',
      input: { itemID: shortID, version: 1, intentQuote: 'I moved out of Elm Street' },
      toolUseID: null,
    },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { status: 'applied', itemID: shortID, version: 2 },
  });

  expect(history?.versions.at(-1)).toMatchObject({ change: 'retired', origin: 'conversation' });
});

test('it returns a full proposal cap to the model as an error', async () => {
  const memory = await startTestMemory({
    gate: {
      limits: { evidenceWindow: 20, proposalLapseMs: 1000, proposalCap: 1, closeMatchScore: 0.6 },
    },
  });

  const tool = buildToolRegistry(
    buildMemoryTools(memory.store, {
      clock: { now: () => Date.now() },
      ownerName: null,
      defaultZone: 'UTC',
    }),
  ).findTool('memory.remember');

  const call = {
    callID: 'call-1',
    tool: 'memory.remember',
    input: { gist: 'a gist', topic: 'a topic', text: 'Likes jazz' },
    toolUseID: null,
  };

  const context = {
    callSequence: 1,
    run: {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: [],
      model: { model: 'test-model', profile: 'standard' },
    },
  };

  invariant(tool);

  await tool.definition.run(call, context);

  const outcome = await tool.definition.run(
    { ...call, callID: 'call-2', input: { text: 'Likes opera', gist: 'opera', topic: 'music' } },
    context,
  );

  expect(outcome).toMatchObject({ status: 'error', message: expect.toInclude('memory proposals') });
});

test('it recalls items with a result that its output schema accepts', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.recall');

  invariant(tool);

  await ctx.memory.store.remember({
    labels: { gist: 'a gist', topic: 'a topic', triggers: ['a trigger'] },
    text: 'Allergic to hazelnuts',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.recall',
      input: { query: 'hazelnuts', includeHistory: true },
      toolUseID: null,
    },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  invariant(outcome.status === 'ok');

  expect(tool.parseOutput(outcome.result)).toStrictEqual({ isValid: true });

  expect(outcome.result).toMatchObject({
    items: [
      {
        text: 'Allergic to hazelnuts',
        history: [{ textVersion: 1 }],
        gist: 'a gist',
        topic: 'a topic',
        triggers: ['a trigger'],
        version: 1,
      },
    ],
    next: null,
  });
});

test('it tells the model when to reach for recall', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.recall');

  expect(tool?.definition.description).toInclude(
    'Use it when you half-remember something said, or when a detail from before would change your answer.',
  );
});

test('it recalls a version with its quote, its model and the line that says where it came from', async () => {
  const ctx = await setupTest();

  setSystemTime(new Date(Date.UTC(2026, 9, 1, 9, 30)));
  onTestFinished(() => setSystemTime());

  const quote = 'Gerald the starter needs feeding again';

  const recordSequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: quote,
    spans: [{ start: 0, end: quote.length, source: 'typed' }],
  });

  const item = await ctx.memory.store.remember({
    labels: { gist: 'a gist', topic: 'a topic', triggers: ['a trigger'] },
    text: 'Keeps a sourdough starter called Gerald',
    evidenceQuote: quote,
    evidence: { recordSequence, start: 0, end: quote.length },
    provenance: {
      origin: 'conversation',
      source: 'owner',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
      model: 'test-model-1',
    },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.recall', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    items: [
      {
        itemID: shortID,
        usage: 'never surfaced',
        isPinned: false,
        subject: 'owner',
        gist: 'a gist',
        topic: 'a topic',
        triggers: ['a trigger'],
        version: 1,
        change: 'created',
        state: 'active',
        text: 'Keeps a sourdough starter called Gerald',
        about: `${shortID} v1 · 1 Oct · you noted it · the owner said this`,
        quote: 'Gerald the starter needs feeding again',
        model: 'test-model-1',
      },
    ],
    next: null,
    searched: {},
  });
});

test('it recalls a version made from a photo with the event and number of its image', async () => {
  const ctx = await setupTest();

  setSystemTime(new Date(Date.UTC(2026, 9, 3, 11, 0)));
  onTestFinished(() => setSystemTime());

  const item = await ctx.memory.store.remember({
    labels: { gist: 'a gist', topic: 'a topic', triggers: ['a trigger'] },
    text: 'Paddles a red kayak',
    provenance: {
      origin: 'owner',
      source: 'untrusted',
      taskID: null,
      proposalID: null,
      checks: { tokens: 'pass', image: { messageSequence: 7, image: 2 } },
    },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.recall', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    items: [
      {
        itemID: shortID,
        usage: 'never surfaced',
        isPinned: false,
        subject: 'owner',
        gist: 'a gist',
        topic: 'a topic',
        triggers: ['a trigger'],
        version: 1,
        change: 'created',
        state: 'active',
        text: 'Paddles a red kayak',
        about: `${shortID} v1 · 3 Oct · unconfirmed`,
        image: { eventID: '7', number: 2 },
        model: null,
      },
    ],
    next: null,
    searched: {},
  });
});

test('it recalls a version with no quote or model without them', async () => {
  const ctx = await setupTest();

  setSystemTime(new Date(Date.UTC(2026, 8, 14, 18, 5)));

  onTestFinished(() => {
    setSystemTime();
  });

  const item = await ctx.memory.store.remember({
    labels: { gist: 'a gist', topic: 'a topic', triggers: ['a trigger'] },
    text: 'Plays the cello on Sundays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.recall', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    items: [
      {
        itemID: shortID,
        usage: 'never surfaced',
        isPinned: false,
        subject: 'owner',
        gist: 'a gist',
        topic: 'a topic',
        triggers: ['a trigger'],
        version: 1,
        change: 'created',
        state: 'active',
        text: 'Plays the cello on Sundays',
        about: `${shortID} v1 · 14 Sep · the owner said this`,
        model: null,
      },
    ],
    next: null,
    searched: {},
  });
});

test('it recalls an approved proposal as approved by the owner, with its stored source still outside content', async () => {
  const ctx = await setupTest();

  setSystemTime(new Date(Date.UTC(2026, 9, 13, 9, 30)));
  onTestFinished(() => setSystemTime());

  const pending = await createProposal(ctx.memory.store, { text: 'Keeps a fern on the desk' });

  await ctx.memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const shortID = await readItemShortID(ctx.memory.log, pending.itemID);

  const result = await runToolCall(
    { tool: 'memory.recall', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const row = await ctx.memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select('source')
    .where('item_id', '=', pending.itemID)
    .executeTakeFirst();

  expect(result.structuredContent).toMatchObject({
    items: [
      {
        text: 'Keeps a fern on the desk',
        about: `${shortID} v1 · 13 Oct · you noted it · unconfirmed · the owner approved`,
      },
    ],
  });

  expect(row?.source).toBe('untrusted');
});

test('it recalls each past version with the version that replaced it', async () => {
  const ctx = await setupTest();

  setSystemTime(new Date(Date.UTC(2026, 2, 2, 9, 30)));
  onTestFinished(() => setSystemTime());

  const item = await ctx.memory.store.remember({
    text: 'Lives on Juniper Lane',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Lives on Larch Road',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.recall', input: { includeHistory: true }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toMatchObject({
    items: [
      {
        text: 'Lives on Larch Road',
        about: `${shortID} v2 · 2 Mar · the owner said this`,
        history: [
          {
            text: 'Lives on Juniper Lane',
            about: `${shortID} v1 · 2 Mar · the owner said this · replaced by ${shortID} v2`,
          },
          {
            text: 'Lives on Larch Road',
            about: `${shortID} v2 · 2 Mar · the owner said this`,
          },
        ],
      },
    ],
  });
});

test('it recalls the item its short ID names', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps the bike lock code in the blue notebook',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Waters the ferns on Fridays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  invariant(shortID);

  const result = await runToolCall(
    { tool: 'memory.recall', input: { itemIDs: [shortID] }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toMatchObject({
    items: [{ itemID: shortID, text: 'Keeps the bike lock code in the blue notebook' }],
    next: null,
  });
});

test('it recalls an item by the item ID the model read before short IDs, under its short ID', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps the bike lock code in the blue notebook',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.recall', input: { itemIDs: [item.itemID] }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toMatchObject({
    items: [{ itemID: shortID, text: 'Keeps the bike lock code in the blue notebook' }],
  });
});

test('it gives the model a recalled item and leaves no readable copy once the item is forgotten', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Sister Ada lives in Leeds',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.recall', input: { query: 'Ada lives in Leeds' }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  expect(result.structuredContent).toMatchObject({
    items: [{ itemID: shortID, text: 'Sister Ada lives in Leeds' }],
  });

  expect(entries.find((entry) => entry.record.kind === 'tool_result')?.record).toMatchObject({
    erasable: {
      status: 'readable',
      fields: {
        result: { items: [{ itemID: shortID, version: 1 }], next: null },
        hidden: { uuids: { [shortID]: item.itemID } },
      },
    },
  });

  expect(JSON.stringify(entries)).not.toInclude('Leeds');
});

test('it applies a remembered fact and leaves no readable copy of its text once it is forgotten', async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: "I'm allergic to hazelnuts",
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const result = await runToolCall(
    {
      tool: 'memory.remember',
      input: {
        gist: 'a gist',
        topic: 'a topic',
        text: 'Allergic to hazelnuts',
        quote: "I'm allergic to hazelnuts",
      },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.remember'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const [item] = await ctx.memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'short_id'])
    .execute();

  invariant(item, 'the remember applied no item');

  await ctx.memory.store.forget({
    target: { itemID: item.item_id, version: 1 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  expect(result.structuredContent).toStrictEqual({
    status: 'applied',
    itemID: item.short_id,
    version: 1,
  });

  expect(JSON.stringify(entries)).not.toInclude('Allergic to hazelnuts');
});

test('it leaves no readable label of a forgotten item in a record, a column or the label entries', async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  const run = {
    runID: 'run-1',
    thread: 'conversation',
    logThread: 'conversation',
    tools: ['memory.remember', 'memory.edit'],
    model: { model: 'test-model', profile: 'standard' },
  };

  const labelTexts = [
    'Tuner visits each March',
    'instrument-care',
    'piano tuner',
    'Tuner now visits each April',
    'tuning day',
    'Tuner visit moved to May',
    'instrument-care-later',
    'tuning reminder',
  ];

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'The piano is tuned each March',
    spans: [{ start: 0, end: 29, source: 'typed' }],
  });

  await runToolCall(
    {
      tool: 'memory.remember',
      input: {
        gist: 'Tuner visits each March',
        topic: 'instrument-care',
        triggers: ['piano tuner'],
        text: 'The piano is tuned each March',
        quote: 'The piano is tuned each March',
      },
      toolUseID: null,
    },
    run,
    ctx.toolCallOptions,
  );

  const [item] = await ctx.memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'short_id'])
    .execute();

  invariant(item, 'the remember applied no item');

  await runToolCall(
    {
      tool: 'memory.edit',
      input: {
        itemID: item.short_id,
        version: 1,
        gist: 'Tuner now visits each April',
        triggers: ['piano tuner', 'tuning day'],
      },
      toolUseID: null,
    },
    run,
    ctx.toolCallOptions,
  );

  const [approvable] = await ctx.memory.store.proposals.listPending();

  invariant(approvable, 'the label-only edit left no proposal');

  await ctx.memory.store.proposals.approve({
    proposalID: approvable.proposalID,
    actionHash: approvable.actionHash,
    identityID: 'host',
  });

  await runToolCall(
    {
      tool: 'memory.edit',
      input: {
        itemID: item.short_id,
        version: 2,
        gist: 'Tuner visit moved to May',
        topic: 'instrument-care-later',
        triggers: ['tuning reminder'],
      },
      toolUseID: null,
    },
    run,
    ctx.toolCallOptions,
  );

  const readLabelStores = async () => {
    const db = ctx.memory.writer.db;

    return JSON.stringify({
      decoded: await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 }),
      stored: await db.$extendTables<LogTables>().selectFrom('records').select('payload').execute(),
      labels: await db
        .$extendTables<MemoryTables>()
        .selectFrom('memory_labels')
        .selectAll()
        .execute(),
      proposals: await db
        .$extendTables<MemoryTables>()
        .selectFrom('memory_proposals')
        .selectAll()
        .execute(),
    });
  };

  const shown = await runToolCall(
    {
      tool: 'memory.recall',
      input: { itemIDs: [item.short_id], includeHistory: true },
      toolUseID: null,
    },
    { ...run, tools: ['memory.recall'] },
    ctx.toolCallOptions,
  );

  const waiting = await runToolCall(
    { tool: 'memory.pending', input: {}, toolUseID: null },
    { ...run, tools: ['memory.pending'] },
    ctx.toolCallOptions,
  );

  await ctx.memory.store.forget({
    target: { itemID: item.item_id, version: 2 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.finishForgets([item.item_id]);

  const after = await readLabelStores();
  const keys = await readRecordKeys(ctx.memory.log, [item.item_id]);

  const sealedLabels = await ctx.memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_labels')
    .select('sealed')
    .execute();

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'The violin is restrung each June',
    spans: [{ start: 0, end: 32, source: 'typed' }],
  });

  await runToolCall(
    {
      tool: 'memory.remember',
      input: {
        gist: 'Another gist',
        topic: 'INSTRUMENT-CARE',
        text: 'The violin is restrung each June',
        quote: 'The violin is restrung each June',
      },
      toolUseID: null,
    },
    run,
    ctx.toolCallOptions,
  );

  const recalled = await runToolCall(
    { tool: 'memory.recall', input: { query: 'violin restrung' }, toolUseID: null },
    { ...run, tools: ['memory.recall'] },
    ctx.toolCallOptions,
  );

  expect(labelTexts).toSatisfyAll((text: string) =>
    JSON.stringify([shown, waiting]).includes(text),
  );

  expect(labelTexts).toSatisfyAll((text: string) => !after.includes(text));
  expect(keys.size).toBe(0);
  expect(sealedLabels).toHaveLength(2);
  expect(recalled.structuredContent).toMatchObject({ items: [{ topic: 'INSTRUMENT-CARE' }] });
});

test('it recalls an item at its revision after a label edit, in its memory line too, and records the text version', async () => {
  const ctx = await setupTest();
  const item = await ctx.createRelabelledItem('The piano is tuned each March');

  const result = await runToolCall(
    { tool: 'memory.recall', input: { itemIDs: [item.shortID] }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  expect(result.structuredContent).toMatchObject({
    items: [
      {
        itemID: item.shortID,
        version: 2,
        gist: 'a second gist',
        topic: 'home',
        triggers: ['reminder'],
        about: expect.toStartWith(`${item.shortID} v2 `),
      },
    ],
  });

  expect(entries.find((entry) => entry.record.kind === 'tool_result')?.record).toMatchObject({
    erasable: { fields: { result: { items: [{ itemID: item.shortID, version: 1 }] } } },
  });
});

test('it lists a text edit proposed after a label edit at the revision it read, and stores the text version', async () => {
  const ctx = await setupTest();
  const item = await ctx.createRelabelledItem('The piano is tuned each March');

  await ctx.memory.store.writes.remember({
    text: 'The piano is tuned each April',
    target: { itemID: item.itemID, version: 2 },
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      logThread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'test-model',
    },
  });

  const result = await runToolCall(
    { tool: 'memory.pending', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.pending'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const row = await ctx.memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select('target_version')
    .where('status', '=', 'pending')
    .executeTakeFirstOrThrow();

  expect(parseFencedResult(result)).toMatchObject({
    proposals: [{ itemID: item.shortID, version: 2 }],
  });

  expect(row.target_version).toBe(1);
});

test('it names the revision in the stale error for an edit that read the version before a label edit', async () => {
  const ctx = await setupTest();
  const item = await ctx.createRelabelledItem('The piano is tuned each March');

  const result = await runToolCall(
    {
      tool: 'memory.edit',
      input: { itemID: item.shortID, version: 1, text: 'The piano is tuned each April' },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.edit'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(JSON.stringify(result)).toInclude(
    `memory item ${item.shortID} is at version 2, not the version 1 the caller read`,
  );
});

test('it retires an item at its revision when the model read its text before a label edit', async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    labels: { gist: 'home street', topic: 'home', triggers: [] },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'I moved out of Elm Street',
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  await ctx.memory.store.recall({ itemIDs: [item.itemID], thread: 'conversation' });

  await ctx.memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'old street', topic: 'home', triggers: [] },
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      logThread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'test-model',
    },
  });

  const [proposal] = await ctx.memory.store.proposals.listPending();

  invariant(proposal);

  await ctx.memory.store.proposals.approve({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'host',
  });

  const result = await runToolCall(
    {
      tool: 'memory.retire',
      input: { itemID: shortID, version: 2, intentQuote: 'I moved out of Elm Street' },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.retire'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    status: 'applied',
    itemID: shortID,
    version: 3,
  });
});

test('it pins, unpins and forgets an item by the revision a recall shows, and records the text version', async () => {
  const ctx = await setupTest();
  const item = await ctx.createRelabelledItem('The piano is tuned each March');

  const provenance = {
    origin: 'owner' as const,
    source: 'owner' as const,
    taskID: null,
    proposalID: null,
    checks: null,
  };

  await ctx.memory.store.pin({ itemID: item.itemID, isPinned: true, version: 2, provenance });
  await ctx.memory.store.pin({ itemID: item.itemID, isPinned: false, version: 2, provenance });
  await ctx.memory.store.forget({ target: { itemID: item.itemID, version: 2 }, provenance });

  const pins = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.pinned'],
  });

  const started = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.forget_started'],
  });

  expect(pins.map((entry) => entry.record.payload)).toStrictEqual([
    { itemID: item.itemID, isPinned: true },
    { itemID: item.itemID, isPinned: false },
  ]);

  expect(started.map((entry) => entry.record.payload)).toMatchObject([
    { itemID: item.itemID, version: 1 },
  ]);
});

test('it records a remember call with neither its text nor its quote, which the gate has not checked', async () => {
  const ctx = await setupTest();

  await runToolCall(
    {
      tool: 'memory.remember',
      input: {
        gist: 'a gist',
        topic: 'a topic',
        text: 'Sister Ada lives in Leeds',
        quote: 'Sister Ada lives in Leeds',
        subject: 'owner',
      },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['memory.remember'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  expect(entries.find((entry) => entry.record.kind === 'tool_called')?.record).toMatchObject({
    erasable: { status: 'readable', fields: { input: { subject: 'owner' } } },
  });
});

test.each([
  [
    'a remember with an itemID and a version',
    'memory.remember',
    { text: 'x', itemID: 'item-a', version: 1 },
  ],
  ['a remember with no text', 'memory.remember', { quote: 'x' }],
  ['an edit with no version', 'memory.edit', { itemID: 'item-a', text: 'x' }],
  ['an edit with no itemID', 'memory.edit', { version: 1, text: 'x' }],
  ['a remember with no gist', 'memory.remember', { text: 'x', topic: 'a topic' }],
  ['a remember with no topic', 'memory.remember', { text: 'x', gist: 'a gist' }],
  [
    'a remember with a gist that spans 2 lines',
    'memory.remember',
    { text: 'x', gist: 'first\nsecond', topic: 'a topic' },
  ],
  [
    'a remember with 6 trigger phrases',
    'memory.remember',
    { text: 'x', gist: 'a gist', topic: 'a topic', triggers: ['a', 'b', 'c', 'd', 'e', 'f'] },
  ],
  ['an edit with a pin', 'memory.edit', { itemID: 'item-a', version: 1, text: 'x', pin: true }],
  ['a remember with a pin', 'memory.remember', { text: 'x', pin: true }],
  ['a retire with no version', 'memory.retire', { itemID: 'item-a' }],
  ['a pin with no version', 'memory.pin', { itemID: 'item-a' }],
  ['a pin with text', 'memory.pin', { itemID: 'item-a', version: 1, text: 'x' }],
  ['an unpin with no itemID', 'memory.unpin', {}],
  ['an unpin with a version', 'memory.unpin', { itemID: 'item-a', version: 1 }],
  ['a remember with an empty quote', 'memory.remember', { text: 'x', quote: '' }],
  [
    'a remember with an event ID that is not a number',
    'memory.remember',
    { text: 'x', eventID: 'e1' },
  ],
  [
    'an edit with an event ID of 0',
    'memory.edit',
    { itemID: 'item-a', version: 1, text: 'x', eventID: '0' },
  ],
  ['a recall with an unknown argument', 'memory.recall', { everything: true }],
  ['a recall with a cursor no page returned', 'memory.recall', { after: 'abc' }],
])('it refuses %s', async (_label, name, input) => {
  const ctx = await setupTest();

  const check = ctx.registry.findTool(name)?.parseInput(input);

  expect(check).toMatchObject({ isValid: false });
});

test.each([
  ['memory.remember', { text: 'Keeps a brass compass', gist: 'brass compass', topic: 'gear' }],
  ['memory.edit', { version: 1, text: 'Keeps a silver compass' }],
  ['memory.retire', { version: 1 }],
  ['memory.pin', { version: 1 }],
])(
  'it shows the short ID of the proposal that %s makes, as memory.pending shows it, and hides its UUID',
  async (name, input) => {
    const ctx = await setupTest();

    const item = await ctx.memory.store.remember({
      text: 'Keeps a copper compass',
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    });

    const call = (tool: string, toolInput: JSONObject) =>
      runToolCall(
        { tool, input: toolInput, toolUseID: null },
        {
          runID: 'run-1',
          thread: 'conversation',
          logThread: 'conversation',
          tools: [tool],
          model: { model: 'test-model', profile: 'standard' },
        },
        ctx.toolCallOptions,
      );

    const writeInput = name === 'memory.remember' ? input : { itemID: item.itemID, ...input };

    const written = await call(name, writeInput);
    const pending = await ctx.memory.store.proposals.listPending();

    const [proposal] = pending;

    invariant(proposal);

    const shortID = buildShortIDFromUUID(proposal.proposalID);

    const listed = await call('memory.pending', {});
    const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

    expect(written.structuredContent).toMatchObject({ status: 'proposed', proposalID: shortID });
    expect(parseFencedResult(listed)).toMatchObject({ proposals: [{ proposalID: shortID }] });

    expect(entries.find((entry) => entry.record.kind === 'tool_result')?.record).toMatchObject({
      erasable: {
        status: 'readable',
        fields: { hidden: { uuids: { [shortID]: proposal.proposalID } } },
      },
    });
  },
);

test("it saves a task's memory from the user's message on the conversation's thread with no proposal", async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: "I'm allergic to hazelnuts",
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const outcome = await ctx.rememberAsTask(
    { eventID: `#${String(sequence)}` },
    { thread: 'task-4', logThread: 'conversation' },
  );

  invariant(outcome.status === 'ok' && typeof outcome.result['itemID'] === 'string');

  const row = await ctx.memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .innerJoin('memory_items', 'memory_items.item_id', 'memory_versions.item_id')
    .select(['memory_versions.item_id as item_id', 'origin', 'task_id'])
    .where('memory_items.short_id', '=', outcome.result['itemID'])
    .executeTakeFirstOrThrow();

  const [added, ...others] = await readRecords(ctx.memory.log, {
    afterSequence: sequence,
    kinds: ['memory.version_added'],
  });

  const notices = await ctx.memory.store.readNotices('task-4');
  const kinds = await ctx.readRecordKinds(sequence);

  expect(outcome.result).toStrictEqual({
    status: 'applied',
    itemID: expect.toBeString(),
    version: 1,
  });

  const pending = await ctx.memory.store.proposals.listPending();

  expect(row).toStrictEqual({ item_id: expect.any(String), origin: 'task', task_id: 'task-4' });
  expect(added?.record.payload).toMatchObject({ itemID: row.item_id, version: 1 });
  expect(pending).toStrictEqual([]);
  expect(kinds).toContain('memory.version_added');
  expect(kinds).not.toContain('memory.proposed');

  invariant(added);

  expect(others).toStrictEqual([]);

  expect(notices).toStrictEqual([
    {
      noticeKey: expect.toStartWith('run/'),
      thread: 'task-4',
      remembered: 1,
      retired: 0,
      proposed: 0,
      entries: [
        {
          itemID: row.item_id,
          change: 'created',
          version: 1,
          proposalID: null,
          sequence: added.record.sequence,
        },
      ],
    },
  ]);
});

test("it saves nothing of a granted task's save that fails inside its write transaction", async () => {
  const gate = { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) };

  const message = {
    thread: 'conversation',
    text: "I'm allergic to hazelnuts",
    spans: [{ start: 0, end: 25, source: 'typed' as const }],
  };

  // The last definitions read of a save runs inside the write transaction, after the version
  // record landed. A first save counts the reads.
  const counted = { reads: 0 };

  const dry = await setupTest({
    gate,
    definitions: () => {
      counted.reads += 1;

      return { snapshotHash: 'sha256:test' };
    },
  });

  const dryEvent = await writeOwnerMessageRecord(dry.memory.log, message);

  await dry.rememberAsTask(
    { eventID: `#${String(dryEvent)}` },
    { thread: 'task-4', logThread: 'conversation' },
  );

  const attempt = { reads: 0 };

  const ctx = await setupTest({
    gate,
    definitions: () => {
      attempt.reads += 1;

      if (attempt.reads === counted.reads) {
        throw new Error('the definitions read failed');
      }

      return { snapshotHash: 'sha256:test' };
    },
  });

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, message);

  const save = ctx.rememberAsTask(
    { eventID: `#${String(sequence)}` },
    { thread: 'task-4', logThread: 'conversation' },
  );

  const [settled] = await Promise.allSettled([save]);

  const versions = await ctx.memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select('item_id')
    .execute();

  const kinds = await ctx.readRecordKinds(sequence);
  const notices = await ctx.memory.store.readNotices('task-4');

  expect(settled?.status).toBe('rejected');
  expect(attempt.reads).toBe(counted.reads);
  expect(versions).toStrictEqual([]);
  expect(kinds).not.toContain('memory.version_added');
  expect(notices).toStrictEqual([]);
});

test('it proposes a granted task save the checker does not assert, with one proposal record', async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'unsure' })) },
  });

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: "I'm allergic to hazelnuts",
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const outcome = await ctx.rememberAsTask(
    { eventID: `#${String(sequence)}` },
    { thread: 'task-4', logThread: 'conversation' },
  );

  const kinds = await ctx.readRecordKinds(sequence);

  invariant(outcome.status === 'ok');

  expect(outcome.result).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    merged: false,
    reason: expect.toStartWith('checker_unsure:'),
  });

  expect(kinds.filter((kind) => kind === 'memory.proposed')).toHaveLength(1);
  expect(kinds).not.toContain('memory.version_added');
});

test("it proposes a granted task save that cites a reply on the conversation's thread as not typed", async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  const sequence = await writeModelReplyRecord(ctx.memory.log, {
    thread: 'conversation',
    text: "I'm allergic to hazelnuts",
  });

  const outcome = await ctx.rememberAsTask(
    { eventID: `#${String(sequence)}` },
    { thread: 'task-4', logThread: 'conversation' },
  );

  invariant(outcome.status === 'ok');

  expect(outcome.result).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    merged: false,
    reason: expect.toStartWith('quote_not_typed:'),
  });
});

test('it proposes a granted task save that cites an event on a third thread as no quote', async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'task-9',
    text: "I'm allergic to hazelnuts",
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const outcome = await ctx.rememberAsTask(
    { eventID: `#${String(sequence)}` },
    { thread: 'task-4', logThread: 'conversation' },
  );

  invariant(outcome.status === 'ok');

  expect(outcome.result).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    merged: false,
    reason: expect.toStartWith('no_quote:'),
  });
});

test("it searches only the task's own thread for a granted task quote with no event ID", async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: "I'm allergic to hazelnuts",
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const outcome = await ctx.rememberAsTask({}, { thread: 'task-4', logThread: 'conversation' });

  invariant(outcome.status === 'ok');

  expect(outcome.result).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    merged: false,
    reason: expect.toStartWith('no_quote:'),
  });
});

test('it proposes a granted task save whose cited message backed an item the user forgot', async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: "I'm allergic to hazelnuts",
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const forgotten = await ctx.memory.store.remember({
    text: 'Allergic to nuts',
    evidenceQuote: "I'm allergic to hazelnuts",
    evidence: { recordSequence: sequence, start: 0, end: 25 },
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.forget({ target: forgotten, provenance: buildMockProvenance() });

  const outcome = await ctx.rememberAsTask(
    { eventID: `#${String(sequence)}` },
    { thread: 'task-4', logThread: 'conversation' },
  );

  invariant(outcome.status === 'ok');

  expect(outcome.result).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    merged: false,
    reason: expect.toStartWith('forgotten_evidence:'),
  });
});

test("it proposes a save from a run whose log thread is the task's own that cites the conversation's event", async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: "I'm allergic to hazelnuts",
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const outcome = await ctx.rememberAsTask(
    { eventID: `#${String(sequence)}` },
    { thread: 'task-4', logThread: 'task-4' },
  );

  invariant(outcome.status === 'ok');

  expect(outcome.result).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    merged: false,
    reason: expect.toStartWith('no_quote:'),
  });
});

test("it proposes a save in a step run after the grant left the task's setup, which the runner builds with the task's own log thread", async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: "I'm allergic to hazelnuts",
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const stepRun = { thread: 'task-4', logThread: 'task-4' };
  const eventID = `#${String(sequence)}`;

  const outcome = await ctx.rememberAsTask({ eventID }, stepRun);

  invariant(outcome.status === 'ok');

  expect(outcome.result).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    merged: false,
    reason: expect.toStartWith('no_quote:'),
  });
});

test.each([
  'memory.remember',
  'memory.edit',
  'memory.retire',
  'memory.pin',
  'memory.unpin',
] as const)('it describes %s with its allow rule sentence and never says always', async (name) => {
  const ctx = await setupTest();

  const description = ctx.registry.findTool(name)?.definition.description;

  expect(description).not.toMatch(/\balways\b/iu);
  expect(description).toInclude('allow rule');
});

test.each<{ by: string; rule: Omit<Rule, 'id'> }>([
  { by: 'tool name', rule: { outcome: 'allow', tools: ['memory.edit', 'memory.pin'] } },
  { by: 'the memory_write effect', rule: { outcome: 'allow', effects: ['memory_write'] } },
])('it applies a label-only edit at once under an allow rule by $by', async (testCase) => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps a kettlebell by the door',
    labels: { gist: 'kettlebell', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const decide = ctx.buildStarterDecisionPoint({
    extraRules: [
      { id: 'allow-memory', revision: 2, rule: { id: 'allow-memory', ...testCase.rule } },
    ],
  });

  const result = await ctx.callTool(
    'memory.edit',
    { itemID: shortID, version: 1, gist: 'kettlebell by the door' },
    decide,
  );

  const labels = await ctx.memory.store.writes.readItemLabels(item.itemID);
  const pending = await ctx.memory.store.proposals.listPending();

  expect(result.structuredContent).toStrictEqual({
    status: 'applied',
    itemID: shortID,
    version: 2,
  });

  expect(labels.gist).toBe('kettlebell by the door');
  expect(pending).toStrictEqual([]);
});

test.each<{ by: string; rule: Omit<Rule, 'id'> }>([
  { by: 'tool name', rule: { outcome: 'allow', tools: ['memory.edit', 'memory.pin'] } },
  { by: 'the memory_write effect', rule: { outcome: 'allow', effects: ['memory_write'] } },
])('it applies a pin at once under an allow rule by $by', async (testCase) => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps a kettlebell by the door',
    provenance: buildMockProvenance(),
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const decide = ctx.buildStarterDecisionPoint({
    extraRules: [
      { id: 'allow-memory', revision: 2, rule: { id: 'allow-memory', ...testCase.rule } },
    ],
  });

  const result = await ctx.callTool('memory.pin', { itemID: shortID, version: 1 }, decide);
  const core = await ctx.memory.store.readPinnedCore();
  const pending = await ctx.memory.store.proposals.listPending();

  expect(result.structuredContent).toStrictEqual({
    status: 'applied',
    itemID: shortID,
    version: 1,
  });

  expect(core).toMatchObject([{ itemID: item.itemID }]);
  expect(pending).toStrictEqual([]);
});

test('it leaves a label-only edit a proposal under the starter rules', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps a kettlebell by the door',
    labels: { gist: 'kettlebell', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await ctx.callTool(
    'memory.edit',
    { itemID: shortID, version: 1, gist: 'kettlebell by the door' },
    ctx.buildStarterDecisionPoint(),
  );

  expect(result.structuredContent).toMatchObject({
    status: 'proposed',
    reason: expect.stringMatching(/^labels: /u),
  });
});

test('it leaves a pin a proposal under the starter rules', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps a kettlebell by the door',
    provenance: buildMockProvenance(),
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await ctx.callTool(
    'memory.pin',
    { itemID: shortID, version: 1 },
    ctx.buildStarterDecisionPoint(),
  );

  expect(result.structuredContent).toMatchObject({
    status: 'proposed',
    reason: expect.stringMatching(/^pinned: /u),
  });
});

test('it leaves a pin a proposal when the snapshot still declares the pin as a note', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps a kettlebell by the door',
    provenance: buildMockProvenance(),
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const noteDeclaration: EffectDeclaration = {
    effects: ['note'],
    destinations: [],
    amount: null,
    content: [],
    results: {},
  };

  const result = await ctx.callTool(
    'memory.pin',
    { itemID: shortID, version: 1 },
    ctx.buildSnapshotDecisionPoint(new Map([['memory.pin', noteDeclaration]])),
  );

  expect(result.structuredContent).toMatchObject({
    status: 'proposed',
    reason: expect.stringMatching(/^pinned: /u),
  });
});

test('it denies a pin before the tool runs under a deny rule on the tool', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps a kettlebell by the door',
    provenance: buildMockProvenance(),
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const decide = ctx.buildStarterDecisionPoint({
    extraRules: [
      {
        id: 'deny-pins',
        revision: 2,
        rule: { id: 'deny-pins', outcome: 'deny', tools: ['memory.pin'] },
      },
    ],
  });

  const result = await ctx.callTool('memory.pin', { itemID: shortID, version: 1 }, decide);
  const core = await ctx.memory.store.readPinnedCore();

  expect(result.isError).toBeTrue();
  expect(core).toStrictEqual([]);
});

test('it still applies an unpin at once under the starter rules', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps a kettlebell by the door',
    isPinned: true,
    provenance: buildMockProvenance(),
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await ctx.callTool(
    'memory.unpin',
    { itemID: shortID },
    ctx.buildStarterDecisionPoint(),
  );

  const core = await ctx.memory.store.readPinnedCore();

  expect(result.structuredContent).toStrictEqual({
    status: 'applied',
    itemID: shortID,
    version: 1,
  });

  expect(core).toStrictEqual([]);
});

test('it proposes a self-note of 5,000 characters with no rule, and saves it whole when the owner approves', async () => {
  const ctx = await setupTest();

  const text = 'I like the quiet before the kettle boils. '.repeat(120).slice(0, 5000);

  await ctx.callTool(
    'memory.remember',
    { gist: 'a gist', topic: 'a topic', text, subject: 'self' },
    buildAllowingDecisionPoint(),
  );

  const [proposal] = await ctx.memory.store.proposals.listPending();

  invariant(proposal, 'the self-note left no proposal');

  const approval = await ctx.memory.store.proposals.approve({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'host',
  });

  const itemID = z.object({ itemID: z.string() }).parse(approval).itemID;

  const recalled = await ctx.memory.store.recall({ itemIDs: [itemID] });

  expect(proposal.text).toBe(text);
  expect(recalled.items.map((item) => item.text)).toStrictEqual([text]);
});

test('it saves a self-note proposal whole when the owner approves it edited to 5,000 characters', async () => {
  const ctx = await setupTest();

  await ctx.callTool(
    'memory.remember',
    {
      gist: 'a gist',
      topic: 'a topic',
      text: 'I like the quiet before the kettle boils.',
      subject: 'self',
    },
    buildAllowingDecisionPoint(),
  );

  const [proposal] = await ctx.memory.store.proposals.listPending();

  invariant(proposal, 'the self-note left no proposal');

  const editedText = 'I like the quiet before the kettle boils, and the first light. '
    .repeat(80)
    .slice(0, 5000);

  const approval = await ctx.memory.store.proposals.approve({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'host',
    editedText,
  });

  const itemID = z.object({ itemID: z.string() }).parse(approval).itemID;

  const recalled = await ctx.memory.store.recall({ itemIDs: [itemID] });

  expect(recalled.items.map((item) => item.text)).toStrictEqual([editedText]);
});

test('it refuses a self-note proposal edited to 6,001 characters on approval, and leaves it pending', async () => {
  const ctx = await setupTest();

  await ctx.callTool(
    'memory.remember',
    {
      gist: 'a gist',
      topic: 'a topic',
      text: 'I like the quiet before the kettle boils.',
      subject: 'self',
    },
    buildAllowingDecisionPoint(),
  );

  const [proposal] = await ctx.memory.store.proposals.listPending();

  invariant(proposal, 'the self-note left no proposal');

  const approval = ctx.memory.store.proposals.approve({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'host',
    editedText: 'I like the quiet before the kettle boils, and the first light. '
      .repeat(100)
      .slice(0, 6001),
  });

  await approval.catch(() => {});

  const pending = await ctx.memory.store.proposals.listPending();

  expect(approval).rejects.toThrowWithMessage(
    Error,
    'data/text is 6,001 characters, 1 over the 6,000 limit',
  );

  expect(pending).toHaveLength(1);
});

test('it saves a self-note of 5,000 characters whole under an allow rule', async () => {
  const ctx = await setupTest();

  const text = 'I like the quiet before the kettle boils. '.repeat(120).slice(0, 5000);

  const result = await ctx.callTool(
    'memory.remember',
    { gist: 'a gist', topic: 'a topic', text, subject: 'self' },
    buildAllowingDecisionPoint({
      allowing: [
        { id: 'rule-self', revision: 1, checks: [{ arg: 'subject', op: 'eq', value: 'self' }] },
      ],
    }),
  );

  const shortID = z.object({ itemID: z.string() }).parse(result.structuredContent).itemID;

  const itemIDs = await ctx.memory.store.readItemIDMap([shortID]);
  const recalled = await ctx.memory.store.recall({ itemIDs: [...itemIDs.values()] });

  expect(result.structuredContent).toStrictEqual({
    status: 'applied',
    itemID: shortID,
    version: 1,
  });

  expect(recalled.items.map((item) => item.text)).toStrictEqual([text]);
});

test.each([
  {
    subject: 'self',
    length: 6001,
    error:
      'data/text is 6,001 characters, 1 over the 6,000 limit; for longer text, write a note with notebook.write',
  },
  {
    subject: 'owner',
    length: 2001,
    error:
      'data/text is 2,001 characters, 1 over the 2,000 limit; for longer text, write a note with notebook.write',
  },
  {
    subject: 'owner',
    length: 6001,
    error:
      'data/text is 6,001 characters, 4,001 over the 2,000 limit; for longer text, write a note with notebook.write',
  },
  {
    subject: 'shared',
    length: 2001,
    error:
      'data/text is 2,001 characters, 1 over the 2,000 limit; for longer text, write a note with notebook.write',
  },
])(
  'it refuses a remember of a $subject note of $length characters with how far over its limit it runs',
  async (row) => {
    const ctx = await setupTest();

    const result = await ctx.callTool(
      'memory.remember',
      { gist: 'a gist', topic: 'a topic', text: 'b'.repeat(row.length), subject: row.subject },
      buildAllowingDecisionPoint({ allowing: [{ id: 'rule-all', revision: 1, checks: [] }] }),
    );

    const pending = await ctx.memory.store.proposals.listPending();

    expect(result).toStrictEqual({ content: [{ type: 'text', text: row.error }], isError: true });
    expect(pending).toStrictEqual([]);
  },
);

test('it refuses a remember of 2,001 characters that names no subject with the 2,000 limit', async () => {
  const ctx = await setupTest();

  const result = await ctx.callTool(
    'memory.remember',
    { gist: 'a gist', topic: 'a topic', text: 'b'.repeat(2001) },
    buildAllowingDecisionPoint({ allowing: [{ id: 'rule-all', revision: 1, checks: [] }] }),
  );

  expect(result).toStrictEqual({
    content: [
      {
        type: 'text',
        text: 'data/text is 2,001 characters, 1 over the 2,000 limit; for longer text, write a note with notebook.write',
      },
    ],
    isError: true,
  });
});

test.each([
  { name: 'a self-note that keeps its subject', from: 'self', change: {}, length: 5000 },
  { name: 'an owner item moved to self', from: 'owner', change: { subject: 'self' }, length: 5000 },
] as const)(
  'it applies an edit of $name to $length characters under an allow rule',
  async (row) => {
    const ctx = await setupTest();

    const item = await ctx.memory.store.remember({
      text: 'Hums while the kettle boils',
      subject: row.from,
      provenance: buildMockProvenance(),
    });

    const shortID = await readItemShortID(ctx.memory.log, item.itemID);

    const result = await ctx.callTool(
      'memory.edit',
      { itemID: shortID, version: 1, text: 'c'.repeat(row.length), ...row.change },
      buildAllowingDecisionPoint({
        allowing: [
          { id: 'rule-self', revision: 1, checks: [{ arg: 'subject', op: 'eq', value: 'self' }] },
        ],
      }),
    );

    expect(result.structuredContent).toStrictEqual({
      status: 'applied',
      itemID: shortID,
      version: 2,
    });
  },
);

test.each([
  {
    name: 'a self-note that keeps its subject',
    from: 'self',
    change: {},
    length: 6001,
    error:
      'data/text is 6,001 characters, 1 over the 6,000 limit; for longer text, write a note with notebook.write',
  },
  {
    name: 'an owner item that keeps its subject',
    from: 'owner',
    change: {},
    length: 2001,
    error:
      'data/text is 2,001 characters, 1 over the 2,000 limit; for longer text, write a note with notebook.write',
  },
  {
    name: 'an owner item that keeps its subject',
    from: 'owner',
    change: {},
    length: 6001,
    error:
      'data/text is 6,001 characters, 4,001 over the 2,000 limit; for longer text, write a note with notebook.write',
  },
  {
    name: 'a self-note moved to owner',
    from: 'self',
    change: { subject: 'owner' },
    length: 2001,
    error:
      'data/text is 2,001 characters, 1 over the 2,000 limit; for longer text, write a note with notebook.write',
  },
] as const)(
  'it refuses an edit of $name to $length characters with the limit of the subject it ends with',
  async (row) => {
    const ctx = await setupTest();

    const item = await ctx.memory.store.remember({
      text: 'Hums while the kettle boils',
      subject: row.from,
      provenance: buildMockProvenance(),
    });

    const shortID = await readItemShortID(ctx.memory.log, item.itemID);

    const result = await ctx.callTool(
      'memory.edit',
      { itemID: shortID, version: 1, text: 'c'.repeat(row.length), ...row.change },
      buildAllowingDecisionPoint({ allowing: [{ id: 'rule-all', revision: 1, checks: [] }] }),
    );

    const history = await ctx.memory.store.readHistory(item.itemID);

    expect(result).toStrictEqual({ content: [{ type: 'text', text: row.error }], isError: true });
    expect(history?.versions).toHaveLength(1);
  },
);
