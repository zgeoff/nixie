import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readLogPage } from './read-log-page';
import { startTestMemory } from './test-utils';
import { removeMessageKey } from './test-utils/remove-message-key';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

async function setupTest() {
  const memory = await startTestMemory();

  onTestFinished(() => {
    setSystemTime();
  });

  return { log: memory.log };
}

test('it reads only the entries recorded in the time range', async () => {
  const ctx = await setupTest();

  setSystemTime(new Date(Date.UTC(2026, 9, 11, 22, 0)));

  await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'Before the range',
    spans: [{ start: 0, end: 16, source: 'typed' }],
  });

  setSystemTime(new Date(Date.UTC(2026, 9, 12, 9, 30)));

  const inside = await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'Inside the range',
    spans: [{ start: 0, end: 16, source: 'typed' }],
  });

  setSystemTime(new Date(Date.UTC(2026, 9, 13, 0, 0)));

  await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'At the end of the range',
    spans: [{ start: 0, end: 23, source: 'typed' }],
  });

  const page = await readLogPage(ctx.log, {
    thread: 'conversation',
    after: 0,
    from: Date.UTC(2026, 9, 12),
    to: Date.UTC(2026, 9, 13),
    words: [],
    limit: 20,
    scanLimit: 500,
  });

  expect(page).toStrictEqual({
    entries: [
      {
        sequence: inside,
        role: 'owner',
        recordedAt: Date.UTC(2026, 9, 12, 9, 30),
        text: 'Inside the range',
        isCut: false,
      },
    ],
    next: null,
  });
});

test('it reads only the entries that hold every word of a search, in any case', async () => {
  const ctx = await setupTest();

  await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'The plum tree needs pruning',
    spans: [{ start: 0, end: 27, source: 'typed' }],
  });

  const [reply] = await writeRecords(ctx.log, [
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Prune the PLUM tree in late winter' },
    },
  ]);

  invariant(reply);

  await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'The pear tree is fine',
    spans: [{ start: 0, end: 21, source: 'typed' }],
  });

  const page = await readLogPage(ctx.log, {
    thread: 'conversation',
    after: 0,
    from: null,
    to: null,
    words: ['plum', 'Winter'],
    limit: 20,
    scanLimit: 500,
  });

  expect(page).toStrictEqual({
    entries: [
      {
        sequence: reply.sequence,
        role: 'assistant',
        recordedAt: expect.toBeNumber(),
        text: 'Prune the PLUM tree in late winter',
        isCut: false,
      },
    ],
    next: null,
  });
});

test('it returns at most one page, with the cursor that reads the next one', async () => {
  const ctx = await setupTest();

  const [first, second] = await writeRecords(
    ctx.log,
    ['One', 'Two', 'Three'].map((text) => ({
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text },
    })),
  );

  invariant(first && second);

  const page = await readLogPage(ctx.log, {
    thread: 'conversation',
    after: 0,
    from: null,
    to: null,
    words: [],
    limit: 2,
    scanLimit: 500,
  });

  expect(page.entries.map((entry) => entry.sequence)).toStrictEqual([
    first.sequence,
    second.sequence,
  ]);

  expect(page.next).toBe(second.sequence);
});

test('it reads the page after the cursor and ends with no cursor', async () => {
  const ctx = await setupTest();

  const [, second, third] = await writeRecords(
    ctx.log,
    ['One', 'Two', 'Three'].map((text) => ({
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text },
    })),
  );

  invariant(second && third);

  const page = await readLogPage(ctx.log, {
    thread: 'conversation',
    after: second.sequence,
    from: null,
    to: null,
    words: [],
    limit: 2,
    scanLimit: 500,
  });

  expect(page).toStrictEqual({
    entries: [
      {
        sequence: third.sequence,
        role: 'assistant',
        recordedAt: expect.toBeNumber(),
        text: 'Three',
        isCut: false,
      },
    ],
    next: null,
  });
});

test('it stops a search at the scan limit with the cursor to go on from', async () => {
  const ctx = await setupTest();

  const [, second] = await writeRecords(
    ctx.log,
    ['Nothing here', 'Nothing here either', 'The kettle is descaled'].map((text) => ({
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text },
    })),
  );

  invariant(second);

  const page = await readLogPage(ctx.log, {
    thread: 'conversation',
    after: 0,
    from: null,
    to: null,
    words: ['kettle'],
    limit: 20,
    scanLimit: 2,
  });

  expect(page).toStrictEqual({ entries: [], next: second.sequence });
});

test('it leaves out the records of other threads and the kinds a reader never sees', async () => {
  const ctx = await setupTest();

  await writeOwnerMessageRecord(ctx.log, {
    thread: 'task-garden',
    text: 'A task message',
    spans: [{ start: 0, end: 14, source: 'typed' }],
  });

  await writeRecords(ctx.log, [
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { input: { url: 'https://example.test/' } },
    },
  ]);

  const page = await readLogPage(ctx.log, {
    thread: 'conversation',
    after: 0,
    from: null,
    to: null,
    words: [],
    limit: 20,
    scanLimit: 500,
  });

  expect(page).toStrictEqual({ entries: [], next: null });
});

test('it shows a forgotten message with no text, and a search never returns it', async () => {
  const ctx = await setupTest();

  const sequence = await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'The gate code is 2290',
    spans: [{ start: 0, end: 21, source: 'typed' }],
  });

  await removeMessageKey(ctx.log, sequence);

  const read = await readLogPage(ctx.log, {
    thread: 'conversation',
    after: 0,
    from: null,
    to: null,
    words: [],
    limit: 20,
    scanLimit: 500,
  });

  const searched = await readLogPage(ctx.log, {
    thread: 'conversation',
    after: 0,
    from: null,
    to: null,
    words: ['gate'],
    limit: 20,
    scanLimit: 500,
  });

  expect(read.entries).toStrictEqual([
    { sequence, role: 'owner', recordedAt: expect.toBeNumber(), text: null, isCut: false },
  ]);

  expect(searched.entries).toStrictEqual([]);
});

test('it matches a search against the words of your message, never the block around a paste', async () => {
  const ctx = await setupTest();

  await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'See this: buses run hourly',
    spans: [
      { start: 0, end: 10, source: 'typed' },
      { start: 10, end: 26, source: 'pasted' },
    ],
  });

  const page = await readLogPage(ctx.log, {
    thread: 'conversation',
    after: 0,
    from: null,
    to: null,
    words: ['pasted'],
    limit: 20,
    scanLimit: 500,
  });

  expect(page).toStrictEqual({ entries: [], next: null });
});

test('it shows a marker line for each image of your message and none of its bytes', async () => {
  const ctx = await setupTest();

  const [record] = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      payload: { images: [{ mediaType: 'image/png' }, { mediaType: 'image/jpeg' }] },
      erasable: { text: 'The two kitchen plans', spans: [{ start: 0, end: 21, source: 'typed' }] },
      attachments: [
        new TextEncoder().encode('Kitchen-image-A'),
        new TextEncoder().encode('Kitchen-image-B'),
      ],
    },
  ]);

  invariant(record);

  const page = await readLogPage(ctx.log, {
    thread: 'conversation',
    after: 0,
    from: null,
    to: null,
    words: [],
    limit: 20,
    scanLimit: 500,
  });

  expect(page.entries).toStrictEqual([
    {
      sequence: record.sequence,
      role: 'owner',
      recordedAt: expect.toBeNumber(),
      text: expect.toBeString(),
      isCut: false,
    },
  ]);

  expect(page.entries.at(0)?.text).toMatch(
    /^The two kitchen plans\n<dropped-image id="[0-9a-f]{12}" n="1"\/>\n<dropped-image id="[0-9a-f]{12}" n="2"\/>$/u,
  );
});

test('it puts each pasted span of your message in a block', async () => {
  const ctx = await setupTest();

  const sequence = await writeOwnerMessageRecord(ctx.log, {
    thread: 'conversation',
    text: 'See this: buses run hourly',
    spans: [
      { start: 0, end: 10, source: 'typed' },
      { start: 10, end: 26, source: 'pasted' },
    ],
  });

  const page = await readLogPage(ctx.log, {
    thread: 'conversation',
    after: 0,
    from: null,
    to: null,
    words: [],
    limit: 20,
    scanLimit: 500,
  });

  const [entry] = page.entries;

  invariant(typeof entry?.text === 'string');

  expect(page.entries).toStrictEqual([
    { sequence, role: 'owner', recordedAt: expect.toBeNumber(), text: entry.text, isCut: false },
  ]);

  expect(entry.text).toMatch(
    /^See this: <pasted id="(?<id>[0-9a-f]{12})">buses run hourly<\/pasted id="\k<id>">$/u,
  );
});

test('it shows a tool result as its fields', async () => {
  const ctx = await setupTest();

  const [result] = await writeRecords(ctx.log, [
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'untrusted',
      payload: { outcome: 'result', sources: { text: 'untrusted' } },
      erasable: { result: { text: 'Buses run hourly' } },
    },
  ]);

  invariant(result);

  const page = await readLogPage(ctx.log, {
    thread: 'conversation',
    after: 0,
    from: null,
    to: null,
    words: [],
    limit: 20,
    scanLimit: 500,
  });

  expect(page.entries).toStrictEqual([
    {
      sequence: result.sequence,
      role: 'tool',
      recordedAt: expect.toBeNumber(),
      text: '{"result":{"text":"Buses run hourly"}}',
      isCut: false,
    },
  ]);
});

test('it cuts a text longer than 2000 characters', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'a'.repeat(2500) },
    },
  ]);

  const page = await readLogPage(ctx.log, {
    thread: 'conversation',
    after: 0,
    from: null,
    to: null,
    words: [],
    limit: 20,
    scanLimit: 500,
  });

  expect(page.entries).toMatchObject([{ text: 'a'.repeat(2000), isCut: true }]);
});
