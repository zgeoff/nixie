import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { startTestMemory } from '../test-utils';
import { buildMockToolContext } from '../test-utils/build-mock-tool-context';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';
import { buildLogReadTool } from './build-log-read-tool';

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

test('it reads each entry once across a call up to a time and a call from it, when the time has milliseconds', async () => {
  const ctx = await setupTest();

  const time = new Date('2026-10-12T08:15:30.250Z');

  setSystemTime(new Date(time.getTime() - 1));

  await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'Just before',
    spans: [{ start: 0, end: 11, source: 'typed' }],
  });

  setSystemTime(time);

  await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'Exactly at',
    spans: [{ start: 0, end: 10, source: 'typed' }],
  });

  setSystemTime(new Date(time.getTime() + 1));

  await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'Just after',
    spans: [{ start: 0, end: 10, source: 'typed' }],
  });

  const before = await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'log.read',
      input: { from: '2026-10-12', to: time.toISOString() },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  const after = await ctx.tool.run(
    {
      callID: 'call-2',
      tool: 'log.read',
      input: { from: time.toISOString(), to: '2026-10-13' },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  invariant(before.status === 'ok' && after.status === 'ok', 'both reads are accepted');

  expect([before.result, after.result]).toStrictEqual([
    {
      entries: [expect.objectContaining({ text: 'Just before' })],
      next: null,
    },
    {
      entries: [
        expect.objectContaining({ text: 'Exactly at' }),
        expect.objectContaining({ text: 'Just after' }),
      ],
      next: null,
    },
  ]);
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

test('it never returns a session summary, by search or by date', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 0, trigger: 'threshold', summaryTokens: 9 },
      erasable: { text: 'Open threads: the red bike has a flat tyre.' },
    },
  ]);

  const searched = await ctx.tool.run(
    { callID: 'call-1', tool: 'log.read', input: { query: 'bike tyre' }, toolUseID: null },
    buildMockToolContext(),
  );

  const dated = await ctx.tool.run(
    {
      callID: 'call-2',
      tool: 'log.read',
      input: { from: '2000-01-01', to: '2100-01-01' },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  expect(searched).toMatchObject({ status: 'ok', result: { entries: [] } });
  expect(dated).toMatchObject({ status: 'ok', result: { entries: [] } });
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

test('it refuses a date range with a day past the end of its month, which a parse would roll over', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.tool.run(
    { callID: 'call-1', tool: 'log.read', input: { to: '2026-02-30T12:00Z' }, toolUseID: null },
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'from and to must be real UTC dates or times',
  });
});

test('it gives a tool result the eventID of the call it answers', async () => {
  const ctx = await setupTest();

  const [call] = await writeRecords(ctx.log, [
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { input: { url: 'https://lockers.test/' } },
    },
  ]);

  const [result] = await writeRecords(ctx.log, [
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      parent: call?.sequence ?? 0,
      erasable: { result: { page: 'The locker code is 2291.' } },
    },
  ]);

  const outcome = await ctx.tool.run(
    { callID: 'call-1', tool: 'log.read', input: {}, toolUseID: null },
    buildMockToolContext(),
  );

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      entries: [
        {
          eventID: String(result?.sequence),
          callEventID: String(call?.sequence),
          role: 'tool',
        },
      ],
    },
  });
});
