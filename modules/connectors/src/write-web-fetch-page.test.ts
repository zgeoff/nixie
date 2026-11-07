import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { modelSessionOpenedCodec } from '@heynixie/models';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { readLinkTarget } from './read-link-target';
import { readWebFetchPage } from './read-web-fetch-page';
import { startTestLog } from './test-utils/start-test-log';
import { writeWebFetchPage } from './write-web-fetch-page';

async function setupTest() {
  return { log: await startTestLog() };
}

test('it stores the page in parts under a new page ID, and returns it', async () => {
  const ctx = await setupTest();

  const stored = await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/ferries',
      status: 200,
      contentType: 'text/html',
      isTruncated: true,
      blocked: null,
      text: 'Ferries leave at nine.\nThe last one leaves at six.',
      links: [],
    },
    { sessionKey: 'session-a', thread: 'conversation', invalidatedThrough: null },
    { textBytes: 30, linkPathChars: 24, storeBytes: 1000 },
  );

  invariant(stored);

  const read = await readWebFetchPage(ctx.log, { sessionKey: 'session-a', pageID: stored.pageID });

  expect(stored).toStrictEqual({
    pageID: expect.stringMatching(/^[a-z][\da-z]{9}$/u),
    url: 'https://harbour.test/ferries',
    status: 200,
    contentType: 'text/html',
    isTruncated: true,
    blocked: null,
    parts: ['Ferries leave at nine.\n', 'The last one leaves at six.'],
  });

  expect(read).toStrictEqual(stored);
});

test('it numbers the links of the whole page, past its first part', async () => {
  const ctx = await setupTest();

  const stored = await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/ferries',
      status: 200,
      contentType: 'text/html',
      isTruncated: false,
      blocked: null,
      text: 'Fares \u{E000}0\u{E001}\nTimetable \u{E000}1\u{E001}',
      links: ['https://harbour.test/fares', 'https://harbour.test/timetable'],
    },
    { sessionKey: 'session-a', thread: 'conversation', invalidatedThrough: null },
    { textBytes: 12, linkPathChars: 24, storeBytes: 1000 },
  );

  const target = await readLinkTarget(ctx.log, { sessionKey: 'session-a', number: 2 });

  expect(stored?.parts).toStrictEqual(['Fares [L1]\n', 'Timetable ', '[L2]']);
  expect(target).toBe('https://harbour.test/timetable');
});

test('it stores the page of a session no invalidation ended since its step began', async () => {
  const ctx = await setupTest();

  const [invalidated] = await writeRecords(ctx.log, [
    {
      kind: 'model.session_invalidated',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { itemID: '00000000-0000-4000-8000-000000000001' },
    },
  ]);

  invariant(invalidated);

  const stored = await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/ferries',
      status: 200,
      contentType: 'text/html',
      isTruncated: false,
      blocked: null,
      text: 'Ferries leave at nine.',
      links: [],
    },
    { sessionKey: 'session-a', thread: 'conversation', invalidatedThrough: invalidated.sequence },
    { textBytes: 100, linkPathChars: 24, storeBytes: 1000 },
  );

  expect(stored?.parts).toStrictEqual(['Ferries leave at nine.']);
});

test('it writes no link or page and returns null once an invalidation ended the session', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'model.session_invalidated',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { itemID: '00000000-0000-4000-8000-000000000001' },
    },
  ]);

  const stored = await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/ferries',
      status: 200,
      contentType: 'text/html',
      isTruncated: false,
      blocked: null,
      text: 'Fares \u{E000}0\u{E001}',
      links: ['https://harbour.test/fares'],
    },
    { sessionKey: 'session-a', thread: 'conversation', invalidatedThrough: 0 },
    { textBytes: 100, linkPathChars: 24, storeBytes: 1000 },
  );

  const links = await sql`select * from web_fetch_links`.execute(ctx.log.writer.db);
  const pages = await sql`select * from web_fetch_pages`.execute(ctx.log.writer.db);

  expect(stored).toBeNull();
  expect(links.rows).toStrictEqual([]);
  expect(pages.rows).toStrictEqual([]);
});

test("it never lets another thread's invalidation end the session", async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'model.session_invalidated',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-tides',
      payload: { itemID: '00000000-0000-4000-8000-000000000001' },
    },
  ]);

  const stored = await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/ferries',
      status: 200,
      contentType: 'text/html',
      isTruncated: false,
      blocked: null,
      text: 'Ferries leave at nine.',
      links: [],
    },
    { sessionKey: 'session-a', thread: 'conversation', invalidatedThrough: 0 },
    { textBytes: 100, linkPathChars: 24, storeBytes: 1000 },
  );

  expect(stored?.parts).toStrictEqual(['Ferries leave at nine.']);
});

test("it removes the session's oldest page first once its pages pass the store limit, and keeps the new page", async () => {
  const ctx = await setupTest();

  const session = { sessionKey: 'session-a', thread: 'conversation', invalidatedThrough: null };
  const limits = { textBytes: 100, linkPathChars: 24, storeBytes: 25 };

  const oldest = await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/a',
      status: 200,
      contentType: 'text/plain',
      isTruncated: false,
      blocked: null,
      text: 'Pier one.',
      links: [],
    },
    session,
    limits,
  );

  const middle = await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/b',
      status: 200,
      contentType: 'text/plain',
      isTruncated: false,
      blocked: null,
      text: 'Pier two.',
      links: [],
    },
    session,
    limits,
  );

  const newest = await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/c',
      status: 200,
      contentType: 'text/plain',
      isTruncated: false,
      blocked: null,
      text: 'Pier six.',
      links: [],
    },
    session,
    limits,
  );

  invariant(oldest && middle && newest);

  const pages = await sql`select page_id from web_fetch_pages
    order by stored_at, rowid`.execute(ctx.log.writer.db);

  expect(pages.rows).toStrictEqual([{ page_id: middle.pageID }, { page_id: newest.pageID }]);
});

test('it keeps a new page larger than the whole store limit, and removes every other page of the session', async () => {
  const ctx = await setupTest();

  const session = { sessionKey: 'session-a', thread: 'conversation', invalidatedThrough: null };
  const limits = { textBytes: 100, linkPathChars: 24, storeBytes: 20 };

  await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/a',
      status: 200,
      contentType: 'text/plain',
      isTruncated: false,
      blocked: null,
      text: 'Pier one.',
      links: [],
    },
    session,
    limits,
  );

  const large = await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/timetable',
      status: 200,
      contentType: 'text/plain',
      isTruncated: false,
      blocked: null,
      text: 'Ferries leave every hour from six until nine.',
      links: [],
    },
    session,
    limits,
  );

  invariant(large);

  const pages = await sql`select page_id from web_fetch_pages`.execute(ctx.log.writer.db);

  expect(pages.rows).toStrictEqual([{ page_id: large.pageID }]);
});

test("it removes the pages of the thread's ended sessions when a new session stores a page", async () => {
  const ctx = await setupTest();

  const limits = { textBytes: 100, linkPathChars: 24, storeBytes: 1000 };

  await writeRecords(ctx.log, [
    {
      kind: modelSessionOpenedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: modelSessionOpenedCodec.encode({
        model: 'model-a',
        profile: 'chat-direct',
        kind: 'first',
        reason: null,
        lostSessionID: null,
        summarySequence: null,
        recentRecords: 0,
        recentEvents: 0,
        recalledThrough: 0,
        status: {},
        personaHash: 'sha256:persona',
        policyHash: 'sha256:policy',
        sessionKey: '00000000-0000-4000-8000-00000000000a',
      }),
    },
  ]);

  await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/a',
      status: 200,
      contentType: 'text/plain',
      isTruncated: false,
      blocked: null,
      text: 'Pier one.',
      links: [],
    },
    {
      sessionKey: '00000000-0000-4000-8000-00000000000a',
      thread: 'conversation',
      invalidatedThrough: null,
    },
    limits,
  );

  await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/b',
      status: 200,
      contentType: 'text/plain',
      isTruncated: false,
      blocked: null,
      text: 'Pier two.',
      links: [],
    },
    {
      sessionKey: '00000000-0000-4000-8000-00000000000b',
      thread: 'conversation',
      invalidatedThrough: null,
    },
    limits,
  );

  const pages = await sql`select session_key from web_fetch_pages`.execute(ctx.log.writer.db);

  expect(pages.rows).toStrictEqual([{ session_key: '00000000-0000-4000-8000-00000000000b' }]);
});

test("it keeps the thread's pages of a key no session opening names, such as a run's", async () => {
  const ctx = await setupTest();

  const limits = { textBytes: 100, linkPathChars: 24, storeBytes: 1000 };

  await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/a',
      status: 200,
      contentType: 'text/plain',
      isTruncated: false,
      blocked: null,
      text: 'Pier one.',
      links: [],
    },
    { sessionKey: 'run-tides', thread: 'task-tides', invalidatedThrough: null },
    limits,
  );

  await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/b',
      status: 200,
      contentType: 'text/plain',
      isTruncated: false,
      blocked: null,
      text: 'Pier two.',
      links: [],
    },
    { sessionKey: 'run-ferries', thread: 'task-tides', invalidatedThrough: null },
    limits,
  );

  const pages = await sql`select session_key from web_fetch_pages
    order by session_key`.execute(ctx.log.writer.db);

  expect(pages.rows).toStrictEqual([{ session_key: 'run-ferries' }, { session_key: 'run-tides' }]);
});
