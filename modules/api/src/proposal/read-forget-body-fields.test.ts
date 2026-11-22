import { expect, test } from 'bun:test';
import { createQuotedProposal, startTestMemory } from '@heynixie/memory/test-utils';
import invariant from 'tiny-invariant';
import { readForgetBodyFields } from './read-forget-body-fields';

async function setupTest() {
  const memory = await startTestMemory();

  const quoted = await createQuotedProposal(memory, {
    message: 'I keep bees on the allotment.',
    text: 'The owner keeps bees.',
    quote: 'I keep bees',
  });

  return { memory, sequence: quoted.recordSequence };
}

test('it shows the kind and the text of the record, with the moments and the memory items that go with it', async () => {
  const ctx = await setupTest();

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: ctx.sequence,
    lastSequence: ctx.sequence,
    title: 'Bees',
  });

  invariant(kept.status === 'written');

  const fields = await readForgetBodyFields(ctx.memory.log, {
    tool: 'log.forget',
    thread: 'conversation',
    input: { record: `#${String(ctx.sequence)}` },
    callSequence: 1,
  });

  expect(fields).toStrictEqual({
    status: 'fields',
    fields: {
      kind: 'owner_message',
      text: 'I keep bees on the allotment.',
      moments: '1',
      'memory items': '1',
    },
  });
});

test('it answers none for a tool that has no extra fields', async () => {
  const ctx = await setupTest();

  const fields = await readForgetBodyFields(ctx.memory.log, {
    tool: 'mail.send',
    thread: 'conversation',
    input: { record: String(ctx.sequence) },
    callSequence: 1,
  });

  expect(fields).toStrictEqual({ status: 'none' });
});

test('it cuts a long text and ends it with an ellipsis', async () => {
  const ctx = await setupTest();

  const long = await createQuotedProposal(ctx.memory, {
    message: `I keep bees ${'on the allotment '.repeat(200)}`,
    text: 'The owner keeps bees.',
    quote: 'I keep bees',
  });

  const fields = await readForgetBodyFields(ctx.memory.log, {
    tool: 'log.forget',
    thread: 'conversation',
    input: { record: String(long.recordSequence) },
    callSequence: 1,
  });

  expect(fields).toMatchObject({
    status: 'fields',
    fields: { text: expect.stringMatching(/^I keep bees on the allotment .{1900,}…$/su) },
  });
});

test.each([
  ['a record on another thread', { thread: 'some-task', record: '1' }],
  ['a record that does not exist', { thread: 'conversation', record: '99999' }],
  ['an argument that is no event ID', { thread: 'conversation', record: 'abc' }],
])('it leaves the card without a body for %s', async (_label, request) => {
  const ctx = await setupTest();

  const fields = await readForgetBodyFields(ctx.memory.log, {
    tool: 'log.forget',
    thread: request.thread,
    input: { record: request.record },
    callSequence: 1,
  });

  expect(fields).toStrictEqual({ status: 'unreadable' });
});

test('it leaves the card without a body when the log cannot be read', async () => {
  const ctx = await setupTest();

  await ctx.memory.writer.stop();

  const fields = await readForgetBodyFields(ctx.memory.log, {
    tool: 'log.forget',
    thread: 'conversation',
    input: { record: String(ctx.sequence) },
    callSequence: 1,
  });

  expect(fields).toStrictEqual({ status: 'unreadable' });
});
