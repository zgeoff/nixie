import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import { removeTestRecordKey } from '@heynixie/log/test-utils';
import invariant from 'tiny-invariant';
import { readLogPage } from './read-log-page';
import { startTestMemory } from './test-utils';
import { createConsolidationDiff } from './test-utils/create-consolidation-diff';
import { createMemoryItem } from './test-utils/create-memory-item';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

async function setupTest() {
  const memory = await startTestMemory();

  onTestFinished(() => {
    setSystemTime();
  });

  const readToolEntries = async (results: readonly JSONObject[]) => {
    await writeRecords(
      memory.log,
      results.map((erasable) => ({
        kind: 'tool_result' as const,
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        contentSource: 'untrusted' as const,
        payload: { outcome: 'result', sources: {} },
        erasable,
      })),
    );

    const page = await readLogPage(memory.log, {
      thread: 'conversation',
      after: 0,
      from: null,
      to: null,
      words: [],
      limit: 50,
      scanLimit: 500,
    });

    return page.entries.filter((entry) => entry.role === 'tool').map((entry) => entry.text);
  };

  const keepMoment = async (title: string) => {
    const message = await writeOwnerMessageRecord(memory.log, {
      thread: 'conversation',
      text: `${title} owner words`,
      spans: [],
    });

    const kept = await memory.store.moments.keep({
      caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
      thread: 'conversation',
      firstSequence: message,
      lastSequence: message,
      title,
    });

    invariant(kept.status === 'written');

    return kept;
  };

  return { log: memory.log, memory, readToolEntries, keepMoment };
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

  await removeTestRecordKey(ctx.log, sequence);

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

test.each([
  {
    name: 'a search result without the cost recorded under hidden',
    erasable: {
      result: {
        hits: [{ link: 'L1', title: 'Tide tables', url: 'https://tides.test/a', snippet: null }],
      },
      hidden: { costUSD: 0.012 },
    },
    sources: { hits: 'untrusted' },
    words: [],
    texts: [
      JSON.stringify({
        result: {
          hits: [{ link: 'L1', title: 'Tide tables', url: 'https://tides.test/a', snippet: null }],
        },
      }),
    ],
  },
  {
    name: 'a search result of an earlier release without the cost inside its result',
    erasable: {
      result: {
        hits: [{ link: 'L1', title: 'Tide tables', url: 'https://tides.test/a', snippet: null }],
        costUSD: 0.012,
      },
    },
    sources: { hits: 'untrusted' },
    words: [],
    texts: [
      JSON.stringify({
        result: {
          hits: [{ link: 'L1', title: 'Tide tables', url: 'https://tides.test/a', snippet: null }],
        },
      }),
    ],
  },
  {
    name: 'no entry for a word that sits only under hidden',
    erasable: {
      result: {
        hits: [{ link: 'L1', title: 'Tide tables', url: 'https://tides.test/a', snippet: null }],
      },
      hidden: { note: 'zebrafinch' },
    },
    sources: { hits: 'untrusted' },
    words: ['zebrafinch'],
    texts: [],
  },
  {
    name: 'the entry of log.read as the fields gave it',
    erasable: { result: { eventIDs: ['e1', 'e2'], next: 'e3' } },
    sources: { entries: 'untrusted', next: 'owner_data' },
    words: [],
    texts: ['{"result":{"eventIDs":["e1","e2"],"next":"e3"}}'],
  },
  {
    name: 'the entry of skill_pending as the fields gave it',
    erasable: { result: { proposals: [{ proposalID: 'p1' }] } },
    sources: { proposals: 'untrusted' },
    words: [],
    texts: ['{"result":{"proposals":[{"proposalID":"p1"}]}}'],
  },
  {
    name: 'a top-level cost that the sources name',
    erasable: { result: { costUSD: 3 } },
    sources: { costUSD: 'owner_data' },
    words: [],
    texts: ['{"result":{"costUSD":3}}'],
  },
  {
    name: 'the message of a refused search without the cost recorded under hidden',
    erasable: {
      message: 'the session ended while the search ran, so it returns no hits',
      hidden: { costUSD: 0.012 },
    },
    sources: { message: 'untrusted' },
    words: [],
    texts: ['{"message":"the session ended while the search ran, so it returns no hits"}'],
  },
  {
    name: 'a message alone, which wins over a result',
    erasable: { message: 'the tool refused', result: { count: 1 }, hidden: { note: 'x' } },
    sources: {},
    words: [],
    texts: ['{"message":"the tool refused"}'],
  },
  {
    name: 'the result when the message is not a string',
    erasable: { message: 7, result: { count: 1 } },
    sources: {},
    words: [],
    texts: ['{"result":{"count":1}}'],
  },
  {
    name: 'the fields whole when they hold neither a result nor a message',
    erasable: { note: 'plain', hidden: { count: 2 } },
    sources: {},
    words: [],
    texts: ['{"note":"plain","hidden":{"count":2}}'],
  },
  {
    name: 'a null result',
    erasable: { result: null },
    sources: {},
    words: [],
    texts: ['{"result":null}'],
  },
  {
    name: 'an array result that holds a cost key untouched',
    erasable: { result: [{ costUSD: 1 }] },
    sources: {},
    words: [],
    texts: ['{"result":[{"costUSD":1}]}'],
  },
  {
    name: 'a falsy result',
    erasable: { result: 0 },
    sources: {},
    words: [],
    texts: ['{"result":0}'],
  },
])('it shows $name', async (row) => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'untrusted',
      payload: { outcome: 'result', sources: row.sources },
      erasable: row.erasable,
    },
  ]);

  const page = await readLogPage(ctx.log, {
    thread: 'conversation',
    after: 0,
    from: null,
    to: null,
    words: row.words,
    limit: 20,
    scanLimit: 500,
  });

  expect(page.entries.map((entry) => entry.text)).toStrictEqual([...row.texts]);
});

test('it prints the short ID of a moment and an item in the entry of each moment and recall tool, for a record with hidden and for one with UUIDs', async () => {
  const ctx = await setupTest();
  const kept = await ctx.keepMoment('The kettle argument');
  const item = await createMemoryItem(ctx.memory.store, { text: 'Buys only quiet kettles' });
  const shortIDs = await ctx.memory.store.readShortIDs([item.itemID]);

  const itemShortID = shortIDs.get(item.itemID) ?? '';
  const momentUUIDs = { [kept.shortID]: kept.momentID };
  const bothUUIDs = { ...momentUUIDs, [itemShortID]: item.itemID };

  const texts = await ctx.readToolEntries([
    {
      result: { moments: [{ momentID: kept.shortID, version: 1 }], next: null },
      hidden: { uuids: momentUUIDs },
    },
    { result: { moments: [{ momentID: kept.momentID, version: 1 }], next: null } },
    {
      result: { momentID: kept.shortID, version: 1, eventIDs: ['3'] },
      hidden: { uuids: momentUUIDs },
    },
    { result: { momentID: kept.momentID, version: 1, eventIDs: ['3'] } },
    {
      result: { momentID: kept.shortID, version: 1, keptThisWeek: 1 },
      hidden: { uuids: momentUUIDs },
    },
    { result: { momentID: kept.momentID, version: 1, keptThisWeek: 1 } },
    { result: { momentID: kept.shortID, version: 2 }, hidden: { uuids: momentUUIDs } },
    { result: { momentID: kept.momentID, version: 2 } },
    {
      result: { momentID: kept.shortID, version: 3, state: 'retired' },
      hidden: { uuids: momentUUIDs },
    },
    { result: { momentID: kept.momentID, version: 3, state: 'retired' } },
    {
      result: { momentID: kept.shortID, version: 4, itemID: itemShortID },
      hidden: { uuids: bothUUIDs },
    },
    { result: { momentID: kept.momentID, version: 4, itemID: item.itemID } },
    {
      result: {
        items: [{ itemID: itemShortID, version: 1, momentIDs: [kept.shortID] }],
        next: null,
        leftOut: { count: 1, itemIDs: [itemShortID], versions: 0 },
      },
      hidden: { uuids: bothUUIDs },
    },
    {
      result: {
        items: [{ itemID: item.itemID, version: 1, momentIDs: [kept.momentID] }],
        next: null,
        leftOut: { count: 1, itemIDs: [item.itemID], versions: 0 },
      },
    },
  ]);

  expect(texts).toHaveLength(14);

  expect(texts).toSatisfyAll(
    (text: string | null) =>
      text?.includes(kept.shortID) === true || text?.includes(itemShortID) === true,
  );

  expect(texts.join('\n')).not.toContain(kept.momentID);
  expect(texts.join('\n')).not.toContain(item.itemID);
  expect(texts[1]).toBe(texts[0]);
  expect(texts[13]).toBe(texts[12]);
  expect(texts[11]).toBe(texts[10]);
});

test('it prints the short ID of a change while its row exists, and no changeID when none does', async () => {
  const ctx = await setupTest();
  const first = await createMemoryItem(ctx.memory.store, { text: 'Takes oat milk in coffee' });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'rewrite',
        inputs: [first],
        text: 'Takes oat milk',
        reason: 'Shorter.',
        source: 'owner',
      },
    ],
  });

  const [change] = diff.changes;

  invariant(change);

  const texts = await ctx.readToolEntries([
    { result: { changes: [{ changeID: change.changeID, kind: 'rewrite' }] } },
    {
      result: { changes: [{ changeID: '0b4e7a3c-52d1-4f08-9a6e-3c1d8f27b5a9', kind: 'rewrite' }] },
    },
  ]);

  expect(texts).toStrictEqual([
    JSON.stringify({ result: { changes: [{ changeID: change.shortID, kind: 'rewrite' }] } }),
    JSON.stringify({ result: { changes: [{ kind: 'rewrite' }] } }),
  ]);
});

test('it prints no momentID for a moment that was destroyed', async () => {
  const ctx = await setupTest();
  const kept = await ctx.keepMoment('The shed colour');

  await ctx.memory.store.moments.destroy({ momentID: kept.momentID, version: 1 });

  const texts = await ctx.readToolEntries([
    { result: { momentID: kept.momentID, version: 1, eventIDs: [] } },
    {
      result: { momentID: kept.shortID, version: 1, eventIDs: [] },
      hidden: { uuids: { [kept.shortID]: kept.momentID } },
    },
  ]);

  expect(texts).toStrictEqual([
    '{"result":{"version":1,"eventIDs":[]}}',
    JSON.stringify({ result: { momentID: kept.shortID, version: 1, eventIDs: [] } }),
  ]);
});

test('it rejects the read when a short ID cannot be read', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Buys only quiet kettles' });

  await writeRecords(ctx.log, [
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'untrusted',
      payload: { outcome: 'result', sources: {} },
      erasable: { result: { itemID: item.itemID } },
    },
  ]);

  const failing = ctx.memory.writer.db.withPlugin({
    transformQuery: (args) => {
      if (JSON.stringify(args.node).includes('"memory_items"')) {
        throw new Error('the item read failed');
      }

      return args.node;
    },
    transformResult: (args) => Promise.resolve(args.result),
  });

  const log = {
    deploymentKey: ctx.memory.deploymentKey,
    writer: { ...ctx.memory.writer, db: failing },
  };

  const read = readLogPage(log, {
    thread: 'conversation',
    after: 0,
    from: null,
    to: null,
    words: [],
    limit: 20,
    scanLimit: 500,
  });

  const [settled] = await Promise.allSettled([read]);

  expect(settled.status).toBe('rejected');
});

test('it matches a word of a search to the short ID and not to the UUID', async () => {
  const ctx = await setupTest();
  const kept = await ctx.keepMoment('The kettle argument');

  await writeRecords(ctx.log, [
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'untrusted',
      payload: { outcome: 'result', sources: {} },
      erasable: { result: { momentID: kept.momentID, version: 1 } },
    },
  ]);

  const readEntries = (word: string) =>
    readLogPage(ctx.log, {
      thread: 'conversation',
      after: 0,
      from: null,
      to: null,
      words: [word],
      limit: 20,
      scanLimit: 500,
    });

  const byShortID = await readEntries(kept.shortID);
  const byUUID = await readEntries(kept.momentID);

  expect(byShortID.entries).toHaveLength(1);
  expect(byUUID.entries).toStrictEqual([]);
});

test('it prints the short ID of a moment and an item that sit in an object under an ID key', async () => {
  const ctx = await setupTest();
  const kept = await ctx.keepMoment('The ladder loan');
  const item = await createMemoryItem(ctx.memory.store, { text: 'Lends a ladder on Sundays' });
  const shortIDs = await ctx.memory.store.readShortIDs([item.itemID]);

  const itemShortID = shortIDs.get(item.itemID) ?? '';

  const texts = await ctx.readToolEntries([
    {
      result: {
        itemIDs: [{ momentID: kept.momentID, nested: { itemID: item.itemID } }],
        momentID: { itemID: item.itemID },
      },
    },
  ]);

  expect(texts).toStrictEqual([
    JSON.stringify({
      result: {
        itemIDs: [{ momentID: kept.shortID, nested: { itemID: itemShortID } }],
        momentID: { itemID: itemShortID },
      },
    }),
  ]);
});
