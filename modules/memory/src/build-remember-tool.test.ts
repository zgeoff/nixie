import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import { buildRememberTool } from './build-remember-tool';
import { startTestMemory } from './test-utils';
import { buildMockCheckerAnswer } from './test-utils/build-mock-checker-answer';
import { buildMockToolContext } from './test-utils/build-mock-tool-context';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';
import type { MemoryTables } from './types';

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
      input: { text: 'Is in Lisbon this week', until: '2026-10-25T23:59:59+00:00' },
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
