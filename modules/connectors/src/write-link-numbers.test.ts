import { expect, test } from 'bun:test';
import { sql } from 'kysely';
import { startTestLog } from './test-utils/start-test-log';
import { writeLinkNumbers } from './write-link-numbers';

async function setupTest() {
  return { log: await startTestLog() };
}

test("it numbers each new URL from the session's count, in the order given", async () => {
  const ctx = await setupTest();

  const numbers = await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    urls: ['https://pier.test/a', 'https://pier.test/b', 'https://pier.test/a'],
  });

  expect([...numbers]).toStrictEqual([
    ['https://pier.test/a', 1],
    ['https://pier.test/b', 2],
  ]);
});

test('it keeps the number a session already gave a URL, and numbers the rest after the last', async () => {
  const ctx = await setupTest();

  await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    urls: ['https://pier.test/a', 'https://pier.test/b'],
  });

  const numbers = await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    urls: ['https://pier.test/c', 'https://pier.test/b'],
  });

  expect([...numbers]).toStrictEqual([
    ['https://pier.test/b', 2],
    ['https://pier.test/c', 3],
  ]);
});

test("it counts each session's numbers on their own", async () => {
  const ctx = await setupTest();

  await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    urls: ['https://pier.test/a', 'https://pier.test/b'],
  });

  const numbers = await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-b',
    thread: 'conversation',
    urls: ['https://pier.test/b'],
  });

  expect([...numbers]).toStrictEqual([['https://pier.test/b', 1]]);
});

test('it numbers more URLs than one statement binds', async () => {
  const ctx = await setupTest();

  const urls = Array.from({ length: 1200 }, (_, index) => `https://pier.test/berth-${index}`);

  await writeLinkNumbers(ctx.log, { sessionKey: 'session-a', thread: 'conversation', urls });

  const numbers = await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    urls: [...urls, 'https://pier.test/harbour-office'],
  });

  expect(numbers.size).toBe(1201);
  expect(numbers.get('https://pier.test/berth-1199')).toBe(1200);
  expect(numbers.get('https://pier.test/harbour-office')).toBe(1201);
});

test('it writes the thread each link belongs to', async () => {
  const ctx = await setupTest();

  await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    urls: ['https://pier.test/a'],
  });

  const rows = await sql`select * from web_fetch_links`.execute(ctx.log.writer.db);

  expect(rows.rows).toStrictEqual([
    { session_key: 'session-a', number: 1, url: 'https://pier.test/a', thread: 'conversation' },
  ]);
});

test('it writes nothing for no URL', async () => {
  const ctx = await setupTest();

  const numbers = await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    urls: [],
  });

  expect(numbers.size).toBe(0);
});
