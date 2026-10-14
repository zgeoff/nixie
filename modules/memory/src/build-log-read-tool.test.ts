import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { buildLogReadTool } from './build-log-read-tool';
import { startTestMemory } from './test-utils';
import { buildMockToolContext } from './test-utils/build-mock-tool-context';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

async function setupTest() {
  const memory = await startTestMemory();

  onTestFinished(() => {
    setSystemTime();
  });
  return { log: memory.log, tool: buildLogReadTool(memory.log) };
}

test('it reads one page of a date range, with the cursor of the next page', async () => {
  const ctx = await setupTest();

  setSystemTime(new Date(Date.UTC(2026, 9, 11, 23, 50)));
  await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'The day before',
    spans: [{ start: 0, end: 14, source: 'typed' }],
  });
  setSystemTime(new Date(Date.UTC(2026, 9, 12, 8, 15)));
  const first = await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'Morning walk by the river',
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });
  setSystemTime(new Date(Date.UTC(2026, 9, 12, 9, 40)));
  await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'Bread is in the oven',
    spans: [{ start: 0, end: 20, source: 'typed' }],
  });

  const outcome = await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'log.read',
      input: { from: '2026-10-12', to: '2026-10-13', limit: 1 },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      entries: [
        {
          eventID: String(first),
          role: 'owner',
          recordedAt: '2026-10-12 08:15 UTC',
          text: 'Morning walk by the river',
          isCut: false,
        },
      ],
      next: String(first),
    },
    record: { eventIDs: [String(first)], next: String(first) },
  });
});

test('it reads one page of the entries that hold every word of a search', async () => {
  const ctx = await setupTest();

  await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'The bike needs a bell',
    spans: [{ start: 0, end: 21, source: 'typed' }],
  });
  const matched = await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'The red bike has a flat tyre',
    spans: [{ start: 0, end: 28, source: 'typed' }],
  });
  await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'Fixed the flat tyre on the bike',
    spans: [{ start: 0, end: 31, source: 'typed' }],
  });

  const outcome = await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'log.read',
      input: { query: 'bike tyre', limit: 1 },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      entries: [
        {
          eventID: String(matched),
          role: 'owner',
          recordedAt: expect.toBeString(),
          text: 'The red bike has a flat tyre',
          isCut: false,
        },
      ],
      next: String(matched),
    },
    record: { eventIDs: [String(matched)], next: String(matched) },
  });
});

test("it reads the calling run's own thread", async () => {
  const ctx = await setupTest();

  await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'A conversation message',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  const outcome = await ctx.tool.run(
    { callID: 'call-1', tool: 'log.read', input: {}, toolUseID: null },
    buildMockToolContext({ thread: 'task-garden' }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { entries: [], next: null },
    record: { eventIDs: [], next: null },
  });
});

test('it refuses a date range with a month that does not exist', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.tool.run(
    { callID: 'call-1', tool: 'log.read', input: { from: '2026-13-01' }, toolUseID: null },
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'from and to must be real UTC dates or times',
  });
});
