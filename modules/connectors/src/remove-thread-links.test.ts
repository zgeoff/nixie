import { expect, test } from 'bun:test';
import { sql } from 'kysely';
import { removeThreadLinks } from './remove-thread-links';
import { startTestLog } from './test-utils/start-test-log';
import { writeLinkNumbers } from './write-link-numbers';

async function setupTest() {
  return { log: await startTestLog() };
}

test("it removes the links of every one of the thread's sessions", async () => {
  const ctx = await setupTest();

  await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    urls: ['https://pier.test/a'],
  });

  await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-b',
    thread: 'conversation',
    urls: ['https://pier.test/b'],
  });

  await removeThreadLinks(ctx.log, 'conversation');

  const rows = await sql`select * from web_fetch_links`.execute(ctx.log.writer.db);

  expect(rows.rows).toStrictEqual([]);
});

test("it never removes another thread's links", async () => {
  const ctx = await setupTest();

  await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    urls: ['https://pier.test/a'],
  });

  await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-c',
    thread: 'task-tides',
    urls: ['https://pier.test/c'],
  });

  await removeThreadLinks(ctx.log, 'conversation');

  const rows = await sql`select url from web_fetch_links`.execute(ctx.log.writer.db);

  expect(rows.rows).toStrictEqual([{ url: 'https://pier.test/c' }]);
});
