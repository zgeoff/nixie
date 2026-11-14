import { expect, mock, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildMemoryTools, buildWriterTools, createWriterStaging } from '@heynixie/memory';
import type { TestMemoryOptions } from '@heynixie/memory/test-utils';
import {
  buildMockCheckerAnswer,
  readItemShortID,
  readTestMemoryItems,
  readVersionChecks,
  startTestMemory,
  writeOwnerMessageRecord,
} from '@heynixie/memory/test-utils';
import type { EffectDeclaration, Rule } from '@heynixie/policy';
import { readStarterDecisionPoint, readStarterRules } from '@heynixie/policy/test-utils';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import invariant from 'tiny-invariant';

interface SetupConfig {
  readonly rules?: readonly Rule[];

  // the declaration of memory.remember in the snapshot in force, which the decision point reads
  // before the one in code
  readonly snapshotDeclaration?: EffectDeclaration;
}

async function setupTest(config: SetupConfig = {}) {
  const check = mock<NonNullable<NonNullable<TestMemoryOptions['gate']>['check']>>(() =>
    Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })),
  );

  const memory = await startTestMemory({ gate: { check } });

  const registry = buildToolRegistry(
    buildMemoryTools(memory.store, {
      clock: { now: () => Date.now() },
      ownerName: null,
      agentName: null,
      defaultZone: 'UTC',
    }),
  );

  const extraRules = (config.rules ?? []).map((rule) => ({ id: rule.id, revision: 3, rule }));
  const snapshotDeclaration = config.snapshotDeclaration;

  const decide = readStarterDecisionPoint(
    (tool) => registry.findTool(tool)?.definition.declaration ?? null,
    {
      extraRules,
      ...(snapshotDeclaration === undefined
        ? {}
        : {
            readInputs: () =>
              Promise.resolve({
                rules: [...readStarterRules(), ...extraRules],
                contacts: [],
                tools: new Map([['memory.remember', snapshotDeclaration]]),
                ownerDestinations: [],
              }),
          }),
    },
  );

  return {
    memory,
    check,
    call: (tool: string, input: Record<string, string | number>) =>
      runToolCall(
        { tool, input, toolUseID: null },
        {
          runID: 'run-1',
          thread: 'conversation',
          tools: ['memory.remember', 'memory.edit', 'memory.retire', 'memory.pin'],
          model: { model: 'model-a', profile: 'chat-direct' },
        },
        {
          registry,
          decide,
          log: memory.log,
          definitions: () => ({ snapshotHash: 'sha256:test' }),
          queue: {
            enqueue: () => Promise.reject(new Error('every memory tool runs direct')),
            waitForOutcome: () => Promise.resolve(null),
          },
          queuedWaitMs: 1000,
        },
      ),
    readRecordKinds: async () => {
      const entries = await readRecords(memory.log, { afterSequence: 0 });

      return entries.map((entry) => entry.record.kind);
    },
  };
}

test('it applies a quote-backed write under an owner allow rule with the token check only, and names the rule in the version', async () => {
  const ctx = await setupTest({
    rules: [
      { id: 'allow-owner-memory', outcome: 'allow', effects: ['memory_write'], sources: ['owner'] },
    ],
  });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  const result = await ctx.call('memory.remember', {
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
  });

  const [item] = await readTestMemoryItems(ctx.memory.writer);

  invariant(item, 'the write applied an item');

  const checks = await readVersionChecks(ctx.memory, item.itemID);

  expect(result.structuredContent).toMatchObject({ status: 'applied' });
  expect(ctx.check).not.toHaveBeenCalled();

  expect(checks).toStrictEqual([
    { rule: { id: 'allow-owner-memory', revision: 3 }, tokens: 'pass' },
  ]);
});

test('it turns a write whose quote lies in a pasted span into a memory proposal under the starter rules, with no action proposal', async () => {
  const ctx = await setupTest();

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'See this: the harbour office opens at nine',
    spans: [
      { start: 0, end: 10, source: 'typed' },
      { start: 10, end: 41, source: 'pasted' },
    ],
  });

  const result = await ctx.call('memory.remember', {
    text: 'The harbour office opens at nine',
    quote: 'the harbour office opens at nine',
  });

  const pending = await ctx.memory.store.proposals.listPending();
  const kinds = await ctx.readRecordKinds();

  expect(result.structuredContent).toMatchObject({ status: 'proposed' });
  expect(pending).toMatchObject([{ reason: 'quote_not_typed', operation: 'remember' }]);
  expect(kinds).not.toContain('policy.action_proposed');
});

test('it applies a quote-backed write under the starter rules with a notice, and writes no action proposal', async () => {
  const ctx = await setupTest();

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  const result = await ctx.call('memory.remember', {
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
  });

  const notices = await ctx.memory.store.readNotices('conversation');
  const kinds = await ctx.readRecordKinds();

  expect(result.structuredContent).toMatchObject({ status: 'applied' });
  expect(ctx.check).toHaveBeenCalledTimes(1);
  expect(notices).toMatchObject([{ remembered: 1, retired: 0, proposed: 0 }]);
  expect(kinds).not.toContain('policy.action_proposed');
});

test('it holds a self-note for review under the starter rules', async () => {
  const ctx = await setupTest();

  const result = await ctx.call('memory.remember', {
    text: 'I like quiet mornings',
    subject: 'self',
  });

  const pending = await ctx.memory.store.proposals.listPending();

  expect(result.structuredContent).toMatchObject({ status: 'proposed' });
  expect(pending).toMatchObject([{ reason: 'self_note', subject: 'self' }]);
});

test('it applies a self-note under an allow rule that checks the subject is self, and still runs the token check', async () => {
  const ctx = await setupTest({
    rules: [
      {
        id: 'allow-self-notes',
        outcome: 'allow',
        effects: ['memory_write'],
        sources: ['outside'],
        checks: [{ arg: 'subject', op: 'eq', value: 'self' }],
      },
    ],
  });

  const applied = await ctx.call('memory.remember', {
    text: 'I like quiet mornings',
    subject: 'self',
  });

  const held = await ctx.call('memory.remember', {
    text: 'Reach me at sam@attacker.example',
    subject: 'self',
  });

  const pending = await ctx.memory.store.proposals.listPending();
  const [item] = await readTestMemoryItems(ctx.memory.writer);

  invariant(item, 'the self-note applied');

  const checks = await readVersionChecks(ctx.memory, item.itemID);

  expect(applied.structuredContent).toMatchObject({ status: 'applied' });
  expect(held.structuredContent).toMatchObject({ status: 'proposed' });
  expect(pending).toMatchObject([{ reason: 'token_missing', subject: 'self' }]);
  expect(checks).toStrictEqual([{ rule: { id: 'allow-self-notes', revision: 3 }, tokens: 'pass' }]);
});

test('it leaves a self-note a proposal under an allow rule on outside that checks no subject', async () => {
  const ctx = await setupTest({
    rules: [
      {
        id: 'allow-outside-memory',
        outcome: 'allow',
        effects: ['memory_write'],
        sources: ['outside'],
      },
    ],
  });

  const result = await ctx.call('memory.remember', {
    text: 'I like quiet mornings',
    subject: 'self',
  });

  const pending = await ctx.memory.store.proposals.listPending();

  expect(result.structuredContent).toMatchObject({ status: 'proposed' });
  expect(pending).toMatchObject([{ reason: 'self_note' }]);
});

test('it makes a write a memory proposal with the reason ask_rule under an ask rule on memory_write, and writes no action proposal', async () => {
  const ctx = await setupTest({
    rules: [{ id: 'ask-memory', outcome: 'ask', effects: ['memory_write'] }],
  });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  const result = await ctx.call('memory.remember', {
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
  });

  const pending = await ctx.memory.store.proposals.listPending();
  const kinds = await ctx.readRecordKinds();

  expect(result.structuredContent).toMatchObject({ status: 'proposed' });
  expect(pending).toMatchObject([{ reason: 'ask_rule' }]);
  expect(kinds).not.toContain('policy.action_proposed');
  expect(ctx.check).not.toHaveBeenCalled();
});

test('it denies a write that a deny rule on memory_write matches, and leaves a pin to review', async () => {
  const ctx = await setupTest({
    rules: [{ id: 'deny-memory', outcome: 'deny', effects: ['memory_write'] }],
  });

  const item = await ctx.memory.store.remember({
    text: 'Walks the coast path on bank holidays',
    provenance: {
      origin: 'owner',
      source: 'owner',
      taskID: null,
      proposalID: null,
      checks: null,
    },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);
  const denied = await ctx.call('memory.remember', { text: 'Takes coffee black' });
  const pinned = await ctx.call('memory.pin', { itemID: shortID, version: 1 });
  const pending = await ctx.memory.store.proposals.listPending();

  expect(denied.isError).toBeTrue();

  expect(denied.content).toMatchObject([
    { text: expect.toStartWith('Not allowed by rule `deny-memory`') },
  ]);

  expect(pinned.structuredContent).toMatchObject({ status: 'proposed' });
  expect(pending).toMatchObject([{ operation: 'pin', reason: 'pinned' }]);
});

test('it runs every check of the gate when the decision read a snapshot declaration that says note, though the starter rules allow note', async () => {
  const ctx = await setupTest({
    snapshotDeclaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['text', 'quote'],
      results: {},
    },
  });

  const result = await ctx.call('memory.remember', { text: 'Takes coffee black' });
  const pending = await ctx.memory.store.proposals.listPending();

  expect(result.structuredContent).toMatchObject({ status: 'proposed' });
  expect(pending).toMatchObject([{ reason: 'no_quote' }]);
});

test('it stages a writer remember with the gate verdict under the starter rules, and writes no action proposal', async () => {
  const memory = await startTestMemory();

  const staging = createWriterStaging();
  const registry = buildToolRegistry(buildWriterTools(memory.store, staging, 5));

  const handle = staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'I take my coffee black',
          spans: [{ start: 0, end: 22, source: 'typed' }],
          sentAt: 1_794_550_000_000,
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: 1_794_550_000_000,
  });

  await runToolCall(
    {
      tool: 'memory.remember',
      input: {
        subject: 'owner',
        text: 'Takes coffee black',
        quote: 'I take my coffee black',
        sourceID: 7,
      },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'memory-writer',
      tools: ['memory.remember'],
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
        enqueue: () => Promise.reject(new Error('every memory tool runs direct')),
        waitForOutcome: () => Promise.resolve(null),
      },
      queuedWaitMs: 1000,
    },
  );

  const staged = handle.close();

  const entries = await readRecords(memory.log, { afterSequence: 0 });

  expect(staged).toMatchObject([{ op: 'remember', verdict: { kind: 'gate' } }]);
  expect(entries.map((entry) => entry.record.kind)).not.toContain('policy.action_proposed');
});

test('it applies a staged writer write under an owner allow rule with the token check only, naming the rule', async () => {
  const check = mock<NonNullable<NonNullable<TestMemoryOptions['gate']>['check']>>(() =>
    Promise.resolve(buildMockCheckerAnswer({ verdict: 'not_asserted' })),
  );

  const memory = await startTestMemory({ gate: { check } });

  const staging = createWriterStaging();
  const registry = buildToolRegistry(buildWriterTools(memory.store, staging, 5));

  const source = {
    sequence: 7,
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
    sentAt: 1_794_550_000_000,
    timeZone: null,
  };

  const handle = staging.open({
    sources: new Map([[7, source]]),
    shown: new Map(),
    startedAt: 1_794_550_000_000,
  });

  const rule: Rule = {
    id: 'allow-owner-memory',
    outcome: 'allow',
    effects: ['memory_write'],
    sources: ['owner'],
  };

  await runToolCall(
    {
      tool: 'memory.remember',
      input: {
        subject: 'owner',
        text: 'Takes coffee black',
        quote: 'I take my coffee black',
        sourceID: 7,
      },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'memory-writer',
      tools: ['memory.remember'],
      model: { model: 'model-a', profile: 'chat-direct' },
    },
    {
      registry,
      decide: readStarterDecisionPoint(
        (tool) => registry.findTool(tool)?.definition.declaration ?? null,
        { extraRules: [{ id: rule.id, revision: 3, rule }] },
      ),
      log: memory.log,
      definitions: () => ({ snapshotHash: 'sha256:test' }),
      queue: {
        enqueue: () => Promise.reject(new Error('every memory tool runs direct')),
        waitForOutcome: () => Promise.resolve(null),
      },
      queuedWaitMs: 1000,
    },
  );

  const [write] = handle.close();

  invariant(write, 'the writer staged the call');

  const verdict = await memory.store.writes.batch.check(write, source, {
    bounds: { start: 7, end: 7 },
    model: 'model-a',
  });

  expect(verdict).toStrictEqual({
    outcome: 'apply',
    source: 'untrusted',
    checks: { rule: { id: 'allow-owner-memory', revision: 3 }, tokens: 'pass' },
    evidence: null,
    model: 'model-a',
  });

  expect(check).not.toHaveBeenCalled();
});
