import { expect, test } from 'bun:test';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';
import { startTestLog } from '../test-utils/start-test-log';
import { readCachedWebFetchPage } from './read-cached-web-fetch-page';
import { writeWebFetchPage } from './write-web-fetch-page';

async function setupTest() {
  const clock = createFakeClock({ startMs: Date.parse('2026-11-02T09:00:00.000Z') });

  return { clock, log: await startTestLog(clock) };
}

test('it returns the page stored last when two matching pages share a stored time', async () => {
  const ctx = await setupTest();

  const session = { sessionKey: 'session-a', thread: 'conversation', invalidatedThrough: null };
  const limits = { textBytes: 100, linkPathChars: 24, storeBytes: 1000 };

  await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/ferries',
      fetchURL: 'https://harbour.test/ferries',
      status: 200,
      contentType: 'text/html',
      isTruncated: false,
      blocked: null,
      text: 'Ferries leave at nine.',
      links: [],
    },
    session,
    limits,
  );

  const newer = await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/ferries',
      fetchURL: 'https://harbour.test/ferries',
      status: 200,
      contentType: 'text/html',
      isTruncated: false,
      blocked: null,
      text: 'Ferries leave at ten.',
      links: [],
    },
    session,
    limits,
  );

  const read = await readCachedWebFetchPage(ctx.log, {
    sessionKey: 'session-a',
    url: 'https://harbour.test/ferries',
    storedAfter: 0,
  });

  invariant(newer);

  expect(read).toStrictEqual(newer);
});
