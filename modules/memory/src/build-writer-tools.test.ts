import { expect, test } from 'bun:test';
import { buildToolRegistry } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildWriterTools } from './build-writer-tools';
import { createWriterStaging } from './create-writer-staging';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  const staging = createWriterStaging();
  const registry = buildToolRegistry(buildWriterTools(memory.store, staging, 5));

  return { memory, staging, registry };
}

test('it declares read for recall and note for remember, edit, retire and the flag', async () => {
  const ctx = await setupTest();

  const effects = [
    'memory.recall',
    'memory.remember',
    'memory.edit',
    'memory.retire',
    'memory.flag-self-note',
  ].map((name) => [name, ctx.registry.findTool(name)?.definition.declaration.effects]);

  expect(effects).toStrictEqual([
    ['memory.recall', ['read']],
    ['memory.remember', ['note']],
    ['memory.edit', ['note']],
    ['memory.retire', ['note']],
    ['memory.flag-self-note', ['note']],
  ]);
});

test('it takes the subject owner or shared and an end time on remember and edit, and neither on retire or the flag', async () => {
  const ctx = await setupTest();

  const inputs = ['memory.remember', 'memory.edit', 'memory.retire', 'memory.flag-self-note'].map(
    (name) => {
      const input = ctx.registry.findTool(name)?.definition.input;

      return [name, Object.keys(input?.['properties'] ?? {}), input?.['additionalProperties']];
    },
  );

  expect(inputs).toStrictEqual([
    ['memory.remember', ['subject', 'text', 'quote', 'sourceID', 'until', 'isSensitive'], false],
    ['memory.edit', ['itemID', 'subject', 'text', 'quote', 'sourceID', 'until'], false],
    ['memory.retire', ['itemID', 'quote', 'sourceID'], false],
    ['memory.flag-self-note', ['text', 'sourceID'], false],
  ]);
});

test.each([
  ['memory.remember', { subject: 'self', text: 'Likes puns', quote: 'puns', sourceID: 1 }],
  [
    'memory.edit',
    { itemID: 'item-a', subject: 'self', text: 'Likes puns', quote: 'puns', sourceID: 1 },
  ],
])(
  'it refuses the subject self on %s, so the note-taker never writes a self-note',
  async (name, input) => {
    const ctx = await setupTest();

    const check = ctx.registry.findTool(name)?.parseInput(input);

    expect(check).toMatchObject({ isValid: false });
  },
);

test.each([
  ['memory.remember', 'a time with a UTC offset', { until: '2026-10-25T23:59:59+01:00' }, true],
  ['memory.remember', 'a time in UTC', { until: '2026-10-25T22:59:59Z' }, true],
  ['memory.remember', 'a date with no time', { until: '2026-10-25' }, false],
  ['memory.remember', 'a time with no offset', { until: '2026-10-25T23:59:59' }, false],
  ['memory.remember', 'null', { until: null }, false],
  ['memory.edit', 'null', { itemID: 'item-a', until: null }, true],
])('it judges an end time on %s given as %s', async (name, _label, extra, isValid) => {
  const ctx = await setupTest();

  const check = ctx.registry.findTool(name)?.parseInput({
    subject: 'owner',
    text: 'Is in Lisbon this week',
    quote: 'in Lisbon this week',
    sourceID: 1,
    ...extra,
  });

  expect(check?.isValid).toBe(isValid);
});

test.each([
  ['memory.remember', 'owner', { text: 'Keeps bees', quote: 'bees', sourceID: 1 }],
  ['memory.remember', 'shared', { text: 'Keeps bees', quote: 'bees', sourceID: 1 }],
  ['memory.edit', 'owner', { itemID: 'item-a', text: 'Keeps bees', quote: 'bees', sourceID: 1 }],
  ['memory.edit', 'shared', { itemID: 'item-a', text: 'Keeps bees', quote: 'bees', sourceID: 1 }],
])('it accepts %s with the subject %s', async (name, subject, input) => {
  const ctx = await setupTest();

  const check = ctx.registry.findTool(name)?.parseInput({ ...input, subject });

  expect(check).toStrictEqual({ isValid: true });
});

test('it stages a new item that cites your message in the batch, with its subject', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.remember');

  invariant(tool);

  const staged = ctx.staging.open({
    sources: new Map([
      [
        12,
        {
          sequence: 12,
          text: 'I keep bees on the roof.',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: { subject: 'owner', text: 'You keep bees.', quote: 'I keep bees', sourceID: 12 },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'memory-writer',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({ status: 'ok', result: { staged: true } });

  expect(staged.close()).toStrictEqual([
    {
      op: 'remember',
      subject: 'owner',
      text: 'You keep bees.',
      quote: 'I keep bees',
      sourceSequence: 12,
      target: null,
    },
  ]);
});

test('it stages a new item marked sensitive when the call asks', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.remember');

  invariant(tool);

  const staged = ctx.staging.open({
    sources: new Map([
      [
        12,
        {
          sequence: 12,
          text: 'My new number is 0400 118 552.',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: {
        subject: 'owner',
        text: 'The owner can be reached on 0400 118 552.',
        quote: 'My new number is 0400 118 552',
        sourceID: 12,
        isSensitive: true,
      },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'memory-writer',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(staged.close()).toStrictEqual([
    {
      op: 'remember',
      subject: 'owner',
      text: 'The owner can be reached on 0400 118 552.',
      quote: 'My new number is 0400 118 552',
      sourceSequence: 12,
      target: null,
      isSensitive: true,
    },
  ]);
});

test('it returns a write that cites a message outside the batch to the model as an error', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.remember');

  invariant(tool);

  ctx.staging.open({
    sources: new Map([
      [
        12,
        {
          sequence: 12,
          text: 'I keep bees on the roof.',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: { subject: 'owner', text: 'You keep bees.', quote: 'I keep bees', sourceID: 40 },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'memory-writer',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: "sourceID 40 is not one of the owner's messages in this batch",
  });
});

test('it stages a new item with its end time as a time in UTC', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.remember');

  invariant(tool);

  const staged = ctx.staging.open({
    sources: new Map([
      [
        12,
        {
          sequence: 12,
          text: "I'm in Lisbon this week",
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: 'Europe/Lisbon',
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: {
        subject: 'owner',
        text: 'You are in Lisbon this week.',
        quote: "I'm in Lisbon this week",
        sourceID: 12,
        until: '2026-10-25T23:59:59+00:00',
      },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'memory-writer',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(staged.close()).toMatchObject([{ until: Date.parse('2026-10-25T23:59:59Z') }]);
});

test('it returns an end time that names no real day to the model as an error', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.edit');

  invariant(tool);

  const staged = ctx.staging.open({
    sources: new Map([
      [
        12,
        {
          sequence: 12,
          text: 'Back on the 31st',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map([['item-trip', { version: 1, subject: 'owner' }]]),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.edit',
      input: {
        itemID: 'item-trip',
        subject: 'owner',
        text: 'You are away until the 31st.',
        quote: 'Back on the 31st',
        sourceID: 12,
        until: '2026-11-31T23:59:59+00:00',
      },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'memory-writer',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'until 2026-11-31T23:59:59+00:00 is not a real ISO time with an offset, such as 2026-10-19T23:59:59+01:00',
  });

  expect(staged.close()).toStrictEqual([]);
});

test('it stages a retirement bound to the version the session was shown', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.retire');

  invariant(tool);

  const staged = ctx.staging.open({
    sources: new Map([
      [
        12,
        {
          sequence: 12,
          text: 'I gave the bees away.',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map([['item-bees', { version: 3, subject: 'owner' }]]),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.retire',
      input: { itemID: 'item-bees', quote: 'I gave the bees away', sourceID: 12 },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'memory-writer',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(staged.close()).toStrictEqual([
    {
      op: 'retire',
      quote: 'I gave the bees away',
      sourceSequence: 12,
      target: { itemID: 'item-bees', version: 3 },
    },
  ]);
});

test('it delivers the items a recall finds with their subjects, and never a self-note', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.recall');

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the roof',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'I like the bees on the roof',
    subject: 'self',
    provenance: {
      origin: 'conversation',
      source: 'owner',
      taskID: null,
      proposalID: null,
      checks: null,
    },
  });

  invariant(tool);

  const outcome = await tool.definition.run(
    { callID: 'call-1', tool: 'memory.recall', input: { query: 'bees' }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'memory-writer',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { items: [{ itemID: item.itemID, subject: 'owner', text: 'Keeps bees on the roof' }] },
  });
});

test('it binds an edit to the version a recall showed', async () => {
  const ctx = await setupTest();

  const recall = ctx.registry.findTool('memory.recall');
  const edit = ctx.registry.findTool('memory.edit');

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the roof',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  invariant(recall && edit);

  const staged = ctx.staging.open({
    sources: new Map([
      [
        12,
        {
          sequence: 12,
          text: 'The bees are in the garden now.',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  const run = {
    runID: 'run-1',
    thread: 'memory-writer',
    tools: [],
    model: { model: 'm', profile: 'p' },
  };

  await recall.definition.run(
    { callID: 'call-1', tool: 'memory.recall', input: { query: 'bees' }, toolUseID: null },
    { run },
  );

  await edit.definition.run(
    {
      callID: 'call-2',
      tool: 'memory.edit',
      input: {
        itemID: item.itemID,
        subject: 'owner',
        text: 'Keeps bees in the garden',
        quote: 'in the garden',
        sourceID: 12,
      },
      toolUseID: null,
    },
    { run },
  );

  expect(staged.close()).toMatchObject([{ target: { itemID: item.itemID, version: 1 } }]);
});

test('it returns an edit of an item the session was never shown to the model as an error', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.edit');

  invariant(tool);

  ctx.staging.open({
    sources: new Map([
      [
        12,
        {
          sequence: 12,
          text: 'The bees are in the garden now.',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.edit',
      input: {
        itemID: 'item-bees',
        subject: 'owner',
        text: 'Keeps bees in the garden',
        quote: 'in the garden',
        sourceID: 12,
      },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'memory-writer',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'item item-bees is not one you were shown; find it with memory.recall first',
  });
});

test('it stages a flag of a possible self-note, which writes no item', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.flag-self-note');

  invariant(tool);

  const staged = ctx.staging.open({
    sources: new Map([
      [
        12,
        {
          sequence: 12,
          text: 'You always pick the jazz station.',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.flag-self-note',
      input: { text: 'The assistant favours the jazz station.', sourceID: 12 },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'memory-writer',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({ status: 'ok', result: { staged: true } });

  expect(staged.readFlags()).toStrictEqual([
    { text: 'The assistant favours the jazz station.', sourceSequence: 12 },
  ]);

  expect(staged.close()).toStrictEqual([]);
});

test('it returns a flag that cites a message outside the batch to the model as an error', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.flag-self-note');

  invariant(tool);

  ctx.staging.open({
    sources: new Map([
      [
        12,
        {
          sequence: 12,
          text: 'You always pick the jazz station.',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.flag-self-note',
      input: { text: 'The assistant favours the jazz station.', sourceID: 40 },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'memory-writer',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: "sourceID 40 is not one of the owner's messages in this batch",
  });
});

test.each([
  [
    'a remember with an itemID',
    'memory.remember',
    { subject: 'owner', text: 'x', quote: 'x', sourceID: 1, itemID: 'item-a' },
  ],
  ['a remember with no sourceID', 'memory.remember', { subject: 'owner', text: 'x', quote: 'x' }],
  ['a remember with no subject', 'memory.remember', { text: 'x', quote: 'x', sourceID: 1 }],
  [
    'an edit with no itemID',
    'memory.edit',
    { subject: 'owner', text: 'x', quote: 'x', sourceID: 1 },
  ],
  [
    'an edit with no quote',
    'memory.edit',
    { itemID: 'item-a', subject: 'owner', text: 'x', sourceID: 1 },
  ],
  [
    'an edit with no subject',
    'memory.edit',
    { itemID: 'item-a', text: 'x', quote: 'x', sourceID: 1 },
  ],
  [
    'an edit with a version',
    'memory.edit',
    { itemID: 'item-a', version: 1, subject: 'owner', text: 'x', quote: 'x', sourceID: 1 },
  ],
  ['a flag with a subject', 'memory.flag-self-note', { subject: 'self', text: 'x', sourceID: 1 }],
  ['a flag with no sourceID', 'memory.flag-self-note', { text: 'x' }],
])('it refuses %s', async (_label, name, input) => {
  const ctx = await setupTest();

  const check = ctx.registry.findTool(name)?.parseInput(input);

  expect(check).toMatchObject({ isValid: false });
});
