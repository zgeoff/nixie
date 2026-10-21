import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
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
    invalidatedThrough: null,
    urls: ['https://pier.test/a', 'https://pier.test/b', 'https://pier.test/a'],
  });

  invariant(numbers);

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
    invalidatedThrough: null,
    urls: ['https://pier.test/a', 'https://pier.test/b'],
  });

  const numbers = await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    invalidatedThrough: null,
    urls: ['https://pier.test/c', 'https://pier.test/b'],
  });

  invariant(numbers);

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
    invalidatedThrough: null,
    urls: ['https://pier.test/a', 'https://pier.test/b'],
  });

  const numbers = await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-b',
    thread: 'conversation',
    invalidatedThrough: null,
    urls: ['https://pier.test/b'],
  });

  invariant(numbers);

  expect([...numbers]).toStrictEqual([['https://pier.test/b', 1]]);
});

test('it numbers more URLs than one statement binds', async () => {
  const ctx = await setupTest();

  const urls = Array.from({ length: 1200 }, (_, index) => `https://pier.test/berth-${index}`);

  await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    invalidatedThrough: null,
    urls,
  });

  const numbers = await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    invalidatedThrough: null,
    urls: [...urls, 'https://pier.test/harbour-office'],
  });

  invariant(numbers);

  expect(numbers.size).toBe(1201);
  expect(numbers.get('https://pier.test/berth-1199')).toBe(1200);
  expect(numbers.get('https://pier.test/harbour-office')).toBe(1201);
});

test('it writes the thread each link belongs to', async () => {
  const ctx = await setupTest();

  await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    invalidatedThrough: null,
    urls: ['https://pier.test/a'],
  });

  const rows = await sql`select * from web_fetch_links`.execute(ctx.log.writer.db);

  expect(rows.rows).toStrictEqual([
    { session_key: 'session-a', number: 1, url: 'https://pier.test/a', thread: 'conversation' },
  ]);
});

test('it writes the links of a session no invalidation ended since its step began', async () => {
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

  const numbers = await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    invalidatedThrough: invalidated.sequence,
    urls: ['https://pier.test/a'],
  });

  expect(numbers?.get('https://pier.test/a')).toBe(1);
});

test('it writes nothing and returns null once an invalidation ended the session', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'model.session_invalidated',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { itemID: '00000000-0000-4000-8000-000000000001' },
    },
  ]);

  const numbers = await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    invalidatedThrough: 0,
    urls: ['https://pier.test/a'],
  });

  const rows = await sql`select * from web_fetch_links`.execute(ctx.log.writer.db);

  expect(numbers).toBeNull();
  expect(rows.rows).toStrictEqual([]);
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

  const numbers = await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    invalidatedThrough: 0,
    urls: ['https://pier.test/a'],
  });

  expect(numbers?.get('https://pier.test/a')).toBe(1);
});

test('it writes nothing for no URL', async () => {
  const ctx = await setupTest();

  const numbers = await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    invalidatedThrough: null,
    urls: [],
  });

  expect(numbers?.size).toBe(0);
});
