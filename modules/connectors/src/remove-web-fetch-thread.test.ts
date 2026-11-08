import { expect, test } from 'bun:test';
import { sql } from 'kysely';
import { readLinkTarget } from './read-link-target';
import { removeWebFetchThread } from './remove-web-fetch-thread';
import { seedWebFetchLinks } from './test-utils/seed-web-fetch-links';
import { startTestLog } from './test-utils/start-test-log';
import { writeWebFetchPage } from './write-web-fetch-page';

async function setupTest() {
  return { log: await startTestLog() };
}

test("it removes the links of every one of the thread's sessions", async () => {
  const ctx = await setupTest();

  await seedWebFetchLinks(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    urls: ['https://pier.test/a'],
  });

  await seedWebFetchLinks(ctx.log, {
    sessionKey: 'session-b',
    thread: 'conversation',
    urls: ['https://pier.test/b'],
  });

  await removeWebFetchThread(ctx.log, 'conversation');

  const rows = await sql`select * from web_fetch_links`.execute(ctx.log.writer.db);

  expect(rows.rows).toStrictEqual([]);
});

test("it never removes another thread's links", async () => {
  const ctx = await setupTest();

  await seedWebFetchLinks(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    urls: ['https://pier.test/a'],
  });

  await seedWebFetchLinks(ctx.log, {
    sessionKey: 'session-c',
    thread: 'task-tides',
    urls: ['https://pier.test/c'],
  });

  await removeWebFetchThread(ctx.log, 'conversation');

  const target = await readLinkTarget(ctx.log, { sessionKey: 'session-c', number: 1 });

  expect(target).toBe('https://pier.test/c');
});

test("it removes the thread's pages", async () => {
  const ctx = await setupTest();

  await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://pier.test/a',
      status: 200,
      contentType: 'text/plain',
      isTruncated: false,
      blocked: null,
      text: 'Pier one.',
      links: [],
    },
    { sessionKey: 'session-a', thread: 'conversation', invalidatedThrough: null },
    { textBytes: 100, linkPathChars: 24, storeBytes: 1000 },
  );

  await removeWebFetchThread(ctx.log, 'conversation');

  const rows = await sql`select * from web_fetch_pages`.execute(ctx.log.writer.db);

  expect(rows.rows).toStrictEqual([]);
});

test("it never removes another thread's pages", async () => {
  const ctx = await setupTest();

  await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://pier.test/c',
      status: 200,
      contentType: 'text/plain',
      isTruncated: false,
      blocked: null,
      text: 'Pier six.',
      links: [],
    },
    { sessionKey: 'session-c', thread: 'task-tides', invalidatedThrough: null },
    { textBytes: 100, linkPathChars: 24, storeBytes: 1000 },
  );

  await removeWebFetchThread(ctx.log, 'conversation');

  const rows = await sql`select url from web_fetch_pages`.execute(ctx.log.writer.db);

  expect(rows.rows).toStrictEqual([{ url: 'https://pier.test/c' }]);
});
