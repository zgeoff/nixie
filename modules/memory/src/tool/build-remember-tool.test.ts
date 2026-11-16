import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import { startTestMemory } from '../test-utils';
import { buildMockCheckerAnswer } from '../test-utils/build-mock-checker-answer';
import { buildMockToolContext } from '../test-utils/build-mock-tool-context';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';
import type { MemoryTables } from '../types';
import { buildRememberTool } from './build-remember-tool';

test('it stores a backed fact with the end time it is given, as a time in UTC', async () => {
  const memory = await startTestMemory({
    gate: {
      check: () => Promise.resolve(buildMockCheckerAnswer()),
      clock: buildTestClock(Date.parse('2026-10-19T08:30:00Z')),
    },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: "I'm in Lisbon this week",
    spans: [{ start: 0, end: 23, source: 'typed' }],
  });

  await buildRememberTool(memory.store).run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: {
        gist: 'a gist',
        topic: 'a topic',
        text: 'Is in Lisbon this week',
        quote: "I'm in Lisbon this week",
        until: '2026-10-25T23:59:59+00:00',
      },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  const item = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('until')
    .executeTakeFirstOrThrow();

  expect(item.until).toBe(Date.parse('2026-10-25T23:59:59Z'));
});

test('it refuses an end time that names no real day, and writes nothing', async () => {
  const memory = await startTestMemory();

  const outcome = await buildRememberTool(memory.store).run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: {
        gist: 'a gist',
        topic: 'a topic',
        text: 'Is in Lisbon until the end of the month',
        until: '2026-02-31T23:59:59+00:00',
      },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  const pending = await memory.store.proposals.listPending();

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'until 2026-02-31T23:59:59+00:00 is not a real ISO time with an offset, such as 2026-10-19T23:59:59+01:00',
  });

  expect(pending).toStrictEqual([]);
});

test('it answers an end time that has passed with a tool error', async () => {
  const memory = await startTestMemory({
    gate: { clock: buildTestClock(Date.parse('2026-10-26T08:30:00Z')) },
  });

  const outcome = await buildRememberTool(memory.store).run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: {
        gist: 'a gist',
        topic: 'a topic',
        text: 'Is in Lisbon this week',
        until: '2026-10-25T23:59:59+00:00',
      },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'the end time 2026-10-25T23:59:59.000Z has passed; it is now 2026-10-26T08:30:00.000Z',
  });
});

test('it describes memory.remember with no word about pinning, and takes no pin input', async () => {
  const memory = await startTestMemory();

  const tool = buildRememberTool(memory.store);

  expect(tool.description).not.toMatch(/\bpin/iu);
  expect(JSON.stringify(tool.input)).not.toInclude('"pin"');
});

test('it reads the sources of a remember from the quote in text the owner typed', async () => {
  const memory = await startTestMemory();

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  const input = {
    text: 'Takes coffee black',
    gist: 'black coffee',
    topic: 'food',
    quote: 'I take my coffee black',
  };

  const facts = await buildRememberTool(memory.store).resolvePolicyFacts?.(
    input,
    buildMockToolContext(),
  );

  expect(facts).toStrictEqual({
    status: 'ok',
    sources: ['owner'],
    args: { ...input, subject: 'owner' },
  });
});

test.each<['typed' | 'pasted', string, Record<string, string>]>([
  [
    'pasted',
    'a quote in a pasted span',
    {
      gist: 'a gist',
      topic: 'a topic',
      text: 'Takes coffee black',
      quote: 'I take my coffee black',
    },
  ],
  ['typed', 'no quote', { gist: 'a gist', topic: 'a topic', text: 'Takes coffee black' }],
  [
    'typed',
    'a quote the thread never held',
    { gist: 'a gist', topic: 'a topic', text: 'Likes jazz', quote: 'I like jazz' },
  ],
  [
    'typed',
    'a self-note whose quote the owner typed',
    {
      gist: 'a gist',
      topic: 'a topic',
      text: 'I like quiet mornings',
      subject: 'self',
      quote: 'I take my coffee black',
    },
  ],
])(
  'it reads the source outside when the message is %s, for %s',
  async (spanSource, _title, input) => {
    const memory = await startTestMemory();

    await writeOwnerMessageRecord(memory.log, {
      thread: 'conversation',
      text: 'I take my coffee black',
      spans: [{ start: 0, end: 22, source: spanSource }],
    });

    const facts = await buildRememberTool(memory.store).resolvePolicyFacts?.(
      input,
      buildMockToolContext(),
    );

    expect(facts).toStrictEqual({
      status: 'ok',
      sources: ['outside'],
      args: { subject: 'owner', ...input },
    });
  },
);

test('it adds the source task to a remember that a task run makes', async () => {
  const memory = await startTestMemory();

  await writeOwnerMessageRecord(memory.log, {
    thread: 'task-1',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  const input = {
    text: 'Takes coffee black',
    gist: 'black coffee',
    topic: 'food',
    quote: 'I take my coffee black',
  };

  const facts = await buildRememberTool(memory.store).resolvePolicyFacts?.(
    input,
    buildMockToolContext({ thread: 'task-1' }),
  );

  expect(facts).toStrictEqual({
    status: 'ok',
    sources: ['owner', 'task'],
    args: { ...input, subject: 'owner' },
  });
});

test('it reads the source outside for a write from a photo, whatever its quote', async () => {
  const memory = await startTestMemory();

  const photo = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const input = {
    text: 'Takes coffee black',
    gist: 'black coffee',
    topic: 'food',
    quote: 'I take my coffee black',
    image: { eventID: String(photo), number: 1 },
  };

  const facts = await buildRememberTool(memory.store).resolvePolicyFacts?.(
    input,
    buildMockToolContext(),
  );

  expect(facts).toStrictEqual({
    status: 'ok',
    sources: ['outside'],
    args: { ...input, subject: 'owner' },
  });
});

test("it reads the owner source of a granted task's remember from the event on the conversation's thread", async () => {
  const memory = await startTestMemory();

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  const input = {
    text: 'Takes coffee black',
    gist: 'black coffee',
    topic: 'food',
    quote: 'I take my coffee black',
    eventID: `#${String(sequence)}`,
  };

  const facts = await buildRememberTool(memory.store).resolvePolicyFacts?.(
    input,
    buildMockToolContext({ thread: 'task-1', logThread: 'conversation' }),
  );

  expect(facts).toStrictEqual({
    status: 'ok',
    sources: ['owner', 'task'],
    args: { ...input, subject: 'owner' },
  });
});
